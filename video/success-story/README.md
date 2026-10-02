# Time Keeper: Success Story (three episodes)

Vertical paper-craft mini-documentary, built on the `paper-motion` skill (`.claude/skills/paper-motion`).
Story: three friends, a shared passion, a real problem, a small idea, an Arabic watch community, international recognition.

| Episode | Title | Draft length |
| --- | --- | --- |
| 1 | قبل تايم كيبر | 86 s |
| 2 | الفكرة تكبر | 75 s |
| 3 | من مجتمع… إلى علامة | 101 s |

Episode 3 runs over 90 s because the ending (return to the beginning, match cuts, montage) needs room. Trim after narration is recorded.

## Run it

```bash
cd video/success-story
python3 build.py                    # writes ep1.json, ep2.json, ep3.json from the scene definitions
node check-story.mjs --report       # accuracy and brand gate, writes LEDGER.md and SCRIPT-AR.md
./render-all.sh draft               # 720x1280 review renders with the scene-status overlay -> renders/
./render-all.sh final               # 1080x1920 masters; refuses while any gate fails
```

Preview one scene fast: `node ../../.claude/skills/paper-motion/scripts/render.mjs ep1.json --still 28 -o /tmp/still`

## Where each file lives

- `build.py` is the single source: scenes, narration, truth status, claims, sound cues.
- `tk-style.json` is the Time Keeper paper theme (colours, banner, captions).
- `assets/` holds real evidence. **Drop a file named after the placeholder id** (for example `ep1_boulder_university.jpg`) and the placeholder is replaced on the next render. Character art goes in `assets/characters/<id>/front|side/` (see CHARACTERS.md). This folder is git-ignored on purpose.
- `LEDGER.md` is every scene with its status, claims, missing assets and brand relations.
- `SCRIPT-AR.md` is the narration, one line per scene.

## Pipeline status (the 22 steps in the brief)

| # | Step | State |
| --- | --- | --- |
| 1 | Collect historical assets | **Blocked on Time Keeper.** See ASSET-REQUEST.md. Two supplied photos are in use. |
| 2 | Time Keeper colour and theme configuration | **Done from verified evidence only** (logo, brand template). The website and Instagram could not be reached from this environment, so no accent colour is invented. |
| 3 | Founder character sheets | **Not started.** Needs your approval to spend generation credits and photos labelled by name. |
| 4-5 | Approve and lock characters | **Blocked on 3.** |
| 6 | Finalise narration | **Draft written** (SCRIPT-AR.md). Needs your edits and a point-of-view decision. |
| 7-8 | Record narration, split per scene | **Blocked on 6.** Per-scene clips drop in and set each scene's length automatically. |
| 9 | Storyboard | **Done**, 40 scenes. |
| 10 | Match photos to scenes | **Done where photos exist.** Everything else is a labelled placeholder. |
| 11 | Build scenes in paper-motion | **Done** with placeholder founders. |
| 12 | Character actions through Higgsfield | **Blocked on 5.** |
| 13 | Captions | **Done** (word tags, at most four words visible). |
| 14-15 | Music and sound design | **Temporary.** Procedural sound kit and a generated placeholder score. Replace with real music. |
| 16 | Low-resolution draft | **Done.** `renders/ep*_draft_review.mp4`. |
| 17-20 | Reviews: history, Arabic, brand, character | **Open.** The accuracy gate automates the history and brand rules (below). |
| 21-22 | Fix and render 1080x1920 masters | **Waits on the above.** `./render-all.sh final` enforces it. |

## The accuracy gate (`check-story.mjs`)

Encodes sections 17, 18 and 21 of the brief as code, so a bad claim cannot reach a master by accident:

- Every scene has a status: **CONFIRMED** (documented externally, needs a `source`), **FOUNDER** (supplied directly by the founders), **METAPHOR** (artistic), or **UNCONFIRMED** (held, blocks the final render).
- Any scene that names a watch house must classify the relationship (authorized retailer, collaboration, interview or content, manufacture visit, event access, media coverage, other documented) and give evidence.
- Partnership wording (partner, official, authorized, exclusive, شريك, شراكة, رسمي, وكيل) beside a house is rejected unless the relationship is authorized retailer or collaboration with evidence.
- `--final` also fails while real assets are missing.

Currently no house logo appears anywhere, and no house is named in narration. The only classified house is Tudor, from the supplied event photo, as **event access**.

## Decisions needed from Time Keeper

1. **Narrator point of view.** The brief mixes third person ("كانوا ثلاثة شباب") and first person ("إحنا بدينا نشرح"). The draft keeps the brief's lines as written. Pick one voice, or confirm the shift is intended.
2. **What does 2018 mark?** It is on the banner list but not explained. The scene is held as UNCONFIRMED.
3. **Who is who.** Label the supplied photos by name. Three unlabeled photos are in `assets/_unlabeled/` and are not used, because nothing in them says who they show or where they were taken.
4. **House relationships** for every brand that will appear (BRAND-RELATIONS.md).
5. **Official logo file, brand colours beyond black and white, and the Bahij font licence.** The draft uses the app icon and Cairo as stand-ins.
6. **Consent and budget** to generate the three founders as paper characters (CHARACTERS.md).
