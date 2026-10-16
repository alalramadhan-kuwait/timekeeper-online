-- Time Keeper World 4.0, boutique pilot: tests for supabase/drafts/world_4_boutique_pilot.sql.
-- One transaction that never commits: the draft is pasted at the '-- @migration' line, the tests
-- run, and the last statement raises an error carrying the results, which aborts the transaction,
-- so nothing it created survives (the ROLLBACK after it only tidies up). Each person is
-- impersonated as the API would (SET ROLE authenticated with their token claims), using the real
-- accounts. Never write a DELETE, or an UPDATE without a WHERE, in here.

begin;

create temp table r (n serial, area text, case_name text, pass boolean, detail text);
grant all on r to public;
grant usage, select on sequence r_n_seq to public;

-- @migration

create function pg_temp.as_user(p_role text, p_sub uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims', jsonb_build_object('role', p_role, 'sub', p_sub)::text, true);
  begin
    execute p_sql into v;
  exception when others then
    v := jsonb_build_object('error', sqlerrm, 'state', sqlstate);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v, 'null'::jsonb);
end $$;

create temp table who (k text primary key, id uuid);
insert into who select 'owner', user_id from stock_ai_access order by granted_at, user_id limit 1;
insert into who select 'owner 2', user_id from stock_ai_access order by granted_at, user_id offset 1 limit 1;
insert into who select 'manager', id from profiles where role = 'manager' order by id limit 1;
insert into who select 'operations', id from profiles where role = 'operations' order by id limit 1;
insert into who select 'marketing', id from profiles where role = 'marketing' order by full_name limit 1;
insert into who select 'sales', id from profiles p where role = 'sales' order by full_name limit 1;

do $$
declare
  o uuid := (select id from who where k = 'owner');
  o2 uuid := (select id from who where k = 'owner 2');
  w record; v jsonb; b jsonb; d jsonb; saved uuid; pid text; n_expected int; n_got int;
