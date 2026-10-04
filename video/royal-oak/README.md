# A sketch overnight

A 48-second, 9:16 paper story on Gérald Genta and the Audemars Piguet Royal Oak (1970 to 1972), made with the
paper-story skill. Seven scenes, each timed to one narration line: 1970, the call, the night and the diver's helmet,
the sketch, steel, Basel 1972, and the ending.

- `film.py` writes `film.json` (the storyboard). `art.py` holds the paper-cut art; the designer's drawing draws itself
  with the skill's `sketch` element.
- Gérald Genta and the Royal Oak are their own photographs (freely licensed, Wikimedia Commons), cut out as paper and
  credited on screen; see `assets/README.md`. Georges Golay, with no free photograph, is only a phone.
- `FACTS.md` lists every claim and its source.
- Narration: Andre (ElevenLabs via Higgsfield). `voice/manifest.json` has the jobs; `voice/fetch.sh` downloads them and
  `voice/tighten.py` makes the clips (10% quicker, long pauses shortened).
- `sfx.py` makes the phone bell and the pencil; `score.py` synthesises the music from the scene timings; `mix.py` lays
  it under the render and dips it under the voice.

```
(cd voice && bash fetch.sh && FFMPEG=<ffmpeg> python3 tighten.py)
python3 sfx.py && python3 film.py
R=../../.claude/skills/paper-story/scripts/render.mjs
node $R film.json --check
node $R film.json -o renders/X-nomusic.mp4 --scale 1.5 --workers 4
python3 score.py film.json music.wav && python3 mix.py renders/X-nomusic.mp4 music.wav renders/X.mp4
python3 ../../.claude/skills/paper-story/scripts/deliver.py renders/X.mp4 renders/cover.jpg renders/X-share.mp4
```
