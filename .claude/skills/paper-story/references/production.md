# Production notes: camera, sound, review and delivery

These notes come from the Time Keeper success story (`video/success-story/`, 21 scenes, 2 minutes, 14 versions) and the
two-part Royal Oak documentary (`video/royal-oak/parts.py`, Gulf Arabic, three review rounds).

## Keep it moving

- Change something visible every 2 to 3 seconds: a camera move, a layer arriving, a cut to a close-up. A scene that
  holds like a poster was the most common note.
- Give every scene a `camera` and lay its layers out at different `depth`s. A wide set can be wider than 720; pan
  across it in time with the narration (a podcast set: writer, then designer, then host).
- Full-screen close-ups cropped from real product photos (`macro()` in story.py, `fit: cover`, a slow scale push)
  cut between the wider shots.

## Motion that answered "it needs more movement" (Royal Oak expert review)

These are cheap and cover every scene; `life()` in `video/royal-oak/parts.py` applies the first two automatically.

- **People breathe:** `idle: {type: "pulse", amp: .005, speed: .22}` from the end of their entrance (it scales from
  the feet). Nobody stands frozen.
- **Taped prints settle:** a 1 to 1.5 degree `rot` drift and a 0.6 % `scale` creep over the time they are on screen.
- **No camera hold longer than about 2 s:** keep a 3 to 5 % drift between beats and add a small push on each beat.
- **Layers at different `depth`:** background .4 to .7, pinned things .85 to .9, the subject 1, foreground 1.1 to 1.3.
- **Light has life:** dust motes in every spotlight (`motes()`), one glint sweep across a hero product photo
  (`glint()`), a lamp whose glow breathes.
- **Things that move in the story move on screen:** the tandem rides, its wheels turn (use `rot` keyframes with an
  ease, not a spin idle, so they slow down) and it brakes on the line where the partners stop; the phone handset
  lifts and the ringing stops.
- **Beats land on words.** Time each visual to the caption word it illustrates. `at(key, caption, phrase)` in
  parts.py computes that time the way the engine spreads the words.
- **Matched cuts instead of slides:** the same calendar in the same place across a cut, the porthole that becomes the
  pencil circle at the same screen size, a fade for a jump in time. No more than two slides in a row.
- **Endings:** a slow push through the last line, then dim everything except the hero (a black plate under it).

## The look (Royal Oak art direction)

- **Everyone stands on something:** a soft contact shadow under each figure and a floor band in empty scenes.
- **One key light** from the upper left for every drop shadow (`SHADOW` in art.py), deeper on dark themes.
- **One palette arc per film**, not a new theme every scene. Light and time of day stay continuous (the same 4 pm in
  both parts of the call).
- **Rooms, not voids:** a studio gets a window, a board and tools; a fair gets bunting, lamps, a banner and a carpet.
  Use the country's colours (Swiss red and white, not French tricolour bunting).
- **Consistent scale:** one height per character pose across the film, so a partner never looks like a child.
- **Covers:** titles sit on a paper band; nothing crosses the title; the person is fully in frame.

## Camera arithmetic (check every keyframe, not just the scene start)

The stage point `y` appears on screen at `640 + (y - camY) * zoom` (the same formula with 360 for `x`).

- **Nothing ever covers a face**: not the banner, a card, a speech bubble or a picture. This was raised twice, so it is
  checked mechanically: `render.mjs story.json --check`. It also flags bubbles and words hidden under the banner. A
  bubble goes between the banner and the heads; when there is no room, lower the camera rather than shrink the bubble.
- **The banner covers the top of the screen** (about y 60 to 160). Every head must stay below about y 190 at every
  camera keyframe. A head under the 2019 banner was a review note.
- Props that stand in front of people must not cross a face: ring lights, mics, stands.
- The person who matters in a shot is big and close. A host who was small and far from the mic was a note. Move the
  pose, scale it up and push the camera in on them at the end of the scene.

## Voice

- Make one clip per line (`voice` per scene, scene length follows the clip), all in the same voice.
- When a line is re-recorded, level it to the others by mean volume before use (`video/success-story/voice/cut-andre.py`).
- The script stays in the user's dialect and wording; send the full script for review before rendering.

## Music under narration (`video/success-story/mix-music.py`)

- Render with the music muted (`MUSIC_GAIN=-90`), then lay the music in a second pass. A re-mix then takes seconds,
  not a re-render.
- Land the music's drop on the key scene. Repeat whole bars of the build-up to push the drop later, and pad the scene
  before it so that scene starts exactly on a bar. story.py computes the bars to insert and writes them to the
  storyboard (`musicInsertBars`); the mixer reads them.
- Duck the music under the voice: sidechain-compress it, keyed by the voice clips themselves. Normalise the result to
  -14 LUFS for social.

## Arabic captions and on-screen text

