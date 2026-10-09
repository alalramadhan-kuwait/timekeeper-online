# How energy travels through an automatic movement

A 30-second, 1080x1920 motion-graphics film: the wrist moves the rotor, the reverser turns both directions into
one, the mainspring stores the energy, the gear train carries it (each wheel faster than the last), the escapement
lets it out in equal steps and the balance beats at 4 Hz. Ends on the dial.

Everything is drawn in code (`movement.js`, canvas), as a pure function of time, so any frame can be checked.
The mechanics are honest: meshing wheels share a module, turn opposite ways at their tooth ratios and keep their
teeth interleaved; the pallets span 2.5 teeth of a 15-tooth club-tooth wheel; the escape wheel moves half a tooth per
beat, only while the impulse jewel is in the fork; the fork follows the jewel; the hairspring breathes with the
balance. Gear-train speeds are time-lapsed (labelled) but every ratio holds.

The score (`score.py`) is synthesised here, 120 bpm, D minor to D major, with ticks and clicks placed on the times
the mechanics produce (`render.mjs --events`).

```
export NODE_PATH=<dir with playwright-core>  FFMPEG=<ffmpeg>
node render.mjs --still 4.5,19.6 -o stills/          # review
node render.mjs -o frames/                           # 900 JPEG frames
node render.mjs --events > events.json && python3 score.py events.json audio.wav
node render.mjs --cover renders/movement-energy-cover.jpg
ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p \
       -af loudnorm=I=-14:TP=-1.2 -c:a aac -b:a 192k -t 30 renders/movement-energy-v1.mp4
python3 ../../.claude/skills/paper-story/scripts/deliver.py renders/movement-energy-v1.mp4 \
       renders/movement-energy-cover.jpg renders/movement-energy-v1-share.mp4   # opens on the cover, < 30 MB
```
