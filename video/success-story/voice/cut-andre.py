#!/usr/bin/env python3
"""Cuts the timed Andre narration track back into one clip per line, with lines 2, 3 and 10 split at their pauses
so each place (Boulder, Los Angeles, Kuwait, Geneva) can get its own scene.

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
CUTS[2] = [('2a', 5.08, 9.76), ('2b', 9.76, 10.79), ('2c', 10.79, 12.10)]      # ...في أمريكا. | في بولدر… | ولوس أنجلوس.
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
# Lines re-recorded later in the same voice (Higgsfield text2speech, Andre). Each is levelled to the piece of the
# original track it replaces, so the narration keeps one loudness.
#   2c  ولوس أنجلوس.                                       job af48e350 (was «وسان دييغو.»)
#   3b  والساعات... دايماً حاضرة بقعداتهم.                  job b6b99ff2 (was «بجلساتهم»)
#   5b  فكتبوا... وترجموا الأخبار... وصوّروا الساعات... وسوّوا مقابلات.   job 561baff3 (new line)
REDO = {'2c': ('2c-la.mp3', '2c'), '3b': ('3b-qaadat.mp3', '3b'), '5b': ('5b-work.mp3', '5')}
def rms_db(f):
    r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(r.split('mean_volume:')[1].split('dB')[0])
for cid, (src, ref) in REDO.items():
    f = os.path.join(H, 'andre', src)
    if not os.path.exists(f): continue
    gain = rms_db(os.path.join(H, 'clips', '%s.wav' % ref)) - rms_db(f)
    subprocess.run([FF, '-v', 'error', '-y', '-i', f, '-af', 'volume=%.2fdB' % gain, '-ar', '44100', '-ac', '1', os.path.join(H, 'clips', '%s.wav' % cid)], check=True)
    out[cid] = {'file': 'clips/%s.wav' % cid, 'seconds': {'2c': 1.49, '3b': 3.55, '5b': 5.56}[cid], 'line': out.get(cid, {}).get('line', cid), 'note': 'Re-recorded line, levelled to the original track'}
json.dump(out, open(os.path.join(H, 'clips.json'), 'w'), indent=1)
print('%d clips -> voice/clips/' % len(out))