- **Groups of three words or fewer.** The engine splits a longer `|` group after word three and leaves orphans. Never
  split a number ("سبعة | وستين"), a negation from its verb ("ما | يكفي") or a noun phrase.
- **Western digits (0-9) everywhere.** A "·" next to an Arabic-Indic digit reads as a zero ("١٠ ·" looked like
  "١٠٠"). No dash between two numbers in Arabic: write "10 على 11".
- **Keep the caption band clear** (about y 960 to 1070 at the end camera): no label, price tag or credit there while
  captions are on. `--check` does not catch this; look at the stills.
- **Tags add, they do not repeat.** A tag that says the same words as the caption at the same moment is noise.
  Keep dates, places, quotes set as titles. Quote marks are «».
- **Arabic in a `sketch` text writes itself left to right.** Keep sketch notes in the designer's own language (French
  on a Swiss drawing) and put the Arabic in a tag.
- **Credits:** at least 17 px, light on dark, after the punchline, never under the platform overlay at the bottom.
- **Dialect:** write how people speak, and ask about words that change meaning ("انشغلت" means "got busy" in the
  Gulf, not "was crafted").

## Expert review round

When the user asks for more detail or a second opinion, run a panel of reviewers in parallel, each with the same
pack: the rules, the engine's abilities, a frame strip per scene and the narration with its timings. Panels that
worked: motion director, art director, historian / fact-checker, readability and dialect editor, and an expert in
the product (a watch collector). Ask each for P1/P2/P3 notes with exact coordinates and times. Then merge them into
one plan ordered by priority, apply what needs no credits, list what does, and re-render.

## Facts

- Every claim in the film is in the facts file with its source, and so is every picture's credit.
- **Context is not cause.** The quartz crisis was the backdrop to the decision, not the reason given for the design;
  say it the way the source does.
- Keep the source's hedges ("probably designed by him") and its caveats (a date the subject remembered).

## When voice credits run short

Preflight each line (`get_cost`; about 0.3 credits for a short line, 0.6 for a long one). If the balance does not
cover it, build the scene anyway: give `clips.json` an estimated length (characters ÷ about 11 per second), let the
captions play over the music, and list the line in a `VOICE-TODO.md` with its new text. Record and drop it in when the
user tops up.

## Review loop

- Before a full render, render stills at the exact seconds that changed (`--still t1,t2,...`). Read them as one sheet.
  Compute the times from the scene durations rather than guessing.
- When the user sends a screenshot, first check which version it came from. Two notes were about an older version
  than the one already rendering.
- The renderer reads images while it renders. Never swap or edit assets during a render: stop it and start again,
  or the film mixes old and new. (It now waits for every image to decode before the first frame; before that, large
  cut-outs were missing from the opening frames.)
- Name each render with a new version number. Delete partial renders so an old file is never sent by mistake.

## The Time Keeper end card

Every Time Keeper film ends the same way (the owner's choice, from the success story): on a near-black plate a gold
clock hand sweeps once around and draws the logo, one tick as it starts, the double tick (`tick_pair`) as the screen
falls to black, then 1.3 s of black. It lives in `video/brand/tk_endcard.py`; append it to the storyboard's scenes
and do not change it per film. The music ends with the story (the end card scenes carry `"endcard"`, and
`video/royal-oak/score_parts.py` writes no music under them), so the ticks are heard alone. An optional closing line
can play over it (`caption`, `voice`), as "والوقت… كان مجرد البداية." did in the success story.

## Delivery

- **Open on the cover.** WhatsApp and iMessage use the first frame as the thumbnail, and a paper film usually opens
  dark, so a shared film showed as a black box. `scripts/deliver.py film.mp4 cover.jpg film-share.mp4` holds the cover
  for 0.7 s and cross-fades into the film. It delays the audio by the same 0.7 s, so the narration and music stay in
  sync with the picture. It also attaches the cover as an `attached_pic` stream and steps the quality down until the
  file is under 29 MiB (the send limit is 30). Send that copy.
- Also send the cover as a separate JPG: Instagram and TikTok ask for the cover when you post.
- After making the share copy, check it with `ffmpeg -i`: one video, one audio and one attached picture. Then look
  at the frames at 0, 0.85 and 1.5 s.
- Commit and push the storyboard source with every version. Media stays git-ignored.

## Spending on generation

- Preflight the cost (`get_cost: true`) and tell the user what was spent.
- Test one image, then batch the rest. Redo only the image that failed, not the batch.

## Engine notes

- Inline SVGs share one id namespace: give every gradient, filter and clip a unique id (`uid()` in
  `video/royal-oak/art.py`), or the first definition wins everywhere.
- `z` must be an integer. An element has one `idle`; for a second motion use keyframes.
- A map ring that crosses 180 degrees is unwrapped (it used to draw a band across the map). A small `map` works as a
  taped inset card for routes the main map cannot hold.
