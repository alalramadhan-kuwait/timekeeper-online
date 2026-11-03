# Studio ↔ Instagram

The studio (claude.ai artifact `UQ2iS18beg8zt9DztSLNZ6`, «ستوديو تايم كيبر») shows each posted film's Instagram
report, each account's numbers, what we have learned, and whether the sync is healthy. Since 3 Nov 2026 none of it
depends on a Claude conversation or scheduled task: Supabase captures and computes everything on its own, and the
page reads the result live.

The page is kept in `studio/studio.html` (the artifact's source as published). `studio/test/shot.js` renders it at
iPhone size against a stub of the artifact runtime. The stub's data file can carry recorded Supabase replies under
`__page` and `__cands`, so the connector path is tested too.

## Who does what

| Part | Where it runs | When |
|------|---------------|------|
| Instagram figures (posts, Reels watch time and skip rate, account reach, audience) | `instagram-sync` edge function, cron `instagram-daily-sync` | 08:15 Kuwait |
| The 48-hour and 7-day reads | `instagram-sync` `mode:"fresh"`, cron `instagram-fresh-sync` | every 3 h at :40 |
| Reports, learning, account numbers | `studio_refresh()`, crons `studio-refresh` and `studio-refresh-morning` | every 3 h at :50, and 08:30 |
| Watchdog | `instagram_watchdog()`, cron `instagram-watchdog` | every hour at :25 |
| Prediction models: a weekly check, replaced only when better | `ig_models_check()`, cron `ig-models-weekly` | Sunday 07:10 |
| Instagram's official news | a Claude scheduled task (`Instagram updates weekly check`), writing through `ig_update_add` | Sunday 11:17 |
| Showing it | the studio page, through the viewer's own Supabase connector | when the page is opened, then every 30 min while it is open |

The watchdog does the following:

- It marks a run stuck for more than 20 minutes as failed.
- It retries a failed or partial run once.
- It starts a fresh read that has not run for over 3 h 20, and a daily read that has not run by 09:30 Kuwait.
- Every problem goes into `instagram_sync_alerts`.
- After two failures in a row it sends the owner one notification (`instagram_sync_failed`, at most once per 12 h).
- A successful run closes the open alerts.

The studio's «حالة المزامنة» page shows the last successful run and the next one. It also shows each account, the
open problems, Reels Instagram gave no figures for, and films still waiting for a confirmed link. «حدّث الحين» calls
`instagram_sync_now()`, which will not start a second run while one is going or within 5 minutes of the last.

## How the page reads

The page declares the `mcp` capability for one tool: Supabase `execute_sql`. The first time someone opens it, claude.ai
asks whether the page may use their Supabase connector. With it, the page calls:

- `studio_page(jsonb)` with the posted films. This registers new posts, links them, and returns
  `{at, films, learn, dash, status}`. It never overwrites a confirmed link.
- `studio_candidates(jsonb)` for the «أي منشور هو؟» picker: recent posts of the film's kind, with a suggestion.
- `studio_confirm(jsonb, media_id)` when the owner confirms a post. The link is then by Instagram's post ID, and the
  film keeps `posted.media_id`.
- `instagram_sync_now()` for «حدّث الحين».

Each answer is cached in the studio's own database as `studio/ig`. Anyone without the connector, or on a device that
cannot use it, sees the last copy with its time. Supabase wraps rows in an `<untrusted-data-…>` block and names the
marker once in the sentence before it. The page takes the JSON array between the matching opening and closing tags.

The page writes only:

- `studio/ig`: the cache.
- `studio/ig_choices`: rule suggestions the owner dismissed.
- `films/<id>.posted`: the confirmed `media_id` and `permalink`.
- `studio/rules`: only when the owner taps «إي، خلها قاعدة» on a finding.

Nothing changes a film's video, slides, caption, state or versions. Nothing posts to Instagram, and no recommendation
becomes a rule without that tap.

## Linking a film to its post

1. «تم النشر ✓» marks the film posted and opens the picker.
2. The owner taps the post. It is stored by its Instagram post ID (`method: owner`, confirmed).
3. Until then, the database may suggest a post from the film's caption (60%+ of words) or its twin film's caption
   (30%+, with every other post 20 points behind). The page shows that as «مقترح · أكّد», never as confirmed. Two
   near-equal matches suggest nothing.
4. One post belongs to one film (unique index). A pasted Instagram link also works.

## The reports

`ig_post_report(media_id, stage)` answers in Kuwaiti Arabic:

- شنو نجح؟
- شنو ما نجح؟
- شنو الدليل؟
- شنو نتعلم حق الفيلم القادم؟

Every line carries how much it can be trusted:

| Mark | Level | When |
|------|-------|------|
| ✓ | مؤكد | a 7-day read, 15+ posts in the baseline, a ratio ≥ 1.5 or ≤ 0.67 |
| ◐ | ملاحظة أولية | everything between |
| ○ | دليل ضعيف | under 24 h old, under 8 posts in the baseline, no ratio, or an estimate |

The page shows the early, 48-hour and 7-day reads side by side («مبكرة / 48 ساعة / 7 أيام»).

**Watch time.** Instagram's `ig_reels_avg_watch_time` is the average per person who was shown the Reel, including
those who scrolled past in the first second. The report says it that way: «الشخص العادي شاف 9.7 من 100.5 ث (10%)»
(Halter 1). A 10% average is mostly the 71% who skipped in the first 3 seconds. The report adds an estimate, marked
as such, of how long the people who stayed watched:

- If p is the skip rate and skippers watched between 0.5 and 3 s:
  - lowest: (avg − 3p) / (1 − p)
  - highest: (avg − 0.5p) / (1 − p)
- For Halter 1 that is about 26–32 s.
- Under 20% of the film watched on average adds a «ما نجح» line.

The comparison base is the median of the account's previous 30 posts of the same format (120 days):

- It uses the same age when 5+ of those posts have a read there (48 h: nearest 48 h within 42–60 h; 7 d: nearest
  168 h within 150–200 h).
- Otherwise it uses their final figures, and the verdict is labelled «مبدئي».
- A figure Instagram did not give reads «غير متوفر», never 0. Views are shown and never scored.

## Learning

`ig_recipe(username)` groups each account's final posts:

- when they were posted
- the opening line
- the content type
- caption length
- hashtags
- slide count
- the studio's own tags, which include the opening (`hook.type`) and the test the film ran (`test`)

A group counts as a pattern only when all of these hold:

- 5+ posts in it, and 5+ outside it
- a 25%+ gap
- a share of good posts unlikely by chance (z ≥ 1.5 / 2 / 2.5 for low / medium / high)

Patterns are labelled as correlations. «التعلّم» groups them as مؤكد / ملاحظة أولية / دليل ضعيف. Only a confirmed
one is offered as a rule, with «تخليها قاعدة؟» for the owner to accept or dismiss. `ig_brief` turns the recipe into
«قبل الفيلم الجاي» per kind, with one test aimed at the weakest signal and one thing not tried yet.

## When Claude makes a film

Write these on the film record, so the reports and the learning can use them:

- `seconds`: the film's length.
- `hook`: `{text, type}`, the opening line as spoken or shown, and its kind (`سؤال`, `نتيجة`, `رقم`, `قصة`, `صدمة`).
- `test`: the one thing this film tries differently (for example «افتتاحية بالنتيجة بأول ثانيتين»), or leave it out.
- `meta` and `topic` as before.

Never invent one of these after the fact. A film without them is simply not counted for that dimension.

## The numbers screen

`ig_dash2(username)` (inside `studio_refresh`) gives each account:

- **Two numbers.** Reach over the last 7 days against the week before. The second number depends on the account:
  - timekeeperkw: shares per 1000 reach
  - timegallerykw: saves per 1000 reach
  - the shop: profile visits, plus website clicks
  - The second number is not judged on fewer than 3 posts in a week.
- **A chart** of daily reach over 35 days.
- **The gist:** one note and one recommendation.
  - The note names the format that moved, per post: posts 2 to 9 days old against posts 7 to 67 days old. Week totals are not used, because they punish young posts.
  - The recommendation is the brief's first test for that format.
- **Per format:** this week against usual.
- **The models' accuracy.**
- **A shift**, if one is open.

Priorities: Timekeeper first and the default when the studio opens, the gallery second, the shop basic only.

## Predictions

The number is the expected reach after 7 days, with a range.

**The model.** One per account and format (`ig_models`), for Timekeeper carousels, Timekeeper Reels and gallery images. Others are skipped until they have 20 final posts.

- The base is the account's level: the median log reach of its last 10 final posts of the format (`ig_level`).
- The post's features (opening line, content type, caption length, slide count, posting time, studio attributes such as style or brand) can move it. Each feature's effect is shrunk by n/(n+8).
- How much the features count is chosen on the newest 30% of training posts (`lambda`). Features that do not help on unseen posts get 0.
- The range is the 15th–85th percentile of errors, widened 10%.

**Validation.** Every model is tested on posts it has not seen:

- the median % error
- the share of results inside the range
- the level-alone error, for comparison

On 3 Nov 2026 the features did not beat the level for any of the three models, so every v1 is level-only:

| Model | Median error | Inside range | Posts tested |
|-------|--------------|--------------|--------------|
| Timekeeper carousels | 69% | 81% | 42 |
| Timekeeper Reels | 37% | 77% | 22 |
| Gallery images | 18% | 75% | 16 |

**The weekly check** (`ig_models_check`, Sunday):

1. It splits the posts the active model has never seen in two.
2. A candidate trained up to the middle is tested on the second half against the active model.
3. The candidate replaces it only with a median error 2 points lower and a range no further from 70%.

Every version stays in `ig_models`, and every check in `ig_model_checks`.

**For a film:**

- A film waiting for approval or ready gets `studio_predict`: the number, the range, and 2–3 suggestions.
  - Suggestions come only from patterns that passed the chance test at medium or high confidence, plus the brief's tests.
  - No promised gains are shown.
- The prediction is kept in `ig_predictions` as it stood when the film was last seen unposted (basis `before`).
- A film posted before predictions existed gets one worked out from the level at its Instagram post time (basis `after`, said so on the page).
- After 7 days `ig_predictions_settle` writes the actual reach and whether it fell in the range. Only confirmed links count.

When an account's reach is in a detected drop, the card says the prediction may be high. The level lags by a week because it uses final posts.

## Changes in our accounts

`ig_detect_shifts` runs with each refresh, for Timekeeper and the gallery. A shift is recorded when the last 7 days' median daily reach is 30% below the 4 weeks before, with 5 or more days in the bottom quarter. A rise of 40% with 5 or more days in the top quarter counts too.

Each shift is recorded in `ig_shifts` with:

- the day it started
- each format's median reach per post before and after
- posts per week before and after
- any official update announced from 14 days before to 3 days after

On 3 Nov 2026 it found the drop from 25 Oct:

- daily median 120 thousand down to 48 thousand
- Reels 11.4 thousand per post down to 4.4 thousand
- carousels unchanged at 12.5 thousand per post
- the same posting rate

## Instagram updates

A Claude scheduled task (`Instagram updates weekly check`, Sunday 11:17 Kuwait, bound to the session that built it, since scheduled tasks cannot carry the Supabase connector in this organisation) reads:

- Instagram's and Meta's official channels
- the Graph API and Instagram Platform changelogs
- reputable coverage

It records each relevant item with `ig_update_add`:

- **Source kind:** official, third party or unverified. Only an official item can be important.
- **Affects:** which formats, and whether it affects us.
- **Action:** at most one suggested test.

It then logs the check with `ig_update_check_done`. The studio shows important items affecting us under الأرقام, and the recent list under التعلّم ← «تحديثات إنستغرام». Nothing changes a creative rule.

If that session ends, create the same task from claude.ai with the Supabase connector added, using the prompt in the task.

The first item recorded is official: Graph API v21.0 ends on 21 Jan 2027. The sync moved to v26.0 on 3 Nov 2026 after a full test on the three accounts: same figures, nothing lost, the same Reel metrics withheld as on v21.
