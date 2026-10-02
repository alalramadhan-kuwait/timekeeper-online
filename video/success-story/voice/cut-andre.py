#!/usr/bin/env python3
"""Cuts the timed Andre narration track back into one clip per line, with lines 2, 3 and 10 split at their pauses
so each place (Boulder, San Diego, Kuwait, Geneva) can get its own scene.

   python3 voice/cut-andre.py            # reads voice/andre/narration.mp3, writes voice/clips/*.wav + voice/clips.json

voice/andre/narration.mp3 is "time-keeper-narration-andre.mp3" from the Higgsfield sandbox: the 15 manifest clips
laid at the cue times below. The split points were found from the track's silences."""
import json, os, subprocess
H = os.path.dirname(os.path.abspath(__file__))
FF = os.environ.get('FFMPEG', 'ffmpeg')
SRC = os.path.join(H, 'andre', 'narration.mp3')
CUES = [1.4, 5.08, 12.91, 19.3, 26.3, 30.5, 39.22, 44.72, 49.22, 57.6, 62.6, 71.24, 75.64, 79.64, 87.64]
SECS = {l['n']: l['seconds'] for l in json.load(open(os.path.join(H, 'manifest.json')))['lines']}
CUTS = {n: [(str(n), CUES[n - 1], CUES[n - 1] + SECS[n] + 0.05)] for n in SECS}
CUTS[2] = [('2a', 5.08, 9.76), ('2b', 9.76, 10.79), ('2c', 10.79, 12.10)]      # ...في أمريكا. | في بولدر… | وسان دييغو.
CUTS[3] = [('3a', 12.91, 15.28), ('3b', 15.28, 18.60)]                        # ...رجعوا الكويت. | والساعات...
CUTS[10] = [('10a', 57.60, 59.35), ('10b', 59.35, 61.35)]                     # ووصلنا جنيف… | قلب صناعة الساعات.
os.makedirs(os.path.join(H, 'clips'), exist_ok=True)
out = {}
for n in sorted(CUTS):
    for cid, a, b in CUTS[n]:
        f = 'clips/%s.wav' % cid
        subprocess.run([FF, '-v', 'error', '-y', '-ss', '%.3f' % a, '-to', '%.3f' % b, '-i', SRC,
                        '-af', 'afade=t=in:d=0.012,areverse,afade=t=in:d=0.03,areverse', '-ar', '44100', '-ac', '1',
                        os.path.join(H, f)], check=True)
        out[cid] = {'file': f, 'seconds': round(b - a, 2), 'line': n}
# 3b was re-recorded with the Kuwaiti word: "والساعات... دايماً حاضرة بقعداتهم." (Higgsfield job b6b99ff2, 3.55 s)
NEW_3B = os.path.join(H, 'andre', '3b-qaadat.mp3')
if os.path.exists(NEW_3B):
    subprocess.run([FF, '-v', 'error', '-y', '-i', NEW_3B, '-ar', '44100', '-ac', '1', os.path.join(H, 'clips', '3b.wav')], check=True)
out['3b']['seconds'] = 3.55
json.dump(out, open(os.path.join(H, 'clips.json'), 'w'), indent=1)
print('%d clips -> voice/clips/' % len(out))
