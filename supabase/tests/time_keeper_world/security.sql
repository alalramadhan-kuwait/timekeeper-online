-- Time Keeper World: security tests.
-- Runs as one transaction that ends in ROLLBACK, so it leaves nothing behind
-- (the mission events it writes while testing are rolled back too).
-- Each case impersonates an account exactly as the API would: SET ROLE to the API role
-- and set request.jwt.claims to that person's token claims.

begin;

create temp table t (n serial, case_name text, expected text, got text, pass boolean, detail text);
grant all on t to public;
grant usage, select on sequence t_n_seq to public;

create or replace function pg_temp.run_as(p_role text, p_sub uuid, p_case text, p_sql text, p_expected text)
returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', p_role, 'sub', p_sub)::text, true);
  begin
    execute p_sql;
    v_state := 'ok'; v_msg := null;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into pg_temp.t (case_name, expected, got, pass, detail)
  values (p_case, p_expected, v_state, v_state = p_expected, v_msg);
end $$;

-- The mission used for state tests: the first mission the World lists right now.
select set_config('test.mission_key',
  (select x ->> 'key' from jsonb_array_elements(world_snapshot() -> 'missions') x limit 1), true);

do $$
declare
  fns text[] := array[
    'select world_snapshot()',
    'select world_snapshot(''avenues'')',
    'select world_po_search()',
    'select world_po_search(''MAI'')',
    format('select world_po_detail(%L)', (select id from purchase_orders order by created_date limit 1)),
    'select world_mission_history(' || quote_literal(current_setting('test.mission_key')) || ')',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''reviewed'')',
    'select count(*) from world.mission_events',
    'select count(*) from world.receipt_events',
    'select count(*) from world.po_ledger',
    'select world_guard()'];
  owner_fns text[] := fns[1:6];
  p record;
  f text;
begin
  -- 1. Signed-out visitors (the public anon key): refused for everything.
  foreach f in array fns loop
    perform pg_temp.run_as('anon', null, 'anon: ' || f, f, '42501');
  end loop;

  -- 2. Server key (service_role): not granted; nothing server-side needs the World.
  foreach f in array fns loop
    perform pg_temp.run_as('service_role', null, 'service_role: ' || f, f, '42501');
  end loop;

  -- 3. Every signed-in account that is not an owner, plus an unknown account.
  for p in
    select pr.id, coalesce(trim(pr.full_name), '?') || ' (' || coalesce(pr.role, '?') || ')' label
    from profiles pr where not exists (select 1 from stock_ai_access a where a.user_id = pr.id)
    union all
    select '00000000-0000-0000-0000-00000000dead'::uuid, 'unknown account'
  loop
    foreach f in array fns loop
      perform pg_temp.run_as('authenticated', p.id, p.label || ': ' || f, f, '42501');
    end loop;
  end loop;

  -- 4. Each owner: every read works; direct table and guard access is still refused.
  for p in
    select pr.id, trim(pr.full_name) label from stock_ai_access a join profiles pr on pr.id = a.user_id
  loop
    foreach f in array owner_fns loop
      perform pg_temp.run_as('authenticated', p.id, 'owner ' || p.label || ': ' || f, f, 'ok');
    end loop;
    perform pg_temp.run_as('authenticated', p.id, 'owner ' || p.label || ': mission review',
      'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''reviewed'', null, null, ''fp-test'')', 'ok');
    perform pg_temp.run_as('authenticated', p.id, 'owner ' || p.label || ': read world.mission_events directly',
      'select count(*) from world.mission_events', '42501');
    perform pg_temp.run_as('authenticated', p.id, 'owner ' || p.label || ': call world_guard directly',
      'select world_guard()', '42501');
  end loop;

  -- 5. Input checks (as the first owner).
  select a.user_id into p from stock_ai_access a limit 1;
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: unknown mission action',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''deleted'')', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: snooze into the past',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''snoozed'', current_date - 1)', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: snooze beyond 90 days',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''snoozed'', current_date + 120)', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: empty note',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''note'', null, ''   '')', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: malformed mission key',
    'select world_mission_act(''Not A Key'', ''reviewed'')', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: unknown outlet',
    'select world_snapshot(''kuwait_city'')', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: unknown record class',
    'select world_po_search(null, ''deleted'')', '22023');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: snooze for 7 days',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''snoozed'', ((now() at time zone ''Asia/Kuwait'')::date + 7))', 'ok');
  perform pg_temp.run_as('authenticated', p.user_id, 'owner: leave a note',
    'select world_mission_act(' || quote_literal(current_setting('test.mission_key')) || ', ''note'', null, ''Called the supplier'')', 'ok');
end $$;

-- 6. History is append-only, even for the database owner.
do $$
begin
  begin update world.mission_events set note = 'x';
    insert into pg_temp.t (case_name, expected, got, pass) values ('postgres: edit mission history', '42501', 'ok', false);
  exception when others then
    insert into pg_temp.t (case_name, expected, got, pass) values ('postgres: edit mission history', '42501', sqlstate, sqlstate = '42501');
  end;
  begin delete from world.mission_events where true;
    insert into pg_temp.t (case_name, expected, got, pass) values ('postgres: remove mission history', '42501', 'ok', false);
  exception when others then
    insert into pg_temp.t (case_name, expected, got, pass) values ('postgres: remove mission history', '42501', sqlstate, sqlstate = '42501');
  end;
  -- Only the database owner holds privileges on the World tables; the server key cannot write them.
  begin
    set local role service_role;
    insert into world.mission_events (mission_key, action, actor, actor_name)
    values ('test:x', 'note', gen_random_uuid(), 'x');
    reset role;
    insert into pg_temp.t (case_name, expected, got, pass) values ('service_role: write mission history directly', '42501', 'ok', false);
  exception when others then
    reset role;
    insert into pg_temp.t (case_name, expected, got, pass) values ('service_role: write mission history directly', '42501', sqlstate, sqlstate = '42501');
  end;
end $$;

-- 7. Shared mission state: what the owners did above shows up for everyone, with who and when.
insert into pg_temp.t (case_name, expected, got, pass, detail)
select 'shared state: ' || current_setting('test.mission_key') || ' is snoozed, by an owner, with 5 events of history',
       'snoozed/5', coalesce(m ->> 'state', 'absent') || '/' || coalesce(m ->> 'history_events', '0'),
       coalesce(m ->> 'state', 'absent') || '/' || coalesce(m ->> 'history_events', '0') = 'snoozed/5',
       m ->> 'state_by'
from (select (select x from jsonb_array_elements(world_snapshot() -> 'missions') x
              where x ->> 'key' = current_setting('test.mission_key')) m) z;

select jsonb_build_object(
  'passed', (select count(*) from pg_temp.t where pass),
  'failed', (select count(*) from pg_temp.t where not pass),
  'by_group', (select jsonb_object_agg(g, x) from (select split_part(case_name, ':', 1) g,
                 count(*) filter (where pass) || '/' || count(*) x from pg_temp.t group by 1) z),
  'failures', (select coalesce(jsonb_agg(jsonb_build_object('case', case_name, 'expected', expected, 'got', got, 'detail', left(detail, 120))), '[]') from pg_temp.t where not pass),
  'shared_state', (select detail from pg_temp.t where case_name like 'shared state%'),
  'mission_used', current_setting('test.mission_key')) r;
rollback;
