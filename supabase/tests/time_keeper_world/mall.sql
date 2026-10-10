-- Time Keeper World, the Watch Mall: tests.
-- One transaction that ends in ROLLBACK: nothing it creates survives.
-- Each person is impersonated as the API would (SET ROLE authenticated with their token claims),
-- using the real accounts: an owner, the admin who is not an owner, a manager, a salesperson and
-- a marketing account.
--
-- Before the migration is applied, run it with the migration pasted at the '-- @migration' line:
-- the permission fingerprint and world_snapshot() are then compared before and after it.
-- After it is applied, replace the fp_before rows with the values saved before it, and skip the
-- snapshot comparison (its definition is covered by the fingerprint's "function definitions").
-- Never write a DELETE, or an UPDATE without a WHERE, in here: the Supabase SQL tool then waits
-- for a confirmation and times out.
--
-- 2026-10-10, after applying 20261010060135..20261010061220: 61/61, every permission category
-- unchanged against the fingerprint taken before.

begin;

create temp table r (n serial, area text, case_name text, pass boolean, detail text);
grant all on r to public;
grant usage, select on sequence r_n_seq to public;

-- ── Permission fingerprint (everything that existed before; the mall's own objects excluded) ──
create function pg_temp.fp() returns table (k text, h text) language sql as $$
  select 'policies', md5(coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || permissive || roles::text || cmd
           || coalesce(qual, '') || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname), ''))
    from pg_policies
  union all
  select 'table grants and row security', md5(coalesce(string_agg(n.nspname || '.' || c.relname || coalesce(c.relacl::text, '')
           || c.relrowsecurity || c.relforcerowsecurity, '|' order by n.nspname, c.relname), ''))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'v', 'm', 'p', 'f') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
     and n.nspname not like 'pg\_temp%'
     and not (n.nspname = 'world' and c.relname in ('mall_slots', 'mall_places', 'mall_settings', 'mall_featured',
              'character_looks', 'brand_value_daily', 'mall_events'))
  union all
  select 'function grants', md5(coalesce(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid)
           || ')' || coalesce(p.proacl::text, '') || p.prosecdef, '|' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), ''))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'world', 'storage')
     and p.proname not in ('world_mall', 'world_mall_act', 'mall_brand_values', 'mall_free_kiosk', 'mall_seed', 'mall_place_new', 'mall_daily')
  union all
  select 'function definitions', md5(coalesce(string_agg(n.nspname || '.' || p.proname || md5(p.prosrc), '|'
           order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), ''))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'world')
     and p.proname not in ('world_mall', 'world_mall_act', 'mall_brand_values', 'mall_free_kiosk', 'mall_seed', 'mall_place_new', 'mall_daily')
  union all
  select 'columns of existing tables', md5(coalesce(string_agg(table_schema || '.' || table_name || '.' || column_name || data_type,
           '|' order by table_schema, table_name, ordinal_position), ''))
    from information_schema.columns
   where table_schema in ('public', 'world', 'storage')
     and not (table_schema = 'world' and table_name in ('mall_slots', 'mall_places', 'mall_settings', 'mall_featured',
              'character_looks', 'brand_value_daily', 'mall_events'))
  union all
  select 'triggers', md5(coalesce(string_agg(event_object_schema || '.' || event_object_table || '.' || trigger_name || action_timing
           || event_manipulation, '|' order by event_object_schema, event_object_table, trigger_name, event_manipulation), ''))
    from information_schema.triggers
   where not (event_object_schema = 'world' and event_object_table = 'mall_events')
  union all
  select 'roles and page lists', md5(coalesce(string_agg(id || coalesce(role, '') || coalesce(page_access::text, ''), '|' order by id), ''))
    from profiles
  union all
  select 'owner list', md5(coalesce(string_agg(user_id::text, '|' order by user_id), '')) from stock_ai_access
  union all
  select 'existing scheduled jobs', md5(coalesce(string_agg(jobname || schedule || command, '|' order by jobname), ''))
    from cron.job where jobname <> 'world-mall-daily'
$$;
create temp table fp_before as select * from pg_temp.fp();

-- the World's existing snapshot, to show it is untouched (now() is fixed inside one transaction)
create temp table snap_before as select md5(world_snapshot()::text) h;

