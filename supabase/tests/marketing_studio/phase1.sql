-- Marketing Studio, phase 1: tests and the trial campaign.
-- One transaction that ends in ROLLBACK: nothing it creates survives, and no
-- notification it queues is ever delivered.
--
-- Each person is impersonated exactly as the API would: SET ROLE authenticated
-- with that person's token claims. The people are the real accounts: two of the
-- three owners, both marketing accounts, the admin who is not an owner, a
-- manager and a salesperson.
--
-- Before the migration is applied, run it with the migration pasted at the
-- '-- @migration' line (scripts in the session notes do this); the permission
-- fingerprint then compares the database before and after it.

begin;

create temp table r (n serial, area text, case_name text, pass boolean, detail text);
create temp table trial (n serial, step text, actor text, stage text, approval text, note text);
grant all on r, trial to public;
grant usage, select on sequence r_n_seq, trial_n_seq to public;

-- ── Permission fingerprint ──────────────────────────────────────────────────
create function pg_temp.fp() returns table (k text, h text) language sql as $$
  select 'policies', md5(coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || permissive || roles::text || cmd
           || coalesce(qual, '') || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname), ''))
    from pg_policies
   where tablename not like 'marketing\_%' and not (schemaname = 'storage' and policyname like 'campaign\_files\_%')
  union all
  select 'table grants and row security', md5(coalesce(string_agg(n.nspname || '.' || c.relname || coalesce(c.relacl::text, '')
           || c.relrowsecurity || c.relforcerowsecurity, '|' order by n.nspname, c.relname), ''))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'v', 'm', 'p', 'f') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
     and n.nspname not like 'pg\_temp%' and c.relname not like 'marketing\_%'
  union all
  select 'function grants', md5(coalesce(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid)
           || ')' || coalesce(p.proacl::text, '') || p.prosecdef, '|' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), ''))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'world', 'storage') and p.proname not like 'mkt\_%' and p.proname not like 'campaign\_%'
  union all
  select 'columns of existing tables', md5(coalesce(string_agg(table_schema || '.' || table_name || '.' || column_name || data_type,
           '|' order by table_schema, table_name, ordinal_position), ''))
    from information_schema.columns
   where table_schema in ('public', 'world', 'storage') and table_name not like 'marketing\_%'
  union all
  select 'roles and page lists', md5(coalesce(string_agg(id || coalesce(role, '') || coalesce(page_access::text, ''), '|' order by id), ''))
    from profiles
  union all
  select 'owner list', md5(coalesce(string_agg(user_id::text, '|' order by user_id), '')) from stock_ai_access
  union all
  select 'existing notification audiences', md5(coalesce(string_agg(to_jsonb(s)::text, '|' order by event_type), ''))
    from notification_settings s where event_type not like 'campaign\_%'
  union all
  select 'existing storage buckets', md5(coalesce(string_agg(to_jsonb(b)::text, '|' order by id), ''))
    from (select id, public, file_size_limit, allowed_mime_types from storage.buckets where id <> 'campaign-files') b
  union all
  select 'existing scheduled jobs', md5(coalesce(string_agg(jobname || schedule || command, '|' order by jobname), ''))
    from cron.job where jobname <> 'marketing-campaign-daily'
$$;
create temp table fp_before as select * from pg_temp.fp();

-- @migration

insert into r (area, case_name, pass, detail)
select 'permissions', 'unchanged: ' || b.k, b.h = a.h, b.h || ' / ' || a.h
  from fp_before b join pg_temp.fp() a using (k);

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Runs SQL as a person; returns its single jsonb result, or {"error": ...}.
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

create function pg_temp.ok(p_area text, p_case text, p_pass boolean, p_detail text) returns void language sql as $$
  insert into r (area, case_name, pass, detail) values (p_area, p_case, coalesce(p_pass, false), p_detail)
$$;

