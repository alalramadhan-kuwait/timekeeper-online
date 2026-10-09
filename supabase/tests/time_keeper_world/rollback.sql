-- Time Keeper World: rollback.
--
-- LEVEL 1 - switch off (seconds, keeps every record, undone by re-running the grants
-- at the end of the migration and re-enabling the triggers).
-- Use when anything looks wrong: owners lose the World, the sync stops logging receipts,
-- nothing is deleted.

revoke execute on function public.world_snapshot(text) from authenticated;
revoke execute on function public.world_po_search(text, text, text, text, date, date, int, int) from authenticated;
revoke execute on function public.world_po_detail(uuid) from authenticated;
revoke execute on function public.world_mission_act(text, text, date, text, text) from authenticated;
revoke execute on function public.world_mission_history(text) from authenticated;
alter table public.purchase_order_items disable trigger world_line_received;
alter table public.purchase_order_items disable trigger world_line_first_seen;
alter table public.purchase_orders disable trigger world_po_received;
alter table public.purchase_orders disable trigger world_po_first_seen;

-- LEVEL 2 - remove (only with a separate owner approval at the time; it deletes the
-- World's own logs, and because it contains DROP it must be run by an owner in the Supabase
-- SQL editor: the SQL tools used from Claude sessions stall on DROP). It deletes the
-- World's own logs). Before running it, the two logs are exported to
-- supabase/backups/world-logs-<date>.json in both repos:
--   select jsonb_build_object(
--     'receipt_events', (select coalesce(jsonb_agg(e order by e.id), '[]') from world.receipt_events e),
--     'mission_events', (select coalesce(jsonb_agg(e order by e.id), '[]') from world.mission_events e));
-- Source records (purchase_orders, purchase_order_items, stock) are not touched by either level.

drop trigger if exists world_line_received on public.purchase_order_items;
drop trigger if exists world_line_first_seen on public.purchase_order_items;
drop trigger if exists world_po_received on public.purchase_orders;
drop trigger if exists world_po_first_seen on public.purchase_orders;

drop function if exists public.world_snapshot(text);
drop function if exists public.world_po_search(text, text, text, text, date, date, int, int);
drop function if exists public.world_po_detail(uuid);
drop function if exists public.world_mission_act(text, text, date, text, text);
drop function if exists public.world_mission_history(text);
drop function if exists public.world_guard();

drop view if exists world.data_issues;
drop view if exists world.po_ledger;
drop table if exists world.mission_events;
drop table if exists world.receipt_events;
drop table if exists world.meta;
drop function if exists world.log_line_receipt();
drop function if exists world.log_po_receipt();
drop function if exists world.forbid_change();
drop schema if exists world;      -- no CASCADE: fails loudly if anything unexpected is left

-- The column goes last, and only after lightspeed-po-sync is redeployed without it;
-- otherwise the next sync would fail writing it.
alter table public.purchase_orders drop column if exists ls_received_at;