-- @migration

insert into r (area, case_name, pass, detail)
select 'permissions', 'unchanged: ' || b.k, b.h = a.h, b.h || ' / ' || a.h
  from fp_before b join pg_temp.fp() a using (k);
insert into r (area, case_name, pass, detail)
select 'existing World', 'world_snapshot() returns exactly what it did before', s.h = md5(world_snapshot()::text), null
  from snap_before s where s.h is not null;

-- ── Helpers ─────────────────────────────────────────────────────────────────
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
insert into who select 'admin, not an owner', id from profiles where role = 'admin' and id not in (select user_id from stock_ai_access) order by id limit 1;
insert into who select 'manager', id from profiles where role = 'manager' order by id limit 1;
insert into who select 'sales', id from profiles p where role = 'sales' and exists (select 1 from employees e where e.user_id = p.id) order by full_name limit 1;
insert into who select 'marketing', id from profiles where role = 'marketing' order by full_name limit 1;

do $$
declare
  o uuid := (select id from who where k = 'owner');
  w record; v jsonb; mall jsonb; snap jsonb;
  a text; b text; pa jsonb; pb jsonb; places_before text; emp uuid;
begin
  -- ── who can reach it ──
  for w in select * from who order by k loop
    v := pg_temp.as_user('authenticated', w.id, 'select to_jsonb(jsonb_typeof(world_mall()))');
    insert into r (area, case_name, pass, detail) values ('access', 'world_mall(): ' || w.k,
      case when w.k like 'owner%' then v = '"object"'::jsonb else v ->> 'state' = '42501' end, v::text);
    v := pg_temp.as_user('authenticated', w.id, $q$ select world_mall_act('feature', '{"brand":"__none__"}') $q$);
    insert into r (area, case_name, pass, detail) values ('access', 'world_mall_act(): ' || w.k,
      case when w.k like 'owner%' then v ->> 'state' = '22023' else v ->> 'state' = '42501' end, v::text);
    v := pg_temp.as_user('authenticated', w.id, 'select to_jsonb(count(*)) from world.mall_places');
    insert into r (area, case_name, pass, detail) values ('access', 'reading the mall tables directly: ' || w.k, v ->> 'state' = '42501', v::text);
  end loop;
  v := pg_temp.as_user('anon', null, 'select to_jsonb(jsonb_typeof(world_mall()))');
  insert into r (area, case_name, pass, detail) values ('access', 'world_mall(): signed out', v ->> 'state' = '42501', v::text);
  v := pg_temp.as_user('anon', null, $q$ select world_mall_act('feature', '{"brand":"x"}') $q$);
  insert into r (area, case_name, pass, detail) values ('access', 'world_mall_act(): signed out', v ->> 'state' = '42501', v::text);

  -- ── the layout ──
  mall := pg_temp.as_user('authenticated', o, 'select world_mall()');
  snap := pg_temp.as_user('authenticated', o, 'select world_snapshot()');
  insert into r (area, case_name, pass, detail)
  select 'layout', 'every brand on the floor has a place in the mall', count(*) filter (where p.brand is null) = 0,
         count(*) || ' brands, without a place: ' || coalesce(string_agg(s.brand, ', ') filter (where p.brand is null), 'none')
  from (select distinct x ->> 'brand' brand from jsonb_array_elements(snap -> 'floor' -> 'shelves') x) s
  left join (select x ->> 'brand' brand from jsonb_array_elements(mall -> 'places') x) p using (brand);
  insert into r (area, case_name, pass, detail)
  select 'layout', 'boutiques: the most valuable brands at or above the threshold, at most 7',
         count(*) between 1 and 7 and bool_and(d.cost_value >= 9000),
         string_agg(p.brand || ' ' || round(d.cost_value), ', ' order by p.slot)
  from world.mall_places p join world.mall_slots s using (slot)
  join world.brand_value_daily d on d.brand = p.brand and d.day = (select max(day) from world.brand_value_daily)
  where s.kind = 'boutique';
  insert into r (area, case_name, pass, detail)
  select 'layout', 'no place holds more brands than it has room for', bool_and(n <= capacity), string_agg(slot || ':' || n, ' ')
  from (select s.slot, s.capacity, count(p.brand) n from world.mall_slots s left join world.mall_places p using (slot) group by 1, 2) x;
  insert into r (area, case_name, pass, detail)
  select 'layout', 'spare islands stay empty at first', count(*) = 0, count(*) || ' brands on spare islands'
  from world.mall_places p join world.mall_slots s using (slot) where s.spare;
  insert into r (area, case_name, pass, detail)
  select 'layout', 'display areas fill in order of value', bool_and(ok), null
  from (select d.cost_value >= lead(d.cost_value) over (order by s.ord, p.position) or lead(d.cost_value) over (order by s.ord, p.position) is null ok
        from world.mall_places p join world.mall_slots s using (slot)
        join world.brand_value_daily d on d.brand = p.brand and d.day = (select max(day) from world.brand_value_daily)
        where s.kind <> 'boutique') x;
  places_before := (select md5(string_agg(brand || slot || position, '|' order by brand)) from world.mall_places);
  v := to_jsonb(world.mall_daily());
  insert into r (area, case_name, pass, detail) values ('layout', 'running the daily job again moves nobody',
    places_before = (select md5(string_agg(brand || slot || position, '|' order by brand)) from world.mall_places)
    and (v ->> 'seeded')::int = 0 and (v ->> 'newly_placed')::int = 0, v::text);

  -- ── what it reads ──
  insert into r (area, case_name, pass, detail)
  select 'reads', 'units sold yesterday match the sales lines, brand by brand', coalesce(bool_and(m.u = t.u), true) and count(*) = (select count(*) from jsonb_object_keys(mall -> 'sold' -> 'by_brand')),
         count(*) || ' brands'
  from (select nullif(trim(p.brand), '') brand, sum(i.quantity) u
        from lightspeed_sales s join lightspeed_sale_items i on i.sale_id = s.id join lightspeed_products p on p.product_id = i.product_id
        where s.sale_day = (mall -> 'sold' ->> 'day')::date and s.outlet is not null
          and coalesce(s.status, '') !~ 'VOID|SAVED|PARKED|AWAITING' and coalesce(i.status, '') !~ 'VOID|SAVED'
          and nullif(trim(p.brand), '') is not null
        group by 1 having sum(i.quantity) <> 0) t
  left join (select key brand, value::numeric u from jsonb_each_text(mall -> 'sold' -> 'by_brand')) m using (brand);
  insert into r (area, case_name, pass, detail)
  select 'reads', 'units sold yesterday add up to the day''s reconciled units, less unbranded lines',
         coalesce((select sum(value::numeric) from jsonb_each_text(mall -> 'sold' -> 'by_brand')), 0)
           = coalesce((select sum(txn_units) from lightspeed_sales_reconciliation where sale_date = (mall -> 'sold' ->> 'day')::date), 0)
           - coalesce((select sum(i.quantity) from lightspeed_sales s join lightspeed_sale_items i on i.sale_id = s.id
                       left join lightspeed_products p on p.product_id = i.product_id
                       where s.sale_day = (mall -> 'sold' ->> 'day')::date and s.outlet is not null
                         and coalesce(s.status, '') !~ 'VOID|SAVED|PARKED|AWAITING'
                         and (nullif(trim(p.brand), '') is null or coalesce(i.status, '') ~ 'VOID|SAVED')), 0),
         (mall -> 'sold' ->> 'day');
  insert into r (area, case_name, pass, detail)
  select 'reads', 'every active employee is listed once, with a look', count(*) = (select count(*) from employees where status = 'Active')
         and bool_and(x ->> 'look' in ('neutral', 'man', 'woman', 'woman_hijab')), count(*) || ' people'
  from jsonb_array_elements(mall -> 'staff') x;
  insert into r (area, case_name, pass, detail)
  select 'reads', 'nobody is "on duty" without an open, unabandoned shift clocked in today',
         coalesce(bool_and(exists (select 1 from attendance_shifts sh where sh.employee_id = (x ->> 'employee_id')::uuid
           and sh.is_open and not sh.is_abandoned and sh.work_date = (now() at time zone 'Asia/Kuwait')::date
           and sh.clock_in = (x -> 'duty' ->> 'clock_in')::timestamptz)), true),
         count(*) || ' on duty now'
  from jsonb_array_elements(mall -> 'staff') x where x -> 'duty' ->> 'state' = 'on';
  insert into r (area, case_name, pass, detail)
  select 'reads', 'a shift left open from an earlier day never counts', count(*) = 0, count(*) || ' wrongly on duty'
  from jsonb_array_elements(mall -> 'staff') x
  where x -> 'duty' ->> 'state' = 'on' and (x -> 'duty' ->> 'clock_in')::timestamptz < now() - interval '16 hours';
  insert into r (area, case_name, pass, detail) values ('reads', 'no suggestion before there is enough history',
    not exists (select 1 from jsonb_array_elements(mall -> 'suggestions') x where x ->> 'reason' in ('threshold', 'empty') and x ->> 'kind' <> 'below'),
    (mall -> 'history')::text);

  -- ── the owners' changes ──
  select p.brand into a from world.mall_places p join world.mall_slots s using (slot) where s.kind <> 'boutique' order by s.ord, p.position limit 1;
  select p.brand into b from world.mall_places p join world.mall_slots s using (slot) where s.kind <> 'boutique' order by s.ord desc, p.position desc limit 1;
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('feature', jsonb_build_object('brand', %L)) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner features a brand', (v ->> 'changed')::int = 1, v::text);
  v := pg_temp.as_user('authenticated', o, 'select world_mall()');
  insert into r (area, case_name, pass, detail) values ('changes', 'a featured brand outside a boutique is suggested for one at once',
    exists (select 1 from jsonb_array_elements(v -> 'suggestions') x where x ->> 'brand' = a and x ->> 'kind' = 'promote' and x ->> 'reason' = 'featured'), null);
  insert into r (area, case_name, pass, detail) values ('changes', '...and it is still where it was (suggested, not moved)',
    exists (select 1 from jsonb_array_elements(v -> 'places') x where x ->> 'brand' = a and x ->> 'slot' = (select slot from world.mall_places where brand = a)), null);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('feature', jsonb_build_object('brand', %L, 'on', false)) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner un-features it', (v ->> 'changed')::int = 1
    and not exists (select 1 from jsonb_array_elements(pg_temp.as_user('authenticated', o, 'select world_mall()') -> 'featured') x where x ->> 'brand' = a), v::text);

  pa := (select jsonb_build_object('slot', slot, 'position', position) from world.mall_places where brand = a);
  pb := (select jsonb_build_object('slot', slot, 'position', position) from world.mall_places where brand = b);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('move', jsonb_build_object('moves', jsonb_build_array(
         jsonb_build_object('brand', %L, 'slot', %L, 'position', %s), jsonb_build_object('brand', %L, 'slot', %L, 'position', %s)))) $q$,
         a, pb ->> 'slot', pb ->> 'position', b, pa ->> 'slot', pa ->> 'position'));
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner swaps two brands in one step',
    (v ->> 'changed')::int = 2
    and (select jsonb_build_object('slot', slot, 'position', position) from world.mall_places where brand = a) = pb
    and (select jsonb_build_object('slot', slot, 'position', position) from world.mall_places where brand = b) = pa, v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('move', jsonb_build_object('moves', jsonb_build_array(
         jsonb_build_object('brand', %L, 'slot', %L, 'position', %s)))) $q$, a, pa ->> 'slot', pa ->> 'position'));
  insert into r (area, case_name, pass, detail) values ('changes', 'moving onto a taken place is refused, and nothing moves',
    v ->> 'state' = '23505' and (select jsonb_build_object('slot', slot, 'position', position) from world.mall_places where brand = a) = pb, v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('move', jsonb_build_object('moves', jsonb_build_array(
         jsonb_build_object('brand', %L, 'slot', 'XX-9', 'position', 0)))) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'a place that does not exist is refused', v ->> 'state' = '22023', v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('move', jsonb_build_object('moves', jsonb_build_array(
         jsonb_build_object('brand', %L, 'slot', 'GG-N1', 'position', 1)))) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'a second brand in a boutique is refused', v ->> 'state' = '22023', v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('move', jsonb_build_object('moves', jsonb_build_array(
         jsonb_build_object('brand', %L, 'slot', 'DC-I2', 'position', 0)))) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner moves a brand to a spare island',
    (v ->> 'changed')::int = 1 and (select slot from world.mall_places where brand = a) = 'DC-I2', v::text);
  v := pg_temp.as_user('authenticated', (select id from who where k = 'sales'), format($q$ select world_mall_act('move', jsonb_build_object('moves', jsonb_build_array(
         jsonb_build_object('brand', %L, 'slot', 'DC-I2', 'position', 1)))) $q$, b));
  insert into r (area, case_name, pass, detail) values ('changes', 'a salesperson cannot move a brand', v ->> 'state' = '42501', v::text);

  places_before := (select md5(string_agg(brand || slot || position, '|' order by brand)) from world.mall_places);
  v := pg_temp.as_user('authenticated', o, $q$ select world_mall_act('settings', '{"boutique_threshold_kd": 10000, "promote_after_days": 45}') $q$);
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner changes the thresholds',
    (select boutique_threshold_kd = 10000 and promote_after_days = 45 and free_after_days = 60 from world.mall_settings), v::text);
  v := pg_temp.as_user('authenticated', o, $q$ select world_mall_act('settings', '{"boutique_threshold_kd": 0}') $q$);
  insert into r (area, case_name, pass, detail) values ('changes', 'a threshold of zero is refused', v ->> 'state' = '22023', v::text);
  insert into r (area, case_name, pass, detail) values ('changes', 'changing the threshold moves nobody',
    places_before = (select md5(string_agg(brand || slot || position, '|' order by brand)) from world.mall_places), null);

  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('colour', jsonb_build_object('brand', %L, 'colour', '#1F3A5C')) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner sets a boutique colour',
    (select boutique_colours ->> a = '#1f3a5c' from world.mall_settings), v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('colour', jsonb_build_object('brand', %L, 'colour', 'red')) $q$, a));
  insert into r (area, case_name, pass, detail) values ('changes', 'a colour that is not #rrggbb is refused', v ->> 'state' = '22023', v::text);

  emp := (select id from employees where status = 'Active' order by full_name limit 1);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('look', jsonb_build_object('employee_id', %L, 'look', 'woman_hijab')) $q$, emp));
  insert into r (area, case_name, pass, detail) values ('changes', 'an owner sets an employee''s look',
    (select look = 'woman_hijab' from world.character_looks where employee_id = emp)
    and exists (select 1 from jsonb_array_elements(pg_temp.as_user('authenticated', o, 'select world_mall()') -> 'staff') x
                where (x ->> 'employee_id')::uuid = emp and x ->> 'look' = 'woman_hijab'), v::text);
  v := pg_temp.as_user('authenticated', o, format($q$ select world_mall_act('look', jsonb_build_object('employee_id', %L, 'look', 'female')) $q$, emp));
  insert into r (area, case_name, pass, detail) values ('changes', 'a look that is not on the list is refused', v ->> 'state' = '22023', v::text);
  v := pg_temp.as_user('authenticated', (select id from who where k = 'manager'), format($q$ select world_mall_act('look', jsonb_build_object('employee_id', %L, 'look', 'man')) $q$, emp));
  insert into r (area, case_name, pass, detail) values ('changes', 'a manager cannot set a look', v ->> 'state' = '42501', v::text);

  insert into r (area, case_name, pass, detail)
  select 'changes', 'every change is recorded with who made it', count(*) >= 7 and bool_and(actor is not null and actor_name <> ''), count(*) || ' events'
  from world.mall_events where actor is not null;
  begin
    update world.mall_events set actor_name = 'x' where id > 0;
    insert into r (area, case_name, pass, detail) values ('changes', 'the record of changes cannot be edited', false, 'update went through');
  exception when others then
    insert into r (area, case_name, pass, detail) values ('changes', 'the record of changes cannot be edited', sqlstate = '42501', sqlerrm);
  end;
end $$;

select jsonb_build_object(
  'passed', (select count(*) filter (where pass) from r), 'total', (select count(*) from r),
  'failed', (select coalesce(jsonb_agg(jsonb_build_object('area', area, 'case', case_name, 'detail', detail) order by n), '[]'::jsonb) from r where not pass),
  'fp', (select jsonb_object_agg(k, h) from fp_before),
  'cases', (select jsonb_agg(area || ': ' || case_name order by n) from r)) result;
rollback;
