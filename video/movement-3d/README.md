# Inside the movement

A 30-second, 1080x1920 flight through an automatic watch movement, drawn in three.js as a pure function of time
(`main.js`). The camera is a speck inside a 30 mm movement (one unit is 0.1 mm): over the rotor, under it along the
winding wheels, down into the barrel between the mainspring's coils, out through the gear train, to the pallet stone
in extreme slow motion, around the balance as it comes up to 4 Hz, back out over the whole movement, down through
the dial among the hands, and out to the watch.

The mechanics are the 2D film's (`../movement-energy`): wheels mesh at their tooth ratios with interleaved teeth, the
pallets span 2.5 teeth of a 15-tooth club wheel, the escape wheel moves half a tooth per beat only while the impulse
jewel is in the fork, the fork follows the jewel, the hairspring breathes with the balance, the spring winds as the
rotor's reverser turns one way whatever the rotor does. Gear-train speeds are time-lapsed, every ratio holds.

Energy is light, not arrows: a warm glow at each contact point as the power reaches it, with lights that travel with
it and light the metal around. Words only at the turns: CAPTURE, STORE, TRANSFER, REGULATE, MOTION BECOMES TIME.

```
npm i three@0.169.0 && ln -s <node_modules>/three vendor-three   # three.js, not committed
export NODE_PATH=<dir with playwright-core> FFMPEG=<ffmpeg>
node render.mjs --still 2,18.4 --sub 1 -o stills/                # review (sub 1: no motion blur)
node render.mjs --still 18 --cam "x,y,z;lx,ly,lz;fov" -o cams/   # design a shot from any camera
node render.mjs -o frames/ --workers 2                           # 900 frames, motion blur on fast moves (WebGL via SwiftShader)
node render.mjs --events > events.json && python3 score.py events.json audio.wav
node render.mjs --cover renders/cover.jpg
ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -af loudnorm=I=-14:TP=-1.2 \
       -c:a aac -b:a 192k -t 30 renders/inside-the-movement.mp4
python3 ../../.claude/skills/paper-story/scripts/deliver.py renders/inside-the-movement.mp4 renders/cover.jpg renders/inside-the-movement-share.mp4
```
