-- Time Keeper World 4.0, boutique pilot (Dennison): the watches in a boutique, their pictures,
-- and the owners' Manager's Desk.
--
-- DRAFT, NOT APPLIED. Kept out of supabase/migrations/ until the owners approve it, so the folder
-- keeps matching what the database recorded. When approved it is applied as one migration and
-- moved there under the version the database records.
--
-- Additive and owner-only, in the world schema like the rest of the World: four new tables (closed
-- to every API role), and owner-only functions behind world_guard(). Nothing existing is altered;
-- world_snapshot() and every shared table, policy and grant stay as they are. No figure is
-- recalculated here: a watch's stock, sales, class and cover come from stock_analyst_metrics, its
-- orders from world.po_ledger and purchase_order_items, exactly as the rest of the World reads them.

-- 1. Pictures ----------------------------------------------------------------------------------
-- One row per product and source. Filled by the World-only image job (Lightspeed first, the
-- website's exact matches as a fallback, an owner's upload later). Only addresses are kept: never
-- a cost, never the picture itself.
create table if not exists world.product_images (
  product_id text not null,
  source text not null check (source in ('lightspeed', 'lightspeed_variant', 'website_ref', 'website_title', 'owner_upload')),
  source_ref text not null,             -- Lightspeed image id and version, or the website's product/image ids and stamp
  url_thumb text not null,              -- about 150 px
  url_view text not null,               -- about 350-600 px
  status text not null default 'active' check (status in ('active', 'stale', 'rejected')),
  matched_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  primary key (product_id, source)
);

create table if not exists world.product_image_events (
  id bigint generated always as identity primary key,
  product_id text not null,
  source text not null,
  action text not null check (action in ('added', 'changed', 'stale', 'rejected', 'confirmed')),
  detail jsonb,
  actor text not null,                  -- 'image job' or an owner's name
  at timestamptz not null default now()
);

-- 2. The Manager's Desk --------------------------------------------------------------------------
-- A watch an owner wanted to remember, with a note and the figures as they stood that day. The
-- snapshot is taken by the server from the same rows the boutique shows, never from the screen.
create table if not exists world.discoveries (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  brand text,
  name text not null,
  note text check (note is null or length(note) <= 300),
  snapshot jsonb not null,
  created_by uuid,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by_name text
);
create index if not exists discoveries_open on world.discoveries (created_at desc) where archived_at is null;

create table if not exists world.discovery_events (
  id bigint generated always as identity primary key,
  discovery_id uuid not null,
  action text not null check (action in ('saved', 'note', 'archived', 'restored')),
  note text,
  actor uuid,
  actor_name text not null,
  at timestamptz not null default now()
);

create or replace trigger product_image_events_append_only before update or delete on world.product_image_events
  for each row execute function world.forbid_change();
create or replace trigger discovery_events_append_only before update or delete on world.discovery_events
  for each row execute function world.forbid_change();

alter table world.product_images enable row level security;
alter table world.product_image_events enable row level security;
alter table world.discoveries enable row level security;
alter table world.discovery_events enable row level security;
revoke all on world.product_images, world.product_image_events, world.discoveries, world.discovery_events
  from public, anon, authenticated, service_role;

-- 3. A boutique's watches -------------------------------------------------------------------------
-- The watches of one brand that the boutique shows: every watch in stock, and every active watch
-- with none in stock that sold in the last 90 days or is on an open order (sold out, or on its
-- way). Watches only: Lightspeed product types with "Watch" in them, not accessories.
create or replace function world.boutique_rows(p_brand text, p_product text default null)
returns setof jsonb
language sql stable
set search_path to 'public', 'world'
as $function$
  with m as (
    select m.*, p.variant_parent_id, p.is_active
      from stock_analyst_metrics(null, null) m
      join lightspeed_products p using (product_id)
     where (p_brand is null or m.brand = p_brand)
       and (p_product is null or m.product_id = p_product)
       and m.product_type ilike '%watch%' and m.product_type not ilike '%accessor%'
       and (m.on_hand > 0 or (p.is_active is not false and (m.u90 > 0 or m.on_order > 0)))
  ),
  lines as (
    select i.ls_product_id as product_id,
           jsonb_agg(jsonb_build_object(
             'po_id', l.id, 'po_number', l.po_number, 'status', l.status, 'supplier', l.supplier,
             'ordered', i.ordered_qty, 'received', coalesce(i.received_qty, 0),
             'outstanding', greatest(i.ordered_qty - coalesce(i.received_qty, 0), 0),
             'created_date', l.created_date,
             'due_lightspeed', po.expected_arrival,
             'expected_owners', e.expected_on) order by l.created_date desc) as pos
      from purchase_order_items i
      join world.po_ledger l on l.id = i.po_id and l.open_commitment
      join purchase_orders po on po.id = l.id
      left join world.po_expected e on e.po_id = l.id
     where i.ls_product_id in (select product_id from m)
     group by i.ls_product_id
  ),
  pics as (
    -- the best active picture: Lightspeed's own, then its variant picture, then an owner's upload,
    -- then the website's matches (by reference before by title)
    select distinct on (product_id) product_id,
           jsonb_build_object('thumb', url_thumb, 'view', url_view, 'source', source) as img
      from world.product_images
     where status = 'active' and product_id in (select product_id from m)
     order by product_id, array_position(array['lightspeed', 'lightspeed_variant', 'owner_upload', 'website_ref', 'website_title'], source)
  )
  select jsonb_build_object(
           'product_id', m.product_id, 'name', m.name, 'brand', m.brand, 'product_type', m.product_type,
           'ownership', m.ownership, 'variant_parent_id', m.variant_parent_id,
           'on_hand', m.on_hand, 'negative_units', m.negative_units, 'by_outlet', m.by_outlet,
           'cost', m.cost, 'price', m.price,
           'u30', m.u30, 'u90', m.u90, 'u180', m.u180, 'u365', m.u365, 'rev90', m.rev90,
           'first_sale', m.first_sale, 'last_sale', m.last_sale,
           'pace', m.pace, 'cover_months', m.cover_months, 'sell_through', m.sell_through,
           'shelf_days', m.shelf_days, 'class', m.class, 'class_basis', m.class_basis,
           'on_order', m.on_order, 'open_pos', coalesce(lines.pos, '[]'::jsonb),
           'image', pics.img)
    from m
    left join lines using (product_id)
    left join pics using (product_id)
