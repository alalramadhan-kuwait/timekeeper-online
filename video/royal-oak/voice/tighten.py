#!/usr/bin/env python3
"""Shortens the narrator's long pauses so the film fits its length, without changing the voice's speed or pitch.
   python3 tighten.py      # n.mp3 -> clips/n.wav (10% quicker, pauses over MAXP cut to MAXP, edges trimmed), then clips.json"""
import json, os, subprocess, wave
import numpy as np
FF = os.environ.get('FFMPEG', 'ffmpeg'); SR = 44100; MAXP = {'default': 0.30, '7': 0.42}; TEMPO = 1.10   # a touch quicker than the stock read: the film is fast
H = os.path.dirname(os.path.abspath(__file__)); out = {}
for l in json.load(open(os.path.join(H, 'manifest.json')))['lines']:
    n = str(l['n'])
    raw = subprocess.run([FF, '-v', 'error', '-i', os.path.join(H, l['file']), '-af', 'atempo=%.3f' % TEMPO, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    win = int(0.02 * SR); env = np.sqrt(np.convolve(x * x, np.ones(win) / win, 'same'))
    loud = env > 10 ** (-42 / 20)
    idx = np.flatnonzero(loud); a, b = max(0, idx[0] - int(.03 * SR)), min(len(x), idx[-1] + int(.12 * SR)); x, loud = x[a:b], loud[a:b]
    keep = np.ones(len(x), bool); maxp = int(MAXP.get(n, MAXP['default']) * SR); i = 0
    while i < len(x):
        if not loud[i]:
            j = i
            while j < len(x) and not loud[j]: j += 1
            if j - i > maxp: keep[i + maxp // 2: j - maxp // 2] = False
            i = j
        else: i += 1
    y = x[keep]; fade = int(.004 * SR); y[:fade] *= np.linspace(0, 1, fade)
    f = os.path.join(H, 'clips', n + '.wav'); os.makedirs(os.path.dirname(f), exist_ok=True)
    with wave.open(f, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
    out[n] = {'file': 'clips/%s.wav' % n, 'seconds': round(len(y) / SR, 2), 'text': l['text']}
json.dump(out, open(os.path.join(H, 'clips.json'), 'w'), indent=1, ensure_ascii=False)
print({k: v['seconds'] for k, v in out.items()}, 'total %.1f' % sum(v['seconds'] for v in out.values()))
