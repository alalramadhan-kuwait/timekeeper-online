#!/usr/bin/env python3
"""Lays the score under a film rendered without music, and dips it under the narration.

   python3 mix.py renders/X-nomusic.mp4 music.wav renders/X.mp4 [film.json]

The voice clips' own placement (from film.json) drives the dip, so the music breathes back up between lines and
holds under the final title. The result is normalised to -14 LUFS for social."""
import json, os, subprocess, sys, tempfile
import numpy as np

H = os.path.dirname(os.path.abspath(__file__)); FF = os.environ.get('FFMPEG', 'ffmpeg'); SR = 44100
MUSIC_DB, DIP_DB = -9.0, -8.0          # the score's level against the narration, and how far it dips under a line

def load(f):
    raw = subprocess.run([FF, '-v', 'error', '-i', f, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)

src, music, out = sys.argv[1:4]; sb = json.load(open(sys.argv[4] if len(sys.argv) > 4 else os.path.join(H, 'film.json')))
film = load(src); m = load(music); N = int(round(sum(sc['dur'] for sc in sb['scenes']) * SR))   # the film's full length (its own audio can end earlier)
film = np.pad(film, ((0, max(0, N - len(film))), (0, 0)))[:N]
m = np.pad(m, ((0, max(0, N - len(m))), (0, 0)))[:N]
key = np.zeros(N); t = 0.0
for sc in sb['scenes']:
    if sc.get('voice'):
        a = int((t + sc.get('voiceAt', .15)) * SR); c = load(os.path.join(H, sc['voice']))[:, 0]
        key[a:a + len(c)] += np.abs(c[: max(0, N - a)])
    t += sc['dur']
# envelope follower: fast attack, slow release, then a gain that dips while the voice speaks
env = np.zeros(N); att, rel = np.exp(-1 / (.03 * SR)), np.exp(-1 / (.35 * SR)); e = 0.0
step = 64
for i in range(0, N, step):
    v = key[i:i + step].max(initial=0); e = v + (e - v) * (att ** step if v > e else rel ** step); env[i:i + step] = e
dip = 10 ** (DIP_DB * np.clip(env / .05, 0, 1) / 20)
mix = film + m * 10 ** (MUSIC_DB / 20) * dip[:, None]
with tempfile.TemporaryDirectory() as d:
    f = os.path.join(d, 'a.f32'); mix.astype(np.float32).tofile(f)
    subprocess.run([FF, '-v', 'error', '-y', '-i', src, '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', f, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-14:TP=-1.2:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', out], check=True)
print('wrote', out)
