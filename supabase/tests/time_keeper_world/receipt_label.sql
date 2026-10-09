-- Time Keeper World: receiving-label fix (20261009131118). One transaction, ends in ROLLBACK.
begin;
create temp table r (n serial, case_name text, pass boolean, detail text);
create or replace function pg_temp.as_sync(p_sql text) returns void language plpgsql as $f$
begin
  set local role service_role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $f$;

do $$
declare v_po uuid; v_ev record; v_hist_before text; v_hist_after text; v_n bigint; s jsonb; d jsonb; v_old uuid;
begin
  -- History as it stands before this test writes anything.
  select md5(coalesce(string_agg(to_jsonb(e)::text, '|' order by e.id), '')), count(*)
    into v_hist_before, v_n from world.receipt_events e;

  -- 8. Lightspeed gives a time while the PO is only partly received: labelled source.
  select id into v_po from world.po_ledger
   where record_class = 'active' and receipt_state = 'not_received' and open_commitment
     and id not in (select po_id from world.receipt_events where po_id is not null) limit 1;
  perform pg_temp.as_sync(format('update purchase_orders set status = %L, ls_received_at = %L where id = %L',
    'Partially Received', '2026-10-09 07:30:00+00', v_po));
  select * into v_ev from world.receipt_events where po_id = v_po order by id desc limit 1;
  insert into r (case_name, pass, detail) values ('Lightspeed time on a part-received PO: labelled source',
    v_ev.timestamp_basis = 'source' and v_ev.source_received_at = '2026-10-09 07:30:00+00', to_jsonb(v_ev)::text);

  -- 9. Events logged before the fix are unchanged: same rows, same stored labels, same times.
  select md5(coalesce(string_agg(to_jsonb(e)::text, '|' order by e.id), '')) into v_hist_after
    from (select * from world.receipt_events order by id limit v_n) e;
  insert into r (case_name, pass, detail) values ('earlier receipt events unchanged',
    v_hist_before = v_hist_after, v_n || ' events');

  -- 10. The snapshot labels every event by the time it shows.
  s := world_snapshot();
  insert into r (case_name, pass, detail) values ('snapshot: source label exactly when a Lightspeed time is shown',
    not exists (select 1 from jsonb_array_elements(s -> 'receipts' -> 'log' -> 'recent') x
                join world.receipt_events e on e.po_id = (x ->> 'po_id')::uuid
                  and e.detected_at = (x ->> 'detected_at')::timestamptz
                where (x ->> 'timestamp_basis') <> case when e.source_received_at is not null then 'source' else 'first_detected' end
                   or (x ->> 'at')::timestamptz <> coalesce(e.source_received_at, e.detected_at)),
    (select jsonb_agg(jsonb_build_object('po', x ->> 'po_number', 'basis', x ->> 'timestamp_basis', 'at', x ->> 'at'))
       from jsonb_array_elements(s -> 'receipts' -> 'log' -> 'recent') x)::text);

  -- 11. PO detail for a PO logged before the fix reads as Lightspeed's time, with first detection kept beside it.
  select po_id into v_old from world.receipt_events where id = (select min(id) from world.receipt_events where source_received_at is not null);
  d := world_po_detail(v_old);
  insert into r (case_name, pass, detail) values ('PO detail: earlier event now labelled source, detection time kept',
    (select count(*) filter (where x ->> 'timestamp_basis' = 'source') from jsonb_array_elements(d -> 'receipt_events') x)
      = (select count(*) from world.receipt_events e where e.po_id = v_old and e.source_received_at is not null)
    and (select bool_and(x ? 'detected_at') from jsonb_array_elements(d -> 'receipt_events') x),
    (d -> 'receipt_events')::text);
end $$;

select jsonb_build_object(
  'passed', (select count(*) from r where pass), 'failed', (select count(*) from r where not pass),
  'cases', (select jsonb_agg(case_name || ' => ' || case when pass then 'PASS' else 'FAIL' end order by n) from r),
  'failures', (select coalesce(jsonb_agg(jsonb_build_object('case', case_name, 'detail', left(detail, 400))), '[]') from r where not pass),
  'detail', (select jsonb_agg(left(detail, 300)) from r)) res;
rollback;