begin
  -- ── who can reach it ──
  for w in select * from who order by k loop
    v := pg_temp.as_user('authenticated', w.id, $q$ select to_jsonb(jsonb_typeof(world_boutique('Dennison'))) $q$);
    insert into r (area, case_name, pass, detail) values ('access', 'world_boutique(): ' || w.k,
      case when w.k like 'owner%' then v = '"object"'::jsonb else v ->> 'state' = '42501' end, left(v::text, 200));
    v := pg_temp.as_user('authenticated', w.id, 'select to_jsonb(jsonb_typeof(world_discoveries()))');
    insert into r (area, case_name, pass, detail) values ('access', 'world_discoveries(): ' || w.k,
      case when w.k like 'owner%' then v = '"array"'::jsonb else v ->> 'state' = '42501' end, left(v::text, 200));
    if w.k not like 'owner%' then
      v := pg_temp.as_user('authenticated', w.id, $q$ select world_discovery_save('x', null) $q$);
      insert into r (area, case_name, pass, detail) values ('access', 'world_discovery_save(): ' || w.k, v ->> 'state' = '42501', v::text);
    end if;
    v := pg_temp.as_user('authenticated', w.id, 'select to_jsonb(count(*)) from world.discoveries');
    insert into r (area, case_name, pass, detail) values ('access', 'reading world.discoveries directly: ' || w.k, v ->> 'state' = '42501', v::text);
    v := pg_temp.as_user('authenticated', w.id, 'select to_jsonb(count(*)) from world.product_images');
    insert into r (area, case_name, pass, detail) values ('access', 'reading world.product_images directly: ' || w.k, v ->> 'state' = '42501', v::text);
  end loop;
  v := pg_temp.as_user('anon', null, $q$ select to_jsonb(jsonb_typeof(world_boutique('Dennison'))) $q$);
  insert into r (area, case_name, pass, detail) values ('access', 'world_boutique(): signed out', v ->> 'state' = '42501', v::text);
  v := pg_temp.as_user('anon', null, $q$ select world_discovery_save('x', null) $q$);
  insert into r (area, case_name, pass, detail) values ('access', 'world_discovery_save(): signed out', v ->> 'state' = '42501', v::text);

  -- ── the boutique's watches are the analyst's, unchanged ──
  b := pg_temp.as_user('authenticated', o, $q$ select world_boutique('Dennison') $q$);
  select count(*) into n_expected
    from stock_analyst_metrics(null, null) m join lightspeed_products p using (product_id)
   where m.brand = 'Dennison' and m.product_type ilike '%watch%' and m.product_type not ilike '%accessor%'
     and (m.on_hand > 0 or (p.is_active is not false and (m.u90 > 0 or m.on_order > 0)));
  n_got := jsonb_array_length(b -> 'products');
  insert into r (area, case_name, pass, detail) values ('figures', 'Dennison: every watch in stock, sold out and still selling, or on order', n_got = n_expected and n_got > 0, n_got || ' of ' || n_expected);
  insert into r (area, case_name, pass, detail)
  select 'figures', 'every in-stock Dennison watch is there', count(*) = 0, count(*) || ' missing'
    from stock_analyst_metrics(null, null) m
   where m.brand = 'Dennison' and m.product_type ilike '%watch%' and m.product_type not ilike '%accessor%' and m.on_hand > 0
     and not exists (select 1 from jsonb_array_elements(b -> 'products') x where x ->> 'product_id' = m.product_id);
  insert into r (area, case_name, pass, detail)
  select 'figures', 'stock, sales, class and cover equal stock_analyst_metrics for every watch', count(*) = 0, count(*) || ' differ'
    from jsonb_array_elements(b -> 'products') x
    join stock_analyst_metrics(null, null) m on m.product_id = x ->> 'product_id'
   where (x ->> 'on_hand')::numeric is distinct from m.on_hand or (x ->> 'u90')::numeric is distinct from m.u90
      or (x ->> 'u365')::numeric is distinct from m.u365 or x ->> 'class' is distinct from m.class
      or (x ->> 'cover_months')::numeric is distinct from m.cover_months or (x ->> 'on_order')::numeric is distinct from m.on_order;
  insert into r (area, case_name, pass, detail)
  select 'figures', 'outstanding on the open orders adds up to what the analyst has on order', bool_and(a = c), string_agg(nm || ' ' || a || '/' || c, '; ') filter (where a <> c)
    from (select x ->> 'name' nm, (x ->> 'on_order')::numeric c,
                 coalesce((select sum((po ->> 'outstanding')::numeric) from jsonb_array_elements(x -> 'open_pos') po), 0) a
            from jsonb_array_elements(b -> 'products') x) q;
  insert into r (area, case_name, pass, detail)
  select 'figures', 'no accessory or strap is shown', count(*) = 0, count(*)::text
    from jsonb_array_elements(b -> 'products') x where x ->> 'product_type' not ilike '%watch%' or x ->> 'product_type' ilike '%accessor%';
  insert into r (area, case_name, pass, detail)
  select 'figures', 'an inactive product with no stock is not shown', count(*) = 0, count(*)::text
    from jsonb_array_elements(b -> 'products') x join lightspeed_products p on p.product_id = x ->> 'product_id'
   where p.is_active is false and (x ->> 'on_hand')::numeric <= 0;

  -- ── the desk ──
  pid := (select x ->> 'product_id' from jsonb_array_elements(b -> 'products') x order by (x ->> 'u90')::numeric desc limit 1);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_discovery_save(%L, 'test note') $q$, pid));
  saved := (v ->> 'id')::uuid;
  insert into r (area, case_name, pass, detail) values ('desk', 'an owner saves a watch with a note', saved is not null, v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_discovery_save(%L, repeat('x', 301)) $q$, pid));
  insert into r (area, case_name, pass, detail) values ('desk', 'a note over 300 characters is refused', v ->> 'state' = '22023', v::text);
  v := pg_temp.as_user('authenticated', o, $q$ select world_discovery_save('not-a-product', null) $q$);
  insert into r (area, case_name, pass, detail) values ('desk', 'a product not in a boutique is refused', v ->> 'state' = 'P0002', v::text);
  d := pg_temp.as_user('authenticated', o2, 'select world_discoveries()');
  insert into r (area, case_name, pass, detail) values ('desk', 'the other owners see it on the desk',
    exists (select 1 from jsonb_array_elements(d) x where (x ->> 'id')::uuid = saved and x ->> 'note' = 'test note'), left(d::text, 200));
  insert into r (area, case_name, pass, detail)
  select 'desk', 'its saved figures equal the watch''s figures when saved', (x -> 'then' ->> 'on_hand') = (y ->> 'on_hand') and (x -> 'then' ->> 'u90') = (y ->> 'u90')
         and (x -> 'then' ->> 'class') = (y ->> 'class') and x -> 'then' ? 'taken_at', (x -> 'then')::text
    from jsonb_array_elements(d) x, jsonb_array_elements(b -> 'products') y
   where (x ->> 'id')::uuid = saved and y ->> 'product_id' = pid;
  insert into r (area, case_name, pass, detail)
  select 'desk', 'today''s figures come with it', x -> 'now' ->> 'product_id' = pid, null from jsonb_array_elements(d) x where (x ->> 'id')::uuid = saved;
  v := pg_temp.as_user('authenticated', (select id from who where k = 'manager'), format($q$ select world_discovery_archive(%L) $q$, saved));
  insert into r (area, case_name, pass, detail) values ('desk', 'a manager cannot archive it', v ->> 'state' = '42501', v::text);
  v := pg_temp.as_user('authenticated', o2, format($q$ select world_discovery_archive(%L) $q$, saved));
  insert into r (area, case_name, pass, detail) values ('desk', 'an owner archives it', v ->> 'ok' = 'true', v::text);
  d := pg_temp.as_user('authenticated', o, 'select world_discoveries()');
  insert into r (area, case_name, pass, detail) values ('desk', 'an archived discovery leaves the desk',
    not exists (select 1 from jsonb_array_elements(d) x where (x ->> 'id')::uuid = saved), null);
  insert into r (area, case_name, pass, detail)
  select 'desk', 'the history keeps both steps', count(*) = 2, string_agg(action, ', ' order by at) from world.discovery_events where discovery_id = saved;
  begin
    update world.discovery_events set note = 'x' where discovery_id = saved;
    insert into r (area, case_name, pass, detail) values ('desk', 'the desk''s history refuses changes', false, 'update went through');
  exception when others then
    insert into r (area, case_name, pass, detail) values ('desk', 'the desk''s history refuses changes', sqlstate = '42501', sqlerrm);
  end;
  insert into r (area, case_name, pass, detail)
  select 'nothing else', 'no task or notification was created', count(*) = 0, count(*)::text
    from (select 1 from assigned_tasks where created_at > now() - interval '5 minutes'
          union all select 1 from notifications where created_at > now() - interval '5 minutes' and event_type like 'task%') q;
end $$;

do $$ begin
  raise exception 'RESULTS % of % passed: %', (select count(*) filter (where pass) from r), (select count(*) from r),
    (select string_agg(case when pass then 'ok ' else 'FAIL ' end || area || ' | ' || case_name || coalesce(' | ' || detail, ''), E'\n' order by n) from r);
end $$;

rollback;
