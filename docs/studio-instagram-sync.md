# Studio ↔ Instagram sync

The studio (claude.ai artifact `UQ2iS18beg8zt9DztSLNZ6`, «ستوديو تايم كيبر») cannot call Supabase from the page,
so a scheduled Claude task carries the data between them every 6 hours (00:55, 06:55, 12:55, 18:55 UTC, after the
3-hourly `instagram-fresh-sync` at :40). The task (`Studio Instagram sync`) is bound to the Claude session that built
this, because that session holds the Supabase connector; a scheduled task that starts a fresh session gets no
connectors unless it is created from the claude.ai routines page with Supabase added.

The page itself is kept in `studio/studio.html` (the artifact's source as published) with `studio/test/shot.js`, which
renders it at iPhone size against a stub of the artifact runtime.

What it does, and nothing more:

1. Reads `films` from the studio's database.
2. Calls `studio_sync(jsonb)` in Supabase (`ttshgrujnycapugrmyxs`) with every posted film: the film is registered in
   `studio_posts`, linked to its Instagram post (the owner's link first, then its own caption, then its twin film's
   caption; two near-equal matches link nothing), and gets its reports.
3. Writes back only `films/<id>.ig` and `films/<id>.insights` (Instagram reports; hand-written ones are kept), and
   `studio/recipe` and `studio/brief`.

It never changes `studio/rules`, a film's video, slides, caption, state or versions, never posts to Instagram, and
never turns a recommendation into a rule: the recipe and the brief are for the owner's review.

## The reports

`ig_post_report(media_id, stage)` answers, in Kuwaiti Arabic: شنو نجح؟ شنو ما نجح؟ شنو الدليل من الأرقام؟ شنو نجرب
بالفيديو القادم؟

- Compared with the median of the same account's previous 30 posts of the same format (120 days), at the same age
  (48 h: the snapshot nearest 48 h within 42–60 h; 7 d: nearest 168 h within 150–200 h) when 5+ of them have a read
  there, otherwise with their final figures (posts a week old+). Reach is not compared before 6 days without a
  same-age baseline, and such a verdict is labelled «مبدئي».
- Reels: reach, shares per reach, skip rate in the first 3 s (lower is better), average watch time, saves and likes
  per reach; watch time against the film's length is shown. Feed posts: reach, shares, saves, likes, follows and
  comments per reach. Views are shown and never scored.
- A figure Instagram did not give reads «غير متوفر», never 0. Every report carries a confidence.

`ig_recipe(username)` groups each account's final posts (when posted, the opening line, content type, caption length,
hashtags, slide count, the studio's own tags). A group is a pattern only with 5+ posts, 5+ outside it, a 25%+ gap and
a share of good posts unlikely by chance (z ≥ 1.5 / 2 / 2.5 for low / medium / high confidence). Patterns are
labelled as correlations. `ig_brief(recipe, kind)` turns them into the before-the-next-film brief, with one test
aimed at the weakest signal and one thing not tried yet.

## The scheduled task's prompt

```
Studio ↔ Instagram sync for Time Keeper (read-only towards Instagram; never publish anything).

Studio artifact: https://claude.ai/artifact/UQ2iS18beg8zt9DztSLNZ6 (use the ArtifactData tool).
Supabase project: ttshgrujnycapugrmyxs (use the Supabase execute_sql tool).

1. ArtifactData list collection "films" (limit 200) with out_dir in your scratchpad. Keep each document's version.
2. Build {"films": [...]} with one entry per film that has posted.at: id, kind, name, meta, seconds, topic, caption,
   posted (as it is, including posted.permalink), version, rules, slides, and caption_hint = the caption of its twin
   film (the film whose `of` is this id, or the film this one's `of` names) when this film has no caption. Leave out
   fields the film does not have. Never invent a value. If a posted reel has no `seconds` and has `video`, you may
   download that file with the Artifact tool (action read, path = the film's video) and measure it with ffprobe, and
   pass it as seconds; do not write it to the film.
3. Run in Supabase, with the payload as a SQL string literal (double every single quote):
   with r as (select studio_sync('<payload>'::jsonb) x)
   select jsonb_build_object(
     'films', (select jsonb_object_agg(k, jsonb_build_object('ig', (v->'ig') #- '{latest,lessons}' #- '{latest,next}' #- '{latest,numbers}',
                'insights', (select coalesce(jsonb_agg(i - 'lessons' - 'next' - 'numbers'), '[]') from jsonb_array_elements(v->'insights') i))) from jsonb_each(x->'films') e(k, v)),
     'recipe', (x->'recipe') - 'top' - 'best_openings' - 'targets' - 'studio_posts' || jsonb_build_object('source', 'instagram',
                'review', 'للمراجعة: ما تتغير قواعد الاستوديو إلا بموافقتك.', 'accounts',
                (select jsonb_object_agg(k, jsonb_build_object('posts', v->'posts', 'patterns', jsonb_array_length(v->'items'))) from jsonb_each(x->'accounts') e(k, v))),
     'brief', jsonb_build_object('reel', (x->'brief'->'reel') - 'targets' - 'username', 'carousel', (x->'brief'->'carousel') - 'targets' - 'username',
                'username', 'timekeeperkw', 'updated', x->'at', 'source', 'instagram')) doc from r
   If it errors, write nothing and stop; say what failed.
4. Write with ONE ArtifactData batch, each existing document pinned with if_version:
   - for each film in doc.films: op "update", data {"ig": <its ig>, "insights": <the film's current insights entries
     whose source is not "instagram", followed by the new ones>}. Write no other field.
   - studio/recipe: op "set" with doc.recipe; studio/brief: op "set" with doc.brief (pin if_version if they exist).
   If a pinned write fails because the document changed, re-read that document and retry once.
5. Never touch studio/rules, studio/now, studio/topics, inbox, or any film field other than ig and insights. Do not
   change the creative rules from the recipe; it is for the owner's review.
6. Finish with two lines in Arabic: which films were linked and their latest labels, and anything that failed.
```
