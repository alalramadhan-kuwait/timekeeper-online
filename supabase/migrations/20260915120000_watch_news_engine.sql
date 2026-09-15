-- Watch News engine: the feed the Content Planner draws from.
--
-- Marketing needed a standing answer to "what do we post about today". This
-- pulls the watch press on a schedule, scores each story against the brands we
-- actually carry, and keeps the lead photo so a slide can be built from it
-- without anyone hunting for an image.
--
-- Two deliberate choices:
--   * Sources live in a table, not in the function, so adding a site is an
--     INSERT and a dead feed is visible (last_status) instead of silent.
--   * The photo is MIRRORED into storage rather than hot-linked. A browser
--     canvas cannot export a frame it drew a cross-origin image into, so
--     rendering a slide needs the bytes on our own origin. It also means the
--     slide still renders after the article is edited or taken down.

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  feed_url text not null,
  homepage text,
  weight numeric not null default 1,      -- nudges the ranking; 1 is neutral
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_status text,                        -- 'ok · 12 items' or the failure, shown on the page
  created_at timestamptz not null default now()
);
comment on table public.news_sources is
  'RSS/Atom feeds the watch-news-sync function reads. Disable a source here rather than deleting it, so its stories keep their attribution.';
comment on column public.news_sources.last_status is
  'Result of the most recent sync for this feed. A feed URL that has moved shows up here instead of quietly returning nothing.';

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources(id) on delete set null,
  source_name text,                        -- denormalised so attribution survives a deleted source
  guid text not null,                      -- feed's own id, or the link when it has none
  title text not null,
  link text,
  summary text,
  author text,
  published_at timestamptz,

  -- Arabic, because that is what goes on the slide. Written by the sync when an
  -- Anthropic key is configured, and editable by hand either way.
  title_ar text,
  slide_top_ar text,
  slide_bottom_ar text,

  image_url text,                          -- our mirrored copy (public storage URL)
  image_source_url text,                   -- where it came from, for credit and re-fetch
  image_credit text,

  brands text[] not null default '{}',     -- matched against public.brands
  score numeric not null default 0,
  status text not null default 'New',      -- New | Shortlisted | Used | Hidden
  content_task_id uuid references public.content_tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.news_items is
  'One story per row, deduped by (source_id, guid). status is the marketing triage state; content_task_id links the story to the Content Planner task it became.';
comment on column public.news_items.score is
  'Ranking score from the sync: source weight + recency + brands we carry + launch/auction keywords. Recomputed on every sync, so it decays as a story ages.';

create unique index if not exists news_items_source_guid_key on public.news_items (source_id, guid);
create index if not exists news_items_rank_idx on public.news_items (status, score desc, published_at desc);
create index if not exists news_items_published_idx on public.news_items (published_at desc);

-- RLS: everyone signed in can read the feed (it is public news), marketing and
-- above triage it. Same shape as the other marketing modules.
alter table public.news_sources enable row level security;
drop policy if exists news_sources_read on public.news_sources;
create policy news_sources_read on public.news_sources for select to public using (true);
drop policy if exists news_sources_write on public.news_sources;
create policy news_sources_write on public.news_sources for all to public
  using (get_my_role() in ('admin', 'manager', 'marketing'))
  with check (get_my_role() in ('admin', 'manager', 'marketing'));

alter table public.news_items enable row level security;
drop policy if exists news_items_read on public.news_items;
create policy news_items_read on public.news_items for select to public using (true);
drop policy if exists news_items_write on public.news_items;
create policy news_items_write on public.news_items for all to public
  using (get_my_role() in ('admin', 'manager', 'marketing'))
  with check (get_my_role() in ('admin', 'manager', 'marketing'));

-- Mirrored article photos and the TK slide artwork. Public-read so the canvas
-- can draw them without a signed URL round-trip on every render; writes stay
-- service-role (the sync) or marketing (uploading the overlay art).
insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

drop policy if exists news_images_read on storage.objects;
create policy news_images_read on storage.objects for select to public
  using (bucket_id in ('news-images', 'brand-assets'));
drop policy if exists news_images_write on storage.objects;
create policy news_images_write on storage.objects for all to public
  using (bucket_id in ('news-images', 'brand-assets') and get_my_role() in ('admin', 'manager', 'marketing'))
  with check (bucket_id in ('news-images', 'brand-assets') and get_my_role() in ('admin', 'manager', 'marketing'));

-- Seed the watch press. These are the feeds the trade actually reads; most are
-- WordPress, where /feed/ is the convention. Verify them on the first sync —
-- last_status names any that have moved, and fixing one is an UPDATE here.
insert into public.news_sources (name, feed_url, homepage, weight) values
  ('Hodinkee',        'https://www.hodinkee.com/feed',            'https://www.hodinkee.com',        1.3),
  ('Fratello',        'https://www.fratellowatches.com/feed/',    'https://www.fratellowatches.com', 1.1),
  ('Monochrome',      'https://monochrome-watches.com/feed/',     'https://monochrome-watches.com',  1.1),
  ('SJX Watches',     'https://watchesbysjx.com/feed/',           'https://watchesbysjx.com',        1.2),
  ('WatchPro',        'https://www.watchpro.com/feed/',           'https://www.watchpro.com',        1.0),
  ('aBlogtoWatch',    'https://www.ablogtowatch.com/feed/',       'https://www.ablogtowatch.com',    0.9),
  ('Worn & Wound',    'https://wornandwound.com/feed/',           'https://wornandwound.com',        0.8),
  ('Revolution',      'https://revolutionwatch.com/feed/',        'https://revolutionwatch.com',     0.9)
on conflict (name) do nothing;

-- Scheduling. The other syncs are scheduled as pg_cron jobs that post to the
-- function with the shared x-sync-key, and those jobs were created in the
-- Dashboard rather than here — so this migration does not invent a second
-- convention. Run this once, in the SQL editor, alongside the existing jobs
-- (07:00 Kuwait = 04:00 UTC, ahead of the 08:00 Lightspeed and Instagram syncs):
--
--   select cron.schedule('watch-news-sync', '0 4 * * *', $$
--     select net.http_post(
--       url     := 'https://ttshgrujnycapugrmyxs.supabase.co/functions/v1/watch-news-sync',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-sync-key', (select sync_key from public.lightspeed_auth where id = 1)),
--       body    := '{}'::jsonb);
--   $$);
