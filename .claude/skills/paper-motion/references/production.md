# Production notes: camera, sound, review and delivery

These notes come from the Time Keeper success story (`video/success-story/`, 21 scenes, 2 minutes, 14 versions).

## Keep it moving

- Change something visible every 2 to 3 seconds: a camera move, a layer arriving, a cut to a close-up. A scene that
  holds like a poster was the most common note.
- Give every scene a `camera` and lay its layers out at different `depth`s. A wide set can be wider than 720; pan
  across it in time with the narration (a podcast set: writer, then designer, then host).
- Full-screen close-ups cropped from real product photos (`macro()` in story.py, `fit: cover`, a slow scale push)
  cut between the wider shots.

## Camera arithmetic (check every keyframe, not just the scene start)

The stage point `y` appears on screen at `640 + (y - camY) * zoom` (the same formula with 360 for `x`).

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

## Review loop

- Before a full render, render stills at the exact seconds that changed (`--still t1,t2,...`). Read them as one sheet.
  Compute the times from the scene durations rather than guessing.
- When the user sends a screenshot, first check which version it came from. Two notes were about an older version
  than the one already rendering.
- The renderer loads images while it renders. Never swap or edit assets during a render: stop it and start again,
  or the film mixes old and new.
- Name each render with a new version number. Delete partial renders so an old file is never sent by mistake.

## Delivery

- Attach the cover to the MP4 as an `attached_pic` stream, and also send it as a separate JPG: Instagram and TikTok
  ask for the cover when you post.
- Files sent to the user must be under 30 MiB. Re-encode the picture only and **keep the cover stream**. Dropping it
  is how one version went out without its cover:

  ```bash
  ffmpeg -i film.mp4 -map 0:v:0 -map 0:a -map 0:v:1? -c:v:0 libx264 -crf 27 -preset medium \
         -c:v:1 copy -disposition:v:1 attached_pic -c:a copy -movflags +faststart film-send.mp4
  ```

- After the file is sent, check its streams with `ffmpeg -i`: video, audio and the attached picture.
- Commit and push the storyboard source with every version. Media stays git-ignored.

## Spending on generation

- Preflight the cost (`get_cost: true`) and tell the user what was spent.
- Test one image, then batch the rest. Redo only the image that failed, not the batch.
