-- What we actually got for a photo, not what we hoped for.
--
-- og:image is a share card — typically 1200x630 and cropped — so the sync now
-- measures every candidate the page offers and keeps the biggest. These columns
-- record the outcome so a bad photo is visible before it reaches a slide, and so
-- a rule that stops working on one site is diagnosable rather than mysterious.

alter table public.news_items
  add column if not exists image_width integer,
  add column if not exists image_height integer,
  add column if not exists image_strategy text,
  add column if not exists image_needs_browser boolean not null default false;

comment on column public.news_items.image_width is
  'Measured width of the mirrored photo. A slide is 1080 wide; anything narrower is upscaled and looks it.';
comment on column public.news_items.image_strategy is
  'How the photo was found: feed | og | json-ld | srcset | lazy-attr | wordpress-original | wordpress-scaled | photon-original | cdn-unsized | squarespace-max | img. Names the rule to fix when a site changes.';
comment on column public.news_items.image_needs_browser is
  'No candidate reached slide width by reading the HTML. The page renders its photos in script, so getting the original needs a real browser — this is the queue for that.';

create index if not exists news_items_needs_browser_idx
  on public.news_items (image_needs_browser) where image_needs_browser;
