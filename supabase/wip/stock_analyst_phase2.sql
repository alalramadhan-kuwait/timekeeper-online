-- WORK IN PROGRESS, NOT APPLIED. Stock analyst Phase 2 calculations, drafted and tested
-- against live data in rolled-back transactions. Becomes one migration when Phase 2 is done.

-- Lightspeed's stock locations and the sales channels each one serves, by the
-- outlet codes the rest of the system uses. The HQ stock ("Time Keeper") is
-- what online and WhatsApp orders ship from.
create function public.stock_outlet_name(p_outlet text) returns text
language sql immutable as $$
  select case lower(trim(coalesce(p_outlet, '')))
    when '' then null
    when 'avenues' then 'Time Keeper - Avenues'
    when 'time_gallery' then 'Time Gallery'
    when 'timegallery' then 'Time Gallery'
    when 'hq' then 'Time Keeper'
    when 'online' then 'Time Keeper'
    when 'whatsapp' then 'Time Keeper'
    else p_outlet end
$$;

create function public.stock_outlet_scopes(p_outlet text) returns text[]
language sql immutable as $$
  select case stock_outlet_name(p_outlet)
    when 'Time Keeper - Avenues' then array['avenues']
    when 'Time Gallery' then array['time_gallery']
    when 'Time Keeper' then array['online', 'whatsapp']
  end
$$;

-- One row per product: everything the stock analyst knows about it on p_as_of,
-- using only what was known by the end of that day.
--
--   * Sales are net of returns (a return is its own sale with negative
--     quantities), counted sales only, services and discount lines left out.
--   * Stock is Lightspeed's actual figure when p_as_of is the day before the
--     morning stock sync (the default). For an earlier day it is rebuilt from
--     today's stock: plus what sold since, minus what purchase orders received
--     since. Transfers and adjustments are not in our data, so a rebuilt figure
--     is labelled 'reconstructed' and never presented as actual stock.
--   * Cost and price are today's: past costs are not stored.
--   * With p_outlet, stock is that location's and sales are that outlet's: the
--     shops by their own till, the HQ stock by online and WhatsApp sales, which
--     ship from it. Purchase orders count where they were received (mostly HQ).
--   * Stock age is from the order date of the last purchase order that
--     received the product (the receipt date is not stored), or, for stock that
--     never came on a purchase order (pre-owned pieces), the day the product was
--     created in Lightspeed: an estimate either way.
-- Every stock-analyst calculation starts here: the backend (service role), a
-- listed owner, or a direct database session (cron, migrations). Anyone else
-- is refused before any figure is read.
create function public.stock_analyst_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or stock_ai_allowed() or session_user = 'postgres' then
    return;
  end if;
  raise exception 'The stock analyst is limited to the owners.' using errcode = '42501';
end $$;

