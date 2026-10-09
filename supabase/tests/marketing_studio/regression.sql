-- Marketing Studio, phase 1: the existing Inbox, tasks, notifications and
-- approvals, checked as the real accounts. Run before and after the migration;
-- the two results must match (apart from real activity in between).
-- One transaction that ends in ROLLBACK: nothing it creates survives, and the
-- notification it queues is never delivered.
begin;

create function pg_temp.as_user(p_sub uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', p_sub)::text, true);
  begin
    execute p_sql into v;
  exception when others then
    v := jsonb_build_object('error', sqlerrm, 'state', sqlstate);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v, 'null'::jsonb);
end $$;

create temp table out (n serial, k text, v jsonb);

do $$
declare
  who record; v jsonb; v_task uuid; v_emp uuid; v_req uuid;
  owner_a uuid; sales uuid; m1 uuid;
begin
  select user_id into owner_a from stock_ai_access order by granted_at, user_id limit 1;
  select id into sales from profiles p where role = 'sales' and exists (select 1 from employees e where e.user_id = p.id) order by full_name limit 1;
  select id into m1 from profiles where role = 'marketing' order by full_name limit 1;
  select id into v_emp from employees where user_id = sales limit 1;

  -- what each kind of account can read, exactly as the Inbox asks for it
  for who in
    select 'owner' k, owner_a id
    union all select 'admin, not an owner', (select id from profiles where role = 'admin' and id not in (select user_id from stock_ai_access) order by id limit 1)
    union all select 'manager', (select id from profiles where role = 'manager' order by id limit 1)
    union all select 'sales', sales
    union all select 'marketing', m1
  loop
    v := pg_temp.as_user(who.id, $q$
      select jsonb_build_object(
        'my open tasks', (select count(*) from assigned_tasks t where t.status = 'Open' and (
            t.assignee_employee_id in (select id from employees where user_id = auth.uid())
            or t.assignee_role = (select role from profiles where id = auth.uid()))),
        'tasks readable', (select count(*) from assigned_tasks),
        'requests readable', (select count(*) from v_requests),
        'employees readable', (select count(*) from employees),
        'leave readable', (select count(*) from leave_records))$q$);
    insert into out (k, v) values ('reads: ' || who.k, v);
  end loop;

  -- a manager's ordinary task: created, announced, and closed by its assignee
  v := pg_temp.as_user(owner_a, format($q$
    with t as (insert into assigned_tasks (title, details, assignee_employee_id, assigned_by, priority, due_date, status)
               values ('Regression check', 'rolled back', %L, 'Regression', 'Medium', current_date, 'Open') returning id)
    select to_jsonb(id) from t$q$, v_emp));
  v_task := (v #>> '{}')::uuid;
  insert into out (k, v) values ('task: an owner can assign an ordinary task', to_jsonb(v_task is not null));
  insert into out (k, v) select 'task: the usual New task alert goes to the assignee only',
    to_jsonb(count(*) = 1 and bool_and(n.person_user_id = sales and n.url like '#/inbox?focus=' || v_task || '%'))
    from notifications n where n.event_type = 'task_new' and n.dedupe_key = 'task_new:' || v_task;
  v := pg_temp.as_user(sales, format($q$ with u as (update assigned_tasks set status = 'Done' where id = %L returning 1) select to_jsonb(count(*)) from u $q$, v_task));
  insert into out (k, v) values ('task: the assignee can mark it done', to_jsonb(v = '1'::jsonb));
  v := pg_temp.as_user(m1, format($q$ with u as (update assigned_tasks set status = 'Open' where id = %L returning 1) select to_jsonb(count(*)) from u $q$, v_task));
  insert into out (k, v) values ('task: someone else cannot reopen it', to_jsonb(v = '0'::jsonb));

  -- an approval: a salesperson raises a request, cannot approve it, an owner can
  v := pg_temp.as_user(sales, format($q$
    with i as (insert into employee_requests (user_id, employee_id, request_type, status, details)
               values (auth.uid(), %L, 'HR update', 'Pending', 'Regression check') returning id)
    select to_jsonb(id) from i$q$, v_emp));
  v_req := (v #>> '{}')::uuid;
  insert into out (k, v) values ('approval: a salesperson can raise a request', to_jsonb(v_req is not null));
  v := pg_temp.as_user(owner_a, format($q$ select to_jsonb(count(*)) from v_requests where id = %L $q$, v_req));
  insert into out (k, v) values ('approval: it reaches the owner''s queue', to_jsonb(v = '1'::jsonb));
  v := pg_temp.as_user(sales, format($q$ with u as (update employee_requests set status = 'Approved' where id = %L returning 1) select to_jsonb(count(*)) from u $q$, v_req));
  insert into out (k, v) values ('approval: the salesperson cannot approve it', to_jsonb(v = '0'::jsonb or v ? 'error'));
  v := pg_temp.as_user(owner_a, format($q$ with u as (update employee_requests set status = 'Approved', override_reason = 'Regression check' where id = %L returning 1) select to_jsonb(count(*)) from u $q$, v_req));
  insert into out (k, v) values ('approval: an owner can approve it', to_jsonb(v = '1'::jsonb));
end $$;

select jsonb_object_agg(k, v order by n) res from out;
rollback;
