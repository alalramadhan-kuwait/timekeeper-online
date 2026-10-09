-- Time Keeper World: receipt-log trigger tests. One transaction, ends in ROLLBACK.
-- Uses the open partially received PO with the most lines; changes are rolled back.

begin;
create temp table r (n serial, case_name text, pass boolean, detail text);

-- Run one statement as the Lightspeed sync does: service_role, no user.
create or replace function pg_temp.as_sync(p_sql text) returns void language plpgsql as $f$
begin
  set local role service_role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $f$;

do $$
declare
  v_po uuid; v_line uuid; v_recv numeric; v_before bigint; v_ev record; v_other uuid;
begin
  select l.id into v_po from world.po_ledger l
   where l.record_class = 'active' and l.receipt_state = 'partial' order by l.lines desc limit 1;
  select i.id, i.received_qty into v_line, v_recv from purchase_order_items i
   where i.po_id = v_po and coalesce(i.received_qty, 0) < coalesce(i.ordered_qty, 0) limit 1;

  -- 1. The sync (service_role, no user) receives one more unit on a line.
  select count(*) into v_before from world.receipt_events;
  perform pg_temp.as_sync(format('update purchase_order_items set received_qty = coalesce(received_qty, 0) + 1 where id = %L', v_line));
  select * into v_ev from world.receipt_events order by id desc limit 1;
  insert into r (case_name, pass, detail) values ('sync receives a unit: one line event, first detected, by the sync',
    (select count(*) from world.receipt_events) = v_before + 1 and v_ev.event = 'line_received_changed'
      and v_ev.old_received = coalesce(v_recv, 0) and v_ev.new_received = coalesce(v_recv, 0) + 1
      and v_ev.timestamp_basis = 'first_detected' and v_ev.actor = 'lightspeed sync' and v_ev.source_received_at is null,
    to_jsonb(v_ev)::text);

  -- 2. The sync rewrites the same value (as its upsert does every run): no event.
  select count(*) into v_before from world.receipt_events;
  perform pg_temp.as_sync(format('update purchase_order_items set received_qty = received_qty, synced_at = now() where po_id = %L', v_po));
  insert into r (case_name, pass) values ('sync rewrites unchanged lines: no event',
    (select count(*) from world.receipt_events) = v_before);

  -- 3. A payment edit on the PO: no receipt event.
  select count(*) into v_before from world.receipt_events;
  perform pg_temp.as_sync(format('update purchase_orders set payment_status = payment_status, amount_paid = amount_paid where id = %L', v_po));
  insert into r (case_name, pass) values ('payment edit: no receipt event',
    (select count(*) from world.receipt_events) = v_before);

  -- 4. Lightspeed marks the PO received and provides its own received time.
  perform pg_temp.as_sync(format('update purchase_orders set status = %L, ls_received_at = %L where id = %L', 'Fully Received', '2026-10-08 09:15:00+00', v_po));
  select * into v_ev from world.receipt_events where po_id = v_po order by id desc limit 1;
  insert into r (case_name, pass, detail) values ('Lightspeed received time: kept as the source time',
    v_ev.event = 'po_changed' and v_ev.new_status = 'Fully Received' and v_ev.timestamp_basis = 'source'
      and v_ev.source_received_at = '2026-10-08 09:15:00+00', to_jsonb(v_ev)::text);

  -- 5. Received status without a Lightspeed time: first detected, never invented.
  select id into v_other from purchase_orders
   where merged_into is null and status in ('Ordered', 'Pending Approval') and id <> v_po limit 1;
  perform pg_temp.as_sync(format('update purchase_orders set status = %L where id = %L', 'Partially Received', v_other));
  select * into v_ev from world.receipt_events where po_id = v_other order by id desc limit 1;
  insert into r (case_name, pass, detail) values ('no Lightspeed time: first detected, source time empty',
    v_ev.timestamp_basis = 'first_detected' and v_ev.source_received_at is null, to_jsonb(v_ev)::text);

  -- 6. A person edits a received count in Supplier Payments: logged as a user edit.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', (select id from profiles where role = 'operations' limit 1))::text, true);
  update purchase_order_items set received_qty = received_qty + 1 where id = v_line;
  select * into v_ev from world.receipt_events order by id desc limit 1;
  insert into r (case_name, pass, detail) values ('a person edits a count: logged as a user edit, with who',
    v_ev.actor = 'user' and v_ev.actor_user is not null, to_jsonb(v_ev)::text);
  perform set_config('request.jwt.claims', '', true);

  -- 7. A new line arrives already received: first seen.
  perform pg_temp.as_sync(format('insert into purchase_order_items (po_id, ls_product_id, name, ordered_qty, received_qty, cost) values (%L, %L, %L, 2, 2, 1)', v_po, 'world-test-product', 'Receipt test line'));
  select * into v_ev from world.receipt_events order by id desc limit 1;
  insert into r (case_name, pass, detail) values ('line appears already received: first seen event',
    v_ev.event = 'line_first_seen_received' and v_ev.old_received is null and v_ev.new_received = 2, to_jsonb(v_ev)::text);
end $$;


-- Overhead of the receipt log on sync-sized writes (all 7,511 lines), measured inside this rolled-back transaction.
do $$
declare t0 timestamptz; a numeric; b numeric; c numeric; n bigint;
begin
  t0 := clock_timestamp();
  update purchase_order_items set synced_at = synced_at where po_id is not null;               -- no watched column: trigger cannot fire
  a := extract(epoch from clock_timestamp() - t0) * 1000;
  t0 := clock_timestamp();
  update purchase_order_items set received_qty = received_qty, synced_at = now() where po_id is not null;   -- what the sync does each run
  b := extract(epoch from clock_timestamp() - t0) * 1000;
  select count(*) into n from world.receipt_events;
  t0 := clock_timestamp();
  update purchase_order_items set received_qty = coalesce(received_qty, 0) + 1 where po_id is not null;   -- worst case: every line changes
  c := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into r (case_name, pass, detail) values ('timing: 7,511 lines, baseline / sync rewrite / every line changes (ms)', true,
    round(a) || ' / ' || round(b) || ' / ' || round(c) || '  events from worst case: ' || ((select count(*) from world.receipt_events) - n));
end $$;

select jsonb_build_object(
  'passed', (select count(*) from r where pass), 'failed', (select count(*) from r where not pass),
  'cases', (select jsonb_agg(case_name || ' => ' || case when pass then 'PASS' else 'FAIL' end order by n) from r),
  'timing', (select detail from r where case_name like 'timing%'),
  'failures', (select coalesce(jsonb_agg(jsonb_build_object('case', case_name, 'detail', left(detail, 300))), '[]') from r where not pass)) res;
rollback;