create function public.stock_analyst_facts(p_as_of date default null, p_outlet text default null)
returns table (
  product_id text, name text, brand text, supplier text, product_type text, ownership text,
  stock_basis text, on_hand numeric, negative_units numeric, by_outlet jsonb,
  cost numeric, price numeric, stock_cost_value numeric, stock_retail_value numeric,
  on_order numeric,
  u30 numeric, u90 numeric, u180 numeric, u365 numeric,
  rev90 numeric, rev180 numeric, rev365 numeric,
  list_value90 numeric,
  first_sale date, last_sale date, last_receipt_order date,
  best_month_share numeric, product_created date
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform stock_analyst_guard();
  return query
with
asof as (
  select coalesce(p_as_of, (now() at time zone 'Asia/Kuwait')::date - 1) d,
         (select max(synced_at) from lightspeed_stock) stock_synced,
         stock_outlet_name(p_outlet) stock_outlet,
         stock_outlet_scopes(p_outlet) scopes
),
live as (   -- is p_as_of the day this morning's stock describes?
  select (a.d >= ((a.stock_synced at time zone 'Asia/Kuwait')::date - 1)) is_live from asof a
),
lines as (
  select i.product_id, s.sale_day, s.scope_code, i.quantity q, i.price_total kd,
         coalesce(i.price, 0) * i.quantity list_kd
    from lightspeed_sale_items i
    join lightspeed_sales s on s.id = i.sale_id
    cross join asof a
   where s.status = any (lightspeed_sale_counts())
     and coalesce(i.status, 'CONFIRMED') <> 'VOIDED'
     and i.product_id is not null
     and s.sale_day <= a.d
     and (a.scopes is null or s.scope_code = any (a.scopes))
),
sold as (
  select l.product_id,
         sum(q) filter (where sale_day > a.d - 30)  u30,
         sum(q) filter (where sale_day > a.d - 90)  u90,
         sum(q) filter (where sale_day > a.d - 180) u180,
         sum(q) filter (where sale_day > a.d - 365) u365,
         sum(kd) filter (where sale_day > a.d - 90)  rev90,
         sum(kd) filter (where sale_day > a.d - 180) rev180,
         sum(kd) filter (where sale_day > a.d - 365) rev365,
         sum(list_kd) filter (where sale_day > a.d - 90 and q > 0) list_value90,
         min(sale_day) filter (where q > 0) first_sale,
         max(sale_day) filter (where q > 0) last_sale
    from lines l, asof a group by l.product_id
),
months as (
  select l.product_id, date_trunc('month', sale_day) m, sum(q) q
    from lines l, asof a where sale_day > a.d - 365 group by 1, 2
),
spike as (select product_id, max(q) best from months group by 1),
-- sold after p_as_of, to rebuild past stock
sold_after as (
  select i.product_id, sum(i.quantity) q
    from lightspeed_sale_items i join lightspeed_sales s on s.id = i.sale_id cross join asof a
   where s.status = any (lightspeed_sale_counts()) and coalesce(i.status, 'CONFIRMED') <> 'VOIDED'
     and s.sale_day > a.d and not (select is_live from live)
     and (a.scopes is null or s.scope_code = any (a.scopes))
   group by 1
),
recv_after as (
  select poi.ls_product_id product_id, sum(poi.received_qty) q
    from purchase_order_items poi join purchase_orders po on po.id = poi.po_id
   where po.created_date > (select d from asof) and not (select is_live from live)
     and ((select stock_outlet from asof) is null or coalesce(po.outlet, 'Time Keeper') = (select stock_outlet from asof))
   group by 1
),
receipts as (
  select poi.ls_product_id product_id, max(po.created_date) last_order
    from purchase_order_items poi join purchase_orders po on po.id = poi.po_id
   where poi.received_qty > 0 and po.created_date <= (select d from asof)
   group by 1
),
open_orders as (
  select poi.ls_product_id product_id, sum(greatest(poi.ordered_qty - coalesce(poi.received_qty, 0), 0)) q
    from purchase_order_items poi join purchase_orders po on po.id = poi.po_id
   where po.status in ('Ordered', 'Pending Approval', 'Partially Received')
     and po.created_date <= (select d from asof)
     and ((select stock_outlet from asof) is null or coalesce(po.outlet, 'Time Keeper') = (select stock_outlet from asof))
   group by 1
),
stock_now as (
  select s.product_id, s.outlet, s.stock_on_hand q, s.price, c.cost
    from lightspeed_stock s left join lightspeed_stock_cost c using (product_id, outlet)
   where (select stock_outlet from asof) is null or s.outlet = (select stock_outlet from asof)
),
stock as (
  select sn.product_id,
         sum(greatest(sn.q, 0)) on_hand_now,
         sum(least(sn.q, 0)) negative_units,
         jsonb_object_agg(sn.outlet, sn.q) filter (where sn.q <> 0) by_outlet,
         max(sn.price) price,
         case when sum(greatest(sn.q, 0)) > 0
              then sum(greatest(sn.q, 0) * sn.cost) / nullif(sum(greatest(sn.q, 0)) filter (where sn.cost is not null), 0)
              else avg(sn.cost) filter (where sn.cost > 0) end cost,
         sum(greatest(sn.q, 0) * sn.cost) cost_value,
         sum(greatest(sn.q, 0) * sn.price) retail_value
    from stock_now sn group by 1
),
ids as (
  select product_id from stock union select product_id from sold
)
select ids.product_id,
       coalesce(lp.name, st_name.name) name,
       coalesce(lp.brand, st_name.brand) brand,
       coalesce(lp.supplier, st_name.supplier) supplier,
       lp.product_type,
       coalesce(lp.ownership, 'unknown') ownership,
       case when (select is_live from live) then 'actual' else 'reconstructed' end stock_basis,
       case when (select is_live from live) then coalesce(st.on_hand_now, 0)
            else greatest(coalesce(st.on_hand_now, 0) + coalesce(sa.q, 0) - coalesce(ra.q, 0), 0) end on_hand,
       coalesce(st.negative_units, 0),
       case when (select is_live from live) then st.by_outlet end,
       st.cost, st.price,
       case when (select is_live from live) then coalesce(st.cost_value, 0) end,
       case when (select is_live from live) then coalesce(st.retail_value, 0) end,
       coalesce(oo.q, 0),
       coalesce(so.u30, 0), coalesce(so.u90, 0), coalesce(so.u180, 0), coalesce(so.u365, 0),
       coalesce(so.rev90, 0), coalesce(so.rev180, 0), coalesce(so.rev365, 0),
       coalesce(so.list_value90, 0),
       so.first_sale, so.last_sale, rc.last_order,
       case when coalesce(so.u365, 0) > 0 then round(sp.best / so.u365, 3) end,
       (lp.ls_created_at at time zone 'Asia/Kuwait')::date
  from ids
  left join lightspeed_products lp on lp.product_id = ids.product_id
  left join lateral (select max(name) name, max(brand) brand, max(supplier) supplier
                       from lightspeed_stock x where x.product_id = ids.product_id) st_name on true
  left join stock st on st.product_id = ids.product_id
  left join sold so on so.product_id = ids.product_id
  left join spike sp on sp.product_id = ids.product_id
  left join sold_after sa on sa.product_id = ids.product_id
  left join recv_after ra on ra.product_id = ids.product_id
  left join receipts rc on rc.product_id = ids.product_id
  left join open_orders oo on oo.product_id = ids.product_id
 where coalesce(lp.ownership, 'unknown') <> 'service';
end $$;

-- The facts, plus what the analyst reads from them, with the rule that put
-- each product in its class. Classes are judged against the product's own
-- kind; ownership is carried through so callers keep owned stock, consignment
-- and pre-owned apart.
--
--   pace           lower of (sold in 90 days / 3) and (sold in 180 days / 6), per month
--   cover          (stock + on order) / pace, in months
--   sell_through   sold in 180 days / (sold in 180 days + stock now)
--   margin         (price - cost) / price, on today's price and cost
--   discount       how far the till price fell below list price over 90 days
--   shelf_days     days since the order date of the last purchase order that
--                  received it, else since it was created in Lightspeed
--                  (estimated either way: receipt dates are not stored)
--
-- Classes, first rule met wins:
--   not_stocked   no stock
--   unclassified  no date it arrived and never sold
--   dead          no sale in 180 days and on the shelf 180+ days
--   new           first sold, or (never sold) arrived, in the last 90 days:
--                 too early to judge. A restock of an established model is
--                 judged on its record, not as new.
--   slow          no sale in 90 days, or more than 12 months of cover
--   fast          3 months of cover or less and at least 2 sold in 90 days
--   healthy       everything else
create function public.stock_analyst_metrics(p_as_of date default null, p_outlet text default null)
returns table (
  product_id text, name text, brand text, supplier text, product_type text, ownership text,
  stock_basis text, on_hand numeric, negative_units numeric, by_outlet jsonb,
  cost numeric, price numeric, stock_cost_value numeric, stock_retail_value numeric, on_order numeric,
  u30 numeric, u90 numeric, u180 numeric, u365 numeric, rev90 numeric, rev180 numeric, rev365 numeric,
  first_sale date, last_sale date, last_receipt_order date, best_month_share numeric, product_created date,
  pace numeric, cover_months numeric, sell_through numeric, margin numeric, discount numeric,
  shelf_days integer, months_on_sale numeric, class text, class_basis text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare d date := coalesce(p_as_of, (now() at time zone 'Asia/Kuwait')::date - 1);
begin
  perform stock_analyst_guard();
  return query
  with f as (select * from stock_analyst_facts(d, p_outlet)),
  m as (
    select f.*,
           round(least(f.u90 / 3.0, f.u180 / 6.0), 2) pace,
           case when f.on_hand + f.on_order <= 0 then 0
                when least(f.u90 / 3.0, f.u180 / 6.0) > 0
                  then round((f.on_hand + f.on_order) / least(f.u90 / 3.0, f.u180 / 6.0), 1) end cover_months,
           case when f.u180 + f.on_hand > 0 and f.u180 >= 0 then round(f.u180 / (f.u180 + f.on_hand), 3) end sell_through,
           case when f.price > 0 and f.cost is not null then round((f.price - f.cost) / f.price, 3) end margin,
           case when f.list_value90 > 0 and f.rev90 > 0 then round(1 - f.rev90 / f.list_value90, 3) end discount,
           (d - coalesce(f.last_receipt_order, f.product_created))::int shelf_days,
           case when f.first_sale is not null then round((d - f.first_sale) / 30.4, 1) end months_on_sale
      from f
  )
  select m.product_id, m.name, m.brand, m.supplier, m.product_type, m.ownership,
         m.stock_basis, m.on_hand, m.negative_units, m.by_outlet,
         m.cost, m.price, m.stock_cost_value, m.stock_retail_value, m.on_order,
         m.u30, m.u90, m.u180, m.u365, m.rev90, m.rev180, m.rev365,
         m.first_sale, m.last_sale, m.last_receipt_order, m.best_month_share, m.product_created,
         m.pace, m.cover_months, m.sell_through, m.margin, m.discount, m.shelf_days, m.months_on_sale,
         case
           when m.on_hand <= 0 then 'not_stocked'
           when m.shelf_days is null and m.last_sale is null then 'unclassified'
           when coalesce(m.u180, 0) <= 0 and coalesce(m.last_sale, '1900-01-01'::date) <= d - 180
                and coalesce(m.shelf_days, 9999) >= 180 then 'dead'
           when m.first_sale > d - 90 or (m.first_sale is null and m.shelf_days < 90) then 'new'
           when coalesce(m.u90, 0) <= 0 or m.cover_months > 12 then 'slow'
           when m.cover_months <= 3 and m.u90 >= 2 then 'fast'
           else 'healthy'
         end,
         case
           when m.on_hand <= 0 then 'no stock'
           when m.shelf_days is null and m.last_sale is null then 'no record of when it arrived, and never sold'
           when coalesce(m.u180, 0) <= 0 and coalesce(m.last_sale, '1900-01-01'::date) <= d - 180
                and coalesce(m.shelf_days, 9999) >= 180 then
             case when m.shelf_days is null
                  then 'no sale in 180 days; when it arrived is unknown (estimated)'
                  else 'no sale in 180 days, on the shelf about ' || m.shelf_days || ' days (estimated)' end
           when m.first_sale > d - 90 then 'first sold ' || (d - m.first_sale) || ' days ago: too early to judge'
           when m.first_sale is null and m.shelf_days < 90 then 'arrived about ' || m.shelf_days || ' days ago, not sold yet: too early to judge'
           when coalesce(m.u90, 0) <= 0 then 'no sale in 90 days'
           when m.cover_months > 12 then m.cover_months || ' months of cover at its current pace'
           when m.cover_months <= 3 and m.u90 >= 2 then m.cover_months || ' months of cover, ' || m.u90 || ' sold in 90 days'
           else 'selling ' || m.pace || ' a month, ' || coalesce(m.cover_months::text, '?') || ' months of cover'
         end
    from m;
end $$;

-- What every answer states first: when the stock and sales it rests on were
-- last brought in from Lightspeed, and the last full day of sales it counts.
create function public.stock_analyst_header(p_as_of date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_as_of, (now() at time zone 'Asia/Kuwait')::date - 1);
        stock_at timestamptz; sales_at timestamptz;
begin
  perform stock_analyst_guard();
  select max(synced_at) into stock_at from lightspeed_stock;
  select max(finished_at) into sales_at from lightspeed_sync_log where kind = 'sales' and status = 'ok';
  return jsonb_build_object(
    'sales_through', d,
    'stock_as_of', to_char(stock_at at time zone 'Asia/Kuwait', 'YYYY-MM-DD HH24:MI'),
    'sales_synced', to_char(sales_at at time zone 'Asia/Kuwait', 'YYYY-MM-DD HH24:MI'),
    'stock_basis', case when d >= (stock_at at time zone 'Asia/Kuwait')::date - 1 then 'actual' else 'reconstructed' end,
    'timezone', 'Kuwait');
end $$;

-- How much stock there is and what it is worth, owned stock kept apart from
-- consignment and pre-owned. Only owned stock is "money tied up".
create function public.stock_summary(p_brand text default null, p_outlet text default null,
                                     p_product_type text default null, p_as_of date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_as_of, (now() at time zone 'Asia/Kuwait')::date - 1);
        o text := stock_outlet_name(p_outlet); res jsonb;
begin
  perform stock_analyst_guard();
  with m as (
    select * from stock_analyst_metrics(d, p_outlet) x
     where (p_brand is null or lower(x.brand) = lower(p_brand) or x.brand ilike p_brand || '%')
       and (p_product_type is null or lower(x.product_type) = lower(p_product_type))
  ),
  -- stock rows per location (actual stock only); with an outlet, only that one
  s as (
    select ls.outlet, ls.product_id, greatest(ls.stock_on_hand, 0) q, ls.stock_on_hand raw_q, c.cost, ls.price,
           m.ownership, m.product_type, m.class
      from lightspeed_stock ls
      join m on m.product_id = ls.product_id
      left join lightspeed_stock_cost c on c.product_id = ls.product_id and c.outlet = ls.outlet
     where o is null or ls.outlet = o
  ),
  own as (
    select ownership,
           count(distinct product_id) filter (where q > 0) products,
           sum(q) units,
           round(sum(q * cost)) cost_value,
           round(sum(q * price)) retail_value,
           count(distinct product_id) filter (where q > 0 and cost is null) no_cost
      from s group by ownership
  ),
  types as (
    select ownership, coalesce(product_type, 'Type not set') product_type,
           count(distinct product_id) filter (where q > 0) products, sum(q) units, round(sum(q * cost)) cost_value
      from s group by 1, 2
  ),
  outlets as (
    select outlet, ownership, sum(q) units, round(sum(q * cost)) cost_value from s group by 1, 2
  ),
  classes as (
    select ownership, class, count(distinct product_id) filter (where q > 0) products, sum(q) units,
           round(sum(q * cost)) cost_value
      from s where q > 0 group by 1, 2
  ),
  sales as (
    select ownership, sum(u90) u90, round(sum(rev90)) rev90, sum(u365) u365, round(sum(rev365)) rev365 from m group by 1
  ),
  issues as (
    select count(distinct product_id) filter (where raw_q < 0) negative_products,
           sum(raw_q) filter (where raw_q < 0) negative_units,
           count(distinct product_id) filter (where q > 0 and cost is null) no_cost_products,
           count(distinct product_id) filter (where q > 0 and cost > price) below_cost_products,
           count(distinct product_id) filter (where q > 0 and ownership = 'unknown') untyped_products
      from s
  )
  select jsonb_build_object(
    'header', stock_analyst_header(d) || jsonb_build_object('filters',
        jsonb_strip_nulls(jsonb_build_object('brand', p_brand, 'outlet', o, 'product_type', p_product_type))),
    'by_ownership', (select jsonb_object_agg(own.ownership, jsonb_build_object(
          'products', own.products, 'units', own.units, 'cost_value', own.cost_value, 'retail_value', own.retail_value,
          'products_without_cost', own.no_cost,
          'sold_90d', sa.u90, 'revenue_90d', sa.rev90, 'sold_365d', sa.u365, 'revenue_365d', sa.rev365,
          'confidence', 'accurate',
          'note', case own.ownership
                    when 'owned' then 'your money tied up in stock'
                    when 'consignment' then 'supplier''s stock held on consignment, not your capital'
                    when 'pre_owned' then 'one-off pre-owned pieces'
                    when 'unknown' then 'product type not set in Lightspeed'
                  end))
        from own left join sales sa on sa.ownership = own.ownership),
    'by_type', (select jsonb_agg(t order by t.cost_value desc nulls last) from types t where t.units > 0),
    'by_outlet', (select jsonb_agg(x order by x.outlet, x.ownership) from outlets x where x.units > 0),
    'by_class', (select jsonb_agg(c order by c.ownership, c.cost_value desc nulls last) from classes c),
    'class_confidence', 'estimated (time on the shelf comes from purchase-order dates)',
    'data_issues', (select to_jsonb(i) from issues i),
    'sales_scope', coalesce(array_to_string(stock_outlet_scopes(p_outlet), ', '), 'all outlets and channels'),
    'products_matched', (select count(*) from m where on_hand > 0)
  ) into res;
  return res;
end $$;
