-- Time Keeper World: reconciliation checks. Read-only; run after the migration.
-- Every World figure is compared with the system staff already use for it:
--   stock      -> stock_summary()        (what Ask Mohammed reports)
--   payments   -> po_summary()           (the Supplier Payments cards)
--   commitments-> po_summary()
--   advice     -> stock_recommendations()(Ask Mohammed's buy / ask-supplier advice)
--   records    -> purchase_orders itself

begin;
create temp table rc (n serial, check_name text, expected text, actual text, pass boolean);
set transaction read only;     -- from here on nothing but the temp results table can be written

do $$
declare
  s jsonb; s2 jsonb; ss jsonb; ps json; o text; t0 timestamptz; ms int;
  src_before text; src_after text;
begin
  select md5(string_agg(t::text, '|' order by t::text)) || md5((select string_agg(i::text, '|' order by i::text) from purchase_order_items i))
    into src_before from purchase_orders t;

  s := world_snapshot();
  ps := po_summary();

  -- R1-R2. Stock floor = Ask Mohammed's stock summary, for every outlet.
  foreach o in array array['', 'avenues', 'time_gallery', 'hq'] loop
    t0 := clock_timestamp();
    s2 := world_snapshot(nullif(o, ''));
    ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
    insert into rc (check_name, expected, actual, pass)
    values ('R14 snapshot speed, outlet ' || coalesce(nullif(o, ''), 'all'), '< 3000 ms', ms || ' ms', ms < 3000);
    ss := stock_summary(null, nullif(o, ''));
    insert into rc (check_name, expected, actual, pass)
    select 'R1 floor = stock summary: ' || coalesce(nullif(o, ''), 'all') || ' / ' || k,
           (v ->> 'products') || ' products, ' || (v ->> 'units') || ' units, ' || round((v ->> 'cost_value')::numeric) || ' KD',
           coalesce((s2 -> 'floor' -> 'totals' -> k ->> 'products'), '0') || ' products, '
             || coalesce((s2 -> 'floor' -> 'totals' -> k ->> 'units'), '0') || ' units, '
             || round(coalesce((s2 -> 'floor' -> 'totals' -> k ->> 'cost_value')::numeric, 0)) || ' KD',
           (v ->> 'products')::int = coalesce((s2 -> 'floor' -> 'totals' -> k ->> 'products')::int, 0)
             and (v ->> 'units')::numeric = coalesce((s2 -> 'floor' -> 'totals' -> k ->> 'units')::numeric, 0)
             and abs((v ->> 'cost_value')::numeric - coalesce((s2 -> 'floor' -> 'totals' -> k ->> 'cost_value')::numeric, 0)) < 1
    from jsonb_each(case jsonb_typeof(ss -> 'by_ownership') when 'object' then ss -> 'by_ownership' else '{}'::jsonb end) x(k, v)
    where (v ->> 'products')::int > 0;
    insert into rc (check_name, expected, actual, pass)
    select 'R2 shelves add up to the floor total: ' || coalesce(nullif(o, ''), 'all'),
           round(sum((v ->> 'cost_value')::numeric), 3)::text,
           (select round(sum((x ->> 'cost_value')::numeric), 3) from jsonb_array_elements(s2 -> 'floor' -> 'shelves') x)::text,
           -- each shelf and each total is rounded to the fils, so allow half a fils per shelf
           abs(coalesce(sum((v ->> 'cost_value')::numeric), 0)
               - coalesce((select sum((x ->> 'cost_value')::numeric) from jsonb_array_elements(s2 -> 'floor' -> 'shelves') x), 0))
             <= 0.0005 * (select count(*) from jsonb_array_elements(s2 -> 'floor' -> 'shelves')) + 0.0005
    from jsonb_each(coalesce(s2 -> 'floor' -> 'totals', '{}'::jsonb)) t(k, v);
  end loop;

  -- R2b. Class split = stock summary by class (all outlets).
  ss := stock_summary();
  insert into rc (check_name, expected, actual, pass)
  select 'R2 class split = stock summary: ' || (c ->> 'ownership') || ' / ' || (c ->> 'class'),
         round((c ->> 'cost_value')::numeric)::text,
         round(coalesce((s -> 'floor' -> 'totals' -> (c ->> 'ownership') -> 'classes' -> (c ->> 'class') ->> 'cost_value')::numeric, 0))::text,
         abs((c ->> 'cost_value')::numeric
             - coalesce((s -> 'floor' -> 'totals' -> (c ->> 'ownership') -> 'classes' -> (c ->> 'class') ->> 'cost_value')::numeric, 0)) < 1
  from jsonb_array_elements(case jsonb_typeof(ss -> 'by_class') when 'array' then ss -> 'by_class' else '[]'::jsonb end) c;

  -- R3-R6. Payments = Supplier Payments.
  insert into rc (check_name, expected, actual, pass) values
   ('R3 recorded unpaid total = Supplier Payments owed', (ps ->> 'owed_kd')::numeric::text, s -> 'payments' ->> 'total',
     abs((ps ->> 'owed_kd')::numeric - (s -> 'payments' ->> 'total')::numeric) < 0.001),
   ('R4 unpaid PO count = Supplier Payments count less sub-fils residue',
     ((ps ->> 'owed_count')::int - coalesce((select (x ->> 'records')::int from jsonb_array_elements(s -> 'data_issues') x where x ->> 'code' = 'balance_rounding_residue'), 0))::text,
     s -> 'payments' ->> 'pos',
     (ps ->> 'owed_count')::int - coalesce((select (x ->> 'records')::int from jsonb_array_elements(s -> 'data_issues') x where x ->> 'code' = 'balance_rounding_residue'), 0)
       = (s -> 'payments' ->> 'pos')::int),
   ('R5 received + not yet received = total', s -> 'payments' ->> 'total',
     ((s -> 'payments' ->> 'goods_received')::numeric + (s -> 'payments' ->> 'goods_not_received')::numeric)::text,
     abs((s -> 'payments' ->> 'goods_received')::numeric + (s -> 'payments' ->> 'goods_not_received')::numeric
         - (s -> 'payments' ->> 'total')::numeric) < 0.001),
   ('R6 supplier rows add up to the total', s -> 'payments' ->> 'total',
     (select sum((x ->> 'recorded_unpaid')::numeric) from jsonb_array_elements(s -> 'payments' -> 'by_supplier') x)::text,
     abs((select sum((x ->> 'recorded_unpaid')::numeric) from jsonb_array_elements(s -> 'payments' -> 'by_supplier') x)
         - (s -> 'payments' ->> 'total')::numeric) < 0.001);

  -- R7. Commitments = Supplier Payments "awaiting receipt".
  insert into rc (check_name, expected, actual, pass) values
   ('R7 open POs = awaiting receipt count', ps ->> 'receipt_count', s -> 'commitments' ->> 'open_pos',
     (ps ->> 'receipt_count')::int = (s -> 'commitments' ->> 'open_pos')::int),
   ('R7 open PO value = awaiting receipt KD', round((ps ->> 'receipt_kd')::numeric, 3)::text, s -> 'commitments' ->> 'open_po_value',
     abs((ps ->> 'receipt_kd')::numeric - (s -> 'commitments' ->> 'open_po_value')::numeric) < 0.001);

  -- R8-R9. Every PO record is kept and reachable.
  insert into rc (check_name, expected, actual, pass) values
   ('R8 every PO record is in the World', (select count(*) from purchase_orders)::text, s -> 'meta' -> 'po' ->> 'records',
     (select count(*) from purchase_orders) = (s -> 'meta' -> 'po' ->> 'records')::int),
   ('R8 active + cancelled + merged = all records', s -> 'meta' -> 'po' ->> 'records',
     ((s -> 'meta' -> 'po' ->> 'active')::int + (s -> 'meta' -> 'po' ->> 'cancelled')::int + (s -> 'meta' -> 'po' ->> 'merged')::int)::text,
     (s -> 'meta' -> 'po' ->> 'active')::int + (s -> 'meta' -> 'po' ->> 'cancelled')::int + (s -> 'meta' -> 'po' ->> 'merged')::int
       = (s -> 'meta' -> 'po' ->> 'records')::int),
   ('R8 search with no filter finds every record', (select count(*) from purchase_orders)::text,
     world_po_search(null, null, null, null, null, null, 1, 0) ->> 'total',
     (select count(*) from purchase_orders) = (world_po_search(null, null, null, null, null, null, 1, 0) ->> 'total')::int),
   ('R8 merged records are searchable', (select count(*) from purchase_orders where merged_into is not null)::text,
     world_po_search(null, 'merged', null, null, null, null, 1, 0) ->> 'total',
     (select count(*) from purchase_orders where merged_into is not null) = (world_po_search(null, 'merged', null, null, null, null, 1, 0) ->> 'total')::int),
   ('R8 cancelled records are searchable', (select count(*) from purchase_orders where merged_into is null and status = 'Cancelled')::text,
     world_po_search(null, 'cancelled', null, null, null, null, 1, 0) ->> 'total',
     (select count(*) from purchase_orders where merged_into is null and status = 'Cancelled')
       = (world_po_search(null, 'cancelled', null, null, null, null, 1, 0) ->> 'total')::int),
   ('R9 every merged record points at a PO that exists', '0',
     (select count(*) from purchase_orders p where p.merged_into is not null
        and not exists (select 1 from purchase_orders t where t.id = p.merged_into))::text,
     not exists (select 1 from purchase_orders p where p.merged_into is not null
        and not exists (select 1 from purchase_orders t where t.id = p.merged_into))),
   ('R9 merged and cancelled records add nothing to money totals', '0',
     (select count(*) from jsonb_array_elements(s -> 'payments' -> 'list') x
       join purchase_orders p on p.id = (x ->> 'po_id')::uuid where p.merged_into is not null or p.status = 'Cancelled')::text,
     not exists (select 1 from jsonb_array_elements(s -> 'payments' -> 'list') x
       join purchase_orders p on p.id = (x ->> 'po_id')::uuid where p.merged_into is not null or p.status = 'Cancelled'));

  -- R10. The data issues found in the audit (as of 9 Oct 2026; counts fall as records are fixed).
  insert into rc (check_name, expected, actual, pass)
  select 'R10 data issue ' || e.code, e.n::text,
         coalesce((select x ->> 'records' from jsonb_array_elements(s -> 'data_issues') x where x ->> 'code' = e.code), '0'),
         e.n::text = coalesce((select x ->> 'records' from jsonb_array_elements(s -> 'data_issues') x where x ->> 'code' = e.code), '0')
  from (values ('paid_far_above_cost', 3), ('paid_above_cost', 1), ('payment_label_mismatch', 2),
               ('marked_received_but_short', 1), ('supplier_missing', 33), ('supplier_spelling', 4),
               ('balance_rounding_residue', 9), ('ownership_not_set', 6)) e(code, n);
  insert into rc (check_name, expected, actual, pass)
  select 'R10 named records flagged',
         'MAI-1990, MAI-2057, MAI-2091, MAI-307, MAI-417, MAI-554, TKA-35',
         string_agg(distinct i ->> 'ref_label', ', ' order by i ->> 'ref_label'),
         string_agg(distinct i ->> 'ref_label', ', ' order by i ->> 'ref_label') = 'MAI-1990, MAI-2057, MAI-2091, MAI-307, MAI-417, MAI-554, TKA-35'
  from jsonb_array_elements(s -> 'data_issues') x, jsonb_array_elements(x -> 'items') i
  where x ->> 'severity' in ('unreliable', 'check');

  -- R11. Old unpaid POs flagged for review (more than 45 days since the PO date).
  insert into rc (check_name, expected, actual, pass)
  select 'R11 POs flagged for review',
         (select string_agg(po_number, ', ' order by po_number) from purchase_orders
           where merged_into is null and status <> 'Cancelled' and coalesce(total_cost, 0) - coalesce(amount_paid, 0) > 0.0005
             and (now() at time zone 'Asia/Kuwait')::date - created_date > 45),
         string_agg(x ->> 'po_number', ', ' order by x ->> 'po_number'),
         (select string_agg(po_number, ', ' order by po_number) from purchase_orders
           where merged_into is null and status <> 'Cancelled' and coalesce(total_cost, 0) - coalesce(amount_paid, 0) > 0.0005
             and (now() at time zone 'Asia/Kuwait')::date - created_date > 45)
           is not distinct from string_agg(x ->> 'po_number', ', ' order by x ->> 'po_number')
  from jsonb_array_elements(s -> 'payments' -> 'list') x where (x ->> 'review')::boolean;

  -- R12. Missions carry exactly Ask Mohammed's advice.
  insert into rc (check_name, expected, actual, pass)
  select 'R12 reorder missions cover every buy / your-call item', r.n::text, m.n::text, r.n = m.n
  from (select count(*) n from stock_recommendations(null, null, 3) where action in ('buy', 'your_call') and ownership = 'owned') r,
       (select coalesce(sum((x -> 'params' ->> 'products')::int), 0) n from jsonb_array_elements(s -> 'missions') x where x ->> 'kind' = 'reorder') m;
  insert into rc (check_name, expected, actual, pass)
  select 'R12 supplier missions cover every ask-the-supplier item', r.n::text, m.n::text, r.n = m.n
  from (select count(*) n from stock_recommendations(null, null, 3) where action in ('ask_supplier_for_more', 'ask_supplier_to_swap')) r,
       (select coalesce(sum((x -> 'params' ->> 'ask_for_more')::int + (x -> 'params' ->> 'ask_to_swap')::int), 0) n
        from jsonb_array_elements(s -> 'missions') x where x ->> 'kind' = 'supplier_talk') m;

  -- R13. One consistent snapshot: two calls without a sync in between agree exactly.
  s2 := world_snapshot();
  insert into rc (check_name, expected, actual, pass) values
   ('R13 same snapshot key on a repeat call', s -> 'meta' ->> 'snapshot_key', s2 -> 'meta' ->> 'snapshot_key',
     s -> 'meta' ->> 'snapshot_key' = s2 -> 'meta' ->> 'snapshot_key'),
   ('R13 identical figures on a repeat call', 'identical', case when (s - 'meta') = (s2 - 'meta') then 'identical' else 'different' end,
     (s - 'meta') = (s2 - 'meta'));

  -- R15. Nothing in the source records changed.
  select md5(string_agg(t::text, '|' order by t::text)) || md5((select string_agg(i::text, '|' order by i::text) from purchase_order_items i))
    into src_after from purchase_orders t;
  insert into rc (check_name, expected, actual, pass)
  values ('R15 purchase orders untouched by the World', 'unchanged',
          case when src_before = src_after then 'unchanged' else 'CHANGED' end, src_before = src_after);

  insert into rc (check_name, expected, actual, pass)
  values ('R14 snapshot size', '< 150 KB', round(octet_length(s::text) / 1024.0) || ' KB', octet_length(s::text) < 150 * 1024);
end $$;

select jsonb_build_object(
  'passed', (select count(*) from rc where pass), 'failed', (select count(*) from rc where pass is not true),
  'checks', (select jsonb_agg(jsonb_build_array(case when pass then 'PASS' else 'FAIL' end, check_name, expected, actual) order by n) from rc)) res;
rollback;
