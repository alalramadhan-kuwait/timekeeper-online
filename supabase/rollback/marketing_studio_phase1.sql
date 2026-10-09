-- Rollback for Marketing Studio, phase 1 (back office 3.6.0).
-- NOT a migration: run only to withdraw phase 1 after a failed release, then
-- revert the 3.6.0 merge on main so the old Inbox comes back with it.
--
-- It removes exactly what the phase 1 migration added and nothing else:
-- no existing table, column, policy, grant, role or page list is touched.
-- Campaign tasks still open in the Inbox are closed as Cancelled, so nobody is
-- left with a task whose campaign no longer exists. Campaign notifications are
-- removed for the same reason.
--
-- If any draft files were uploaded, empty the 'campaign-files' bucket through
-- the Storage API (or dashboard) first; Supabase refuses SQL deletes of files.
begin;

select cron.unschedule('marketing-campaign-daily')
 where exists (select 1 from cron.job where jobname = 'marketing-campaign-daily');

update public.assigned_tasks set status = 'Cancelled', updated_at = now()
 where source_table = 'marketing_campaigns' and status = 'Open';
delete from public.notifications where event_type like 'campaign\_%';
delete from public.notification_settings where event_type in ('campaign_review', 'campaign_changes',
  'campaign_approved', 'campaign_published', 'campaign_overdue', 'campaign_review_waiting');

drop policy if exists campaign_files_read on storage.objects;
drop policy if exists campaign_files_upload on storage.objects;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'campaign-files') then
    raise exception 'campaign-files still holds files: empty it through the Storage API first';
  end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id = 'campaign-files';
end $$;

-- these take the campaign row type, so they go before the table
drop function if exists public.mkt_allowed(public.marketing_campaigns, text);
drop function if exists public.mkt_assignee_user(public.marketing_campaigns);
drop function if exists public.mkt_next_actions(public.marketing_campaigns);
drop function if exists public.mkt_sync_task(public.marketing_campaigns);

drop table if exists public.marketing_campaign_results, public.marketing_campaign_files,
  public.marketing_campaign_events, public.marketing_campaigns, public.marketing_objective_settings;

drop function if exists public.campaign_act(uuid, text, jsonb);
drop function if exists public.campaign_create(jsonb);
drop function if exists public.campaign_daily();
drop function if exists public.campaign_detail(uuid);
drop function if exists public.campaign_form_options(text, text, text);
drop function if exists public.campaign_list();
drop function if exists public.mkt_append_only();
drop function if exists public.mkt_can_see(uuid);
drop function if exists public.mkt_can_upload(uuid);
drop function if exists public.mkt_is_owner();
drop function if exists public.mkt_kuwait_today();
drop function if exists public.mkt_log(uuid, text, text, text, text, text, jsonb);
drop function if exists public.mkt_my_employee_ids();
drop function if exists public.mkt_name(uuid);
drop function if exists public.mkt_path_campaign(text);
drop function if exists public.mkt_product_arrival(text, timestamptz);
drop function if exists public.mkt_product_misfit(text, numeric, text, text, date);
drop function if exists public.mkt_products(text, text, text[]);

commit;