$function$;
revoke all on function world.boutique_rows(text, text) from public, anon, authenticated, service_role;

create or replace function public.world_boutique(p_brand text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'world'
as $function$
begin
  perform world_guard();
  return jsonb_build_object(
    'brand', p_brand,
    'generated_at', now(),
    'stock_synced_at', (select max(synced_at) from lightspeed_stock),
    'sales_through', (now() at time zone 'Asia/Kuwait')::date - 1,
    'products', coalesce((select jsonb_agg(r order by r->>'name') from world.boutique_rows(p_brand) r), '[]'::jsonb));
end $function$;

-- 4. The desk's functions -------------------------------------------------------------------------
create or replace function public.world_discovery_save(p_product_id text, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'world'
as $function$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_row jsonb;
  v_id uuid;
begin
  perform world_guard();
  if v_user is null or not stock_ai_allowed() then
    raise exception 'Only an owner can save to the desk.' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters.' using errcode = '22023';
  end if;
  select r into v_row from world.boutique_rows(null, p_product_id) r limit 1;
  if v_row is null then
    raise exception 'That watch is not in any boutique now.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(trim(full_name), ''), 'Owner') into v_name from profiles where id = v_user;
  v_name := coalesce(v_name, 'Owner');
  insert into world.discoveries (product_id, brand, name, note, snapshot, created_by, created_by_name)
  values (p_product_id, v_row->>'brand', v_row->>'name', v_note,
          v_row || jsonb_build_object('taken_at', now(), 'sales_through', (now() at time zone 'Asia/Kuwait')::date - 1),
          v_user, v_name)
  returning id into v_id;
  insert into world.discovery_events (discovery_id, action, note, actor, actor_name) values (v_id, 'saved', v_note, v_user, v_name);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

-- The desk: every open discovery, newest first, with its saved snapshot ("then") and the same
-- watch's row today ("now"; null if it has left the boutique).
create or replace function public.world_discoveries()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'world'
as $function$
begin
  perform world_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'product_id', d.product_id, 'brand', d.brand, 'name', d.name, 'note', d.note,
             'by', d.created_by_name, 'at', d.created_at, 'then', d.snapshot,
             'now', (select r from world.boutique_rows(null, d.product_id) r limit 1)) order by d.created_at desc)
      from world.discoveries d
     where d.archived_at is null), '[]'::jsonb);
end $function$;

create or replace function public.world_discovery_archive(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'world'
as $function$
declare
  v_user uuid := auth.uid();
  v_name text;
begin
  perform world_guard();
  if v_user is null or not stock_ai_allowed() then
    raise exception 'Only an owner can archive.' using errcode = '42501';
  end if;
  select coalesce(nullif(trim(full_name), ''), 'Owner') into v_name from profiles where id = v_user;
  v_name := coalesce(v_name, 'Owner');
  update world.discoveries set archived_at = now(), archived_by_name = v_name where id = p_id and archived_at is null;
  if not found then
    raise exception 'Nothing on the desk with that id.' using errcode = 'P0002';
  end if;
  insert into world.discovery_events (discovery_id, action, actor, actor_name) values (p_id, 'archived', v_user, v_name);
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.world_boutique(text) from public, anon, service_role;
revoke all on function public.world_discovery_save(text, text) from public, anon, service_role;
revoke all on function public.world_discoveries() from public, anon, service_role;
revoke all on function public.world_discovery_archive(uuid) from public, anon, service_role;
grant execute on function public.world_boutique(text) to authenticated;
grant execute on function public.world_discovery_save(text, text) to authenticated;
grant execute on function public.world_discoveries() to authenticated;
grant execute on function public.world_discovery_archive(uuid) to authenticated;

comment on function public.world_boutique(text) is
  'Time Keeper World (owners only): the watches a boutique shows (in stock, or sold out and still selling or on order), each with its stock, sales, class, open orders and best verified picture.';
comment on function public.world_discovery_save(text, text) is
  'Time Keeper World (owners only): save a watch to the Manager''s Desk with an optional note; the server keeps its figures as they stand now.';
comment on function public.world_discoveries() is
  'Time Keeper World (owners only): the Manager''s Desk, each discovery with its saved figures and today''s.';
comment on function public.world_discovery_archive(uuid) is
  'Time Keeper World (owners only): take a discovery off the desk (its history stays).';