create function pg_temp.step(p_step text, p_actor text, p_cid uuid, p_note text) returns void language sql as $$
  insert into trial (step, actor, stage, approval, note)
  select p_step, p_actor, stage, approval_status, p_note from marketing_campaigns where id = p_cid
$$;

do $$
declare
  owner_a uuid; owner_b uuid; m1 uuid; m2 uuid; m1_emp uuid; m2_emp uuid;
  admin_x uuid; mgr uuid; sales uuid;
  v_brand text; v_fit text[]; v_misfit text; v_cid uuid; v_cid2 uuid; v jsonb; d jsonb; v_task assigned_tasks;
  base jsonb; v_path text; v_n int;
begin
  -- the people
  select user_id into owner_a from stock_ai_access order by granted_at, user_id limit 1;
  select user_id into owner_b from stock_ai_access where user_id <> owner_a order by granted_at, user_id limit 1;
  select p.id, e.id into m1, m1_emp from profiles p join employees e on e.user_id = p.id where p.role = 'marketing' order by p.full_name limit 1;
  select p.id, e.id into m2, m2_emp from profiles p join employees e on e.user_id = p.id where p.role = 'marketing' and p.id <> m1 order by p.full_name limit 1;
  select id into admin_x from profiles where role = 'admin' and id not in (select user_id from stock_ai_access) limit 1;
  select id into mgr from profiles where role = 'manager' limit 1;
  select id into sales from profiles where role = 'sales' limit 1;
  perform pg_temp.ok('setup', 'all seven kinds of account found',
    owner_a is not null and owner_b is not null and m1 is not null and m2 is not null and admin_x is not null and mgr is not null and sales is not null,
    concat_ws(' ', owner_a, owner_b, m1, m2, admin_x, mgr, sales));

  -- a brand with owned slow or dead stock, two of its products, and a best seller that does not fit
  select r ->> 'brand' into v_brand
    from (select rows from stock_analyst_metrics_cache where outlet_key = 'all' order by as_of desc limit 1) m, jsonb_array_elements(m.rows) r
   where r ->> 'ownership' = 'owned' and r ->> 'class' in ('slow', 'dead') and (r ->> 'on_hand')::numeric > 0
   group by 1 having count(*) >= 2 order by count(*) desc limit 1;
  select array_agg(product_id) into v_fit from (select product_id from mkt_products(v_brand) p
    where mkt_product_misfit('slow_stock', p.on_hand, p.class, p.ownership, p.arrived_on) is null order by p.on_hand desc limit 2) x;
  select product_id into v_misfit from mkt_products(v_brand) p where p.class = 'fast' and p.on_hand > 0 limit 1;
  if v_misfit is null then
    select r ->> 'product_id' into v_misfit
      from (select rows from stock_analyst_metrics_cache where outlet_key = 'all' order by as_of desc limit 1) m, jsonb_array_elements(m.rows) r
     where r ->> 'class' = 'fast' and (r ->> 'on_hand')::numeric > 0 limit 1;
  end if;
  perform pg_temp.ok('setup', 'test products found', cardinality(v_fit) = 2 and v_misfit is not null, v_brand);

  base := jsonb_build_object('title', 'Trial: ' || v_brand || ' clearance', 'objective', 'slow_stock', 'target_value', 6,
    'target_unit', 'units', 'product_ids', to_jsonb(v_fit), 'channels', '["instagram_reel"]'::jsonb, 'priority', 'High',
    'deadline', (current_date + 7)::text, 'assignee_employee_id', m1_emp, 'brief', 'Show the two pieces on the wrist, evening light.');

  -- ── Required fields and rules ──
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base - 'deadline'));
  perform pg_temp.ok('required fields', 'no deadline: refused', v ? 'error', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base - 'assignee_employee_id'));
  perform pg_temp.ok('required fields', 'no assignee: refused', v ? 'error', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base - 'target_value'));
  perform pg_temp.ok('required fields', 'no measurable target: refused', v ? 'error', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base || '{"target_unit":"reach"}'));
  perform pg_temp.ok('required fields', 'target in a unit the objective does not use: refused', v ? 'error', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base || '{"window_days":10}'));
  perform pg_temp.ok('required fields', 'window under the 14-day minimum: refused', v ->> 'error' like '%at least 14 days%', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base || jsonb_build_object('product_ids', jsonb_build_array(v_misfit))));
  perform pg_temp.ok('required fields', 'best seller in a slow-stock campaign: refused', v ->> 'error' like '%does not fit%', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))',
    base || jsonb_build_object('assignee_employee_id', (select e.id from employees e join profiles p on p.id = e.user_id where p.role = 'sales' limit 1))));
  perform pg_temp.ok('required fields', 'assignee outside the marketing team: refused', v ->> 'error' like '%marketing team%', v::text);
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base || jsonb_build_object('deadline', (current_date - 1)::text)));
  perform pg_temp.ok('required fields', 'deadline in the past: refused', v ? 'error', v::text);

  -- ── Who may create ──
  v := pg_temp.as_user(admin_x, format('select to_jsonb(campaign_create(%L))', base));
  perform pg_temp.ok('access', 'admin who is not an owner cannot create', v ->> 'error' like '%Only the owners%', v::text);
  v := pg_temp.as_user(m1, format('select to_jsonb(campaign_create(%L))', base));
  perform pg_temp.ok('access', 'marketing cannot create', v ? 'error', v::text);
  v := pg_temp.as_user(m1, 'select campaign_form_options()');
  perform pg_temp.ok('access', 'marketing cannot open the owners'' form (it lists stock)', v ? 'error', v::text);

  -- ═════ THE TRIAL CAMPAIGN ═════
  -- 1. Assignment
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))', base));
  v_cid := (v #>> '{}')::uuid;
  perform pg_temp.ok('trial', '1 owner creates and assigns the campaign', v_cid is not null, v::text);
  perform pg_temp.step('Assigned to the Designer/Marketing account', 'Owner A', v_cid, 'Inbox task created; existing "New task" notification queued');
  select * into v_task from assigned_tasks where source_table = 'marketing_campaigns' and source_id = v_cid;
  perform pg_temp.ok('trial', '1 an ordinary Inbox task is created for the assignee',
    v_task.status = 'Open' and v_task.assignee_employee_id = m1_emp and v_task.due_date = current_date + 7, to_jsonb(v_task)::text);
  perform pg_temp.ok('trial', '1 the existing task notification goes to the assignee only',
    exists (select 1 from notifications where dedupe_key = 'task_new:' || v_task.id and person_user_id = m1), null);
  perform pg_temp.ok('no cost', 'the Inbox task carries no cost', v_task.details !~* 'cost|KD', v_task.details);
  v := pg_temp.as_user(m1, $q$ select jsonb_agg(t) from assigned_tasks t where source_table = 'marketing_campaigns' $q$);
  perform pg_temp.ok('trial', '1 the assignee sees the task through the existing Inbox rules', jsonb_array_length(v) = 1, v::text);

  -- who can see it
  v := pg_temp.as_user(owner_b, format('select campaign_detail(%L)', v_cid));
  perform pg_temp.ok('access', 'the other owner can view status and history', v ->> 'stage' = 'assigned', left(v::text, 200));
  v := pg_temp.as_user(m2, format('select campaign_detail(%L)', v_cid));
  perform pg_temp.ok('access', 'the other marketing person cannot see a campaign assigned to someone else', v ? 'error', v::text);
  v := pg_temp.as_user(admin_x, format('select campaign_detail(%L)', v_cid));
  perform pg_temp.ok('access', 'admin who is not an owner sees nothing', v ? 'error', v::text);
  v := pg_temp.as_user(admin_x, 'select to_jsonb(count(*)) from marketing_campaigns');
  perform pg_temp.ok('access', 'admin who is not an owner reads no campaign rows', v = '0'::jsonb, v::text);
  v := pg_temp.as_user(mgr, 'select to_jsonb(count(*)) from marketing_campaigns');
  perform pg_temp.ok('access', 'manager reads no campaign rows', v = '0'::jsonb, v::text);
  v := pg_temp.as_user(sales, 'select to_jsonb(count(*)) from marketing_campaign_events');
  perform pg_temp.ok('access', 'sales reads no campaign history', v = '0'::jsonb, v::text);
  v := pg_temp.as_user(m1, format('select to_jsonb(count(*)) from marketing_campaign_results'));
  perform pg_temp.ok('access', 'marketing cannot read results tables', v = '0'::jsonb, v::text);

  -- 2. The assignee picks it up and uploads a first draft
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L)', v_cid, 'pick_up'));
  perform pg_temp.ok('trial', '2 assignee picks it up', v ->> 'stage' = 'working', left(v::text, 200));
  perform pg_temp.step('Picked up', 'Assignee', v_cid, null);
  v_path := v_cid || '/v1-reel-cover.jpg';
  v := pg_temp.as_user(m2, format($q$ with i as (insert into storage.objects (bucket_id, name) values ('campaign-files', %L) returning 1) select to_jsonb(count(*)) from i $q$, v_cid || '/intruder.jpg'));
  perform pg_temp.ok('access', 'the other marketing person cannot upload into this campaign', v ? 'error', v::text);
  v := pg_temp.as_user(m1, format($q$ with i as (insert into storage.objects (bucket_id, name) values ('campaign-files', %L) returning 1) select to_jsonb(count(*)) from i $q$, v_path));
  perform pg_temp.ok('trial', '2 assignee uploads the draft file to the private store', v = '1'::jsonb, v::text);
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'add_file',
         jsonb_build_object('kind', 'draft', 'storage_path', v_path, 'file_name', 'reel-cover.jpg', 'mime', 'image/jpeg', 'size_bytes', 412000)));
  perform pg_temp.ok('trial', '2 the draft is recorded as version 1', v -> 'files' -> 0 ->> 'version' = '1', left(v::text, 200));
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L)', v_cid, 'approve'));
  perform pg_temp.ok('rules', 'the assignee cannot approve', v ? 'error', v::text);

  -- 3. Draft submitted: the campaign owner, and only the campaign owner, is told
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'submit', '{"note":"First cut of the reel cover"}'));
  perform pg_temp.ok('trial', '3 draft submitted: in review, awaiting approval',
    v ->> 'stage' = 'in_review' and v ->> 'approval_status' = 'awaiting', left(v::text, 200));
  perform pg_temp.step('Draft v1 sent for review', 'Assignee', v_cid, 'First cut of the reel cover');
  perform pg_temp.ok('notifications', 'review notification to the campaign owner',
    exists (select 1 from notifications where event_type = 'campaign_review' and person_user_id = owner_a and dedupe_key = 'campaign_review:' || v_cid || ':1'), null);
  perform pg_temp.ok('notifications', 'no review notification to the other owners or by role',
    not exists (select 1 from notifications where event_type = 'campaign_review' and (person_user_id <> owner_a or audience_roles is not null)), null);
  v := pg_temp.as_user(owner_b, format('select campaign_act(%L, %L)', v_cid, 'approve'));
  perform pg_temp.ok('rules', 'another owner cannot approve someone else''s campaign', v ? 'error', v::text);

  -- 4. Revision requested
  v := pg_temp.as_user(owner_a, format('select campaign_act(%L, %L)', v_cid, 'request_changes'));
  perform pg_temp.ok('rules', 'asking for changes needs a note', v ->> 'error' like '%what should change%', v::text);
  v := pg_temp.as_user(owner_a, format('select campaign_act(%L, %L, %L)', v_cid, 'request_changes', '{"note":"Show the price tag and the strap close-up"}'));
  perform pg_temp.ok('trial', '4 changes requested: back to working, one revision round',
    v ->> 'stage' = 'working' and v ->> 'approval_status' = 'changes_requested' and (v -> 'execution' ->> 'revision_rounds')::int = 1, left(v::text, 200));
  perform pg_temp.step('Changes requested', 'Owner A', v_cid, 'Show the price tag and the strap close-up');
  perform pg_temp.ok('notifications', 'change request notification to the assignee',
    exists (select 1 from notifications where event_type = 'campaign_changes' and person_user_id = m1), null);
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L)', v_cid, 'submit'));
  perform pg_temp.ok('rules', 'cannot resubmit without a new draft', v ? 'error', v::text);

  -- 5. Revised draft (a caption-only version this time), submitted, approved
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'add_file',
         '{"kind":"draft","caption_text":"Two classics, one evening. Strap close-up and price in the second frame."}'));
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L)', v_cid, 'submit'));
  perform pg_temp.ok('trial', '5 revised draft v2 submitted', v ->> 'stage' = 'in_review', left(v::text, 200));
  perform pg_temp.step('Draft v2 sent for review', 'Assignee', v_cid, null);
  v := pg_temp.as_user(owner_a, format('select campaign_act(%L, %L, %L)', v_cid, 'approve', '{"note":"Good to go"}'));
  perform pg_temp.ok('trial', '5 owner approves version 2',
    v ->> 'stage' = 'approved' and v ->> 'approval_status' = 'approved'
    and (select decision from marketing_campaign_files where campaign_id = v_cid and version = 2) = 'approved'
    and (select decision from marketing_campaign_files where campaign_id = v_cid and version = 1) = 'changes_requested', left(v::text, 200));
  perform pg_temp.step('Approved (version 2)', 'Owner A', v_cid, 'Good to go');
  perform pg_temp.ok('notifications', 'approval notification to the assignee',
    exists (select 1 from notifications where event_type = 'campaign_approved' and person_user_id = m1), null);

  -- 6. Publication confirmed by the team, with the real time and link
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'confirm_published', '{"links":["https://www.instagram.com/reel/test"]}'));
  perform pg_temp.ok('rules', 'publication needs the actual time', v ->> 'error' like '%actually went out%', v::text);
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'confirm_published',
         jsonb_build_object('published_at', now() + interval '2 hours', 'links', '["https://www.instagram.com/reel/test"]'::jsonb)));
  perform pg_temp.ok('rules', 'a publication time in the future is refused', v ? 'error', v::text);
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'confirm_published',
         jsonb_build_object('published_at', now(), 'links', '["http://not-secure"]'::jsonb)));
  perform pg_temp.ok('rules', 'links must be https', v ? 'error', v::text);
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid, 'confirm_published',
         jsonb_build_object('published_at', now(), 'links', '["https://www.instagram.com/reel/test"]'::jsonb)));
  perform pg_temp.ok('trial', '6 publication confirmed with its time and link',
    v ->> 'stage' = 'posted' and v -> 'execution' ->> 'published_at' is not null and v -> 'post_links' ->> 0 like 'https://%', left(v::text, 200));
  perform pg_temp.step('Publication confirmed', 'Assignee', v_cid, 'Posted by hand on Instagram; link recorded');
  perform pg_temp.ok('notifications', 'publication notification to the campaign owner only',
    exists (select 1 from notifications where event_type = 'campaign_published' and person_user_id = owner_a)
    and not exists (select 1 from notifications where event_type = 'campaign_published' and person_user_id <> owner_a), null);

  -- 7. Completion by the campaign owner
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L)', v_cid, 'complete'));
  perform pg_temp.ok('rules', 'the assignee cannot close the campaign', v ? 'error', v::text);
  v := pg_temp.as_user(owner_a, format('select campaign_act(%L, %L, %L)', v_cid, 'complete', '{"lesson":"The strap close-up got the questions."}'));
  perform pg_temp.ok('trial', '7 campaign completed', v ->> 'stage' = 'done', left(v::text, 200));
  perform pg_temp.step('Completed', 'Owner A', v_cid, 'Lesson recorded');
  select * into v_task from assigned_tasks where source_table = 'marketing_campaigns' and source_id = v_cid;
  perform pg_temp.ok('trial', '7 the Inbox task closes itself', v_task.status = 'Done', v_task.status);
  d := v;
  perform pg_temp.ok('execution', 'assignment, pick-up, submission, approval, publication and completion are all timestamped',
    (d -> 'execution' ->> 'assigned_at') is not null and (d -> 'execution' ->> 'picked_up_at') is not null
    and (d -> 'execution' ->> 'first_submitted_at') is not null and (d -> 'execution' ->> 'approved_at') is not null
    and (d -> 'execution' ->> 'published_at') is not null and (d -> 'execution' ->> 'completed_at') is not null, (d -> 'execution')::text);
  perform pg_temp.ok('execution', 'execution measured separately: on time, one revision round',
    (d -> 'execution' ->> 'first_draft_on_time')::boolean and (d -> 'execution' ->> 'revision_rounds')::int = 1, (d -> 'execution')::text);
  perform pg_temp.ok('execution', 'performance kept apart: the after window is running, no results yet',
    d -> 'performance' ->> 'status' = 'window_running' and (d -> 'performance' ->> 'results_open_on')::date = current_date + 21, (d -> 'performance')::text);
  perform pg_temp.ok('trial', 'the history holds every step',
    (select array_agg(action order by id) from marketing_campaign_events where campaign_id = v_cid)
      = array['created', 'assigned', 'picked_up', 'file_added', 'submitted', 'changes_requested', 'file_added', 'submitted',
              'approved', 'published', 'completed'], (select string_agg(action, ', ' order by id) from marketing_campaign_events where campaign_id = v_cid));
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L)', v_cid, 'submit'));
  perform pg_temp.ok('rules', 'nothing moves after completion', v ? 'error', v::text);

  -- ── No cost leaves the owner side ──
  perform pg_temp.ok('no cost', 'the campaign record holds no cost',
    (select to_jsonb(c)::text from marketing_campaigns c where id = v_cid) !~* 'cost', null);
  v := pg_temp.as_user(m1, format('select campaign_detail(%L)', v_cid));
  perform pg_temp.ok('no cost', 'what the team sees holds no cost', v::text !~* 'cost' and not (v ? 'error'), null);
  perform pg_temp.ok('no cost', 'stored products carry only name, brand and arrival',
    not exists (select 1 from marketing_campaigns c, jsonb_array_elements(c.products) x, jsonb_object_keys(x) k
                 where c.id = v_cid and k not in ('product_id', 'name', 'brand', 'arrived_on', 'arrival_basis')), null);
  perform pg_temp.ok('no cost', 'no campaign notification mentions cost',
    not exists (select 1 from notifications where event_type like 'campaign\_%' and (title || body) ~* 'cost'), null);

  -- ── Direct writes and history ──
  v := pg_temp.as_user(m1, format($q$ with u as (update marketing_campaigns set stage = 'done' where id = %L returning 1) select to_jsonb(count(*)) from u $q$, v_cid));
  perform pg_temp.ok('rules', 'no direct writes to campaigns', v ->> 'state' = '42501', v::text);
  v := pg_temp.as_user(owner_a, format($q$ with u as (insert into marketing_campaign_events (campaign_id, action) values (%L, 'comment') returning 1) select to_jsonb(count(*)) from u $q$, v_cid));
  perform pg_temp.ok('rules', 'no direct writes to history, even for owners', v ->> 'state' = '42501', v::text);
  begin
    update marketing_campaign_events set note = 'edited' where campaign_id = v_cid;
    perform pg_temp.ok('rules', 'history cannot be edited', false, 'update went through');
  exception when others then
    perform pg_temp.ok('rules', 'history cannot be edited', sqlerrm like '%append-only%', sqlerrm);
  end;

  -- ── A team campaign, and the daily reminders ──
  v := pg_temp.as_user(owner_a, format('select to_jsonb(campaign_create(%L))',
         (base - 'assignee_employee_id') || jsonb_build_object('assign_to_team', true, 'title', 'Trial: team campaign', 'deadline', current_date::text)));
  v_cid2 := (v #>> '{}')::uuid;
  v := pg_temp.as_user(m2, format('select campaign_detail(%L)', v_cid2));
  perform pg_temp.ok('team', 'both marketing people see a team campaign', v ->> 'stage' = 'assigned'
    and pg_temp.as_user(m1, format('select campaign_detail(%L)', v_cid2)) ->> 'stage' = 'assigned', null);
  update marketing_campaigns set deadline = current_date - 1 where id = v_cid2;
  perform campaign_daily();
  perform pg_temp.ok('reminders', 'an overdue team draft reminds the marketing role',
    exists (select 1 from notifications where event_type = 'campaign_overdue' and audience_roles = array['marketing']
             and dedupe_key like 'campaign_overdue:' || v_cid2 || ':%'), null);
  v := pg_temp.as_user(m2, format('select campaign_act(%L, %L)', v_cid2, 'pick_up'));
  perform pg_temp.ok('team', 'one of them picks it up and becomes the assignee', v ->> 'assignee_name' is not null and v ->> 'stage' = 'working', left(v::text, 200));
  v := pg_temp.as_user(m1, format('select campaign_act(%L, %L, %L)', v_cid2, 'add_file', '{"kind":"draft","caption_text":"x"}'));
  perform pg_temp.ok('team', 'the other can follow it but not draft on it', v ? 'error', v::text);

  -- ── Nothing outward ──
  perform pg_temp.ok('nothing outward', 'no new function makes a network call or calls another service',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and (p.proname like 'mkt\_%' or p.proname like 'campaign\_%')
                   and p.prosrc ~* '(net\.http|http_(get|post|request)|extensions\.http|functions/v1|\.invoke\()'), null);
  perform pg_temp.ok('nothing outward', 'no new function writes to Lightspeed, ad, Meta, Instagram or purchase order tables',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and (p.proname like 'mkt\_%' or p.proname like 'campaign\_%')
                   and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(lightspeed_|ad_|meta_|instagram_|purchase_order|paid_ads)'), null);
  perform pg_temp.ok('nothing outward', 'no trigger on Lightspeed, ad or purchase order tables calls campaign code',
    not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
                 where c.relname ~ '^(lightspeed_|ad_|meta_|instagram_|purchase_order|paid_ads)' and (p.proname like 'mkt\_%' or p.proname like 'campaign\_%')), null);

  -- ── Arrival evidence for new arrivals ──
  select count(*) into v_n from mkt_products() where arrival_basis = 'lightspeed_receiving';
  perform pg_temp.ok('new arrivals', 'arrival dates use Lightspeed receiving where it exists', v_n > 0, v_n || ' products');
  perform pg_temp.ok('new arrivals', 'every arrival is labelled with its evidence',
    not exists (select 1 from mkt_products() where arrived_on is not null and arrival_basis is null), null);
end $$;

select jsonb_build_object(
  'passed', (select count(*) from r where pass), 'failed', (select count(*) from r where not pass),
  'failures', (select coalesce(jsonb_agg(jsonb_build_object('area', area, 'case', case_name, 'detail', left(detail, 300)) order by n), '[]') from r where not pass),
  'cases', (select jsonb_agg(area || ' | ' || case_name || ' => ' || case when pass then 'PASS' else 'FAIL' end order by n) from r),
  'trial', (select jsonb_agg(jsonb_build_object('step', step, 'by', actor, 'stage', stage, 'approval', approval, 'note', note) order by n) from trial)) res;
rollback;
