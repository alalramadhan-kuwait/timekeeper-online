#!/usr/bin/env python3
"""Builds the whole soundtrack from its stems and lays it under the rendered picture.

   python3 mix.py renders/X-nomusic.mp4 music.wav renders/X.mp4 film.json

Only the picture is taken from the render. The narration clips, the sound effects and beds (scene.sfx, scene.beds)
and the score are placed again from the storyboard, so the balance can change without a re-render:
  - the narration sits on top, every clip at the same level;
  - effects and beds sit lower (SFX_DB) and dip further while someone speaks (SFX_DIP);
  - the score dips under the narration (MUSIC_DB, DIP_DB) and breathes back up between lines.
The result is normalised to -14 LUFS for social."""
import json, os, subprocess, sys, tempfile
import numpy as np

H = os.path.dirname(os.path.abspath(__file__)); FF = os.environ.get('FFMPEG', 'ffmpeg'); SR = 44100
SKILL_SFX = os.path.join(H, '..', '..', '.claude', 'skills', 'paper-story', 'assets', 'sfx')
VOICE_DB = 0.0                         # narration clips are levelled to -20 dBFS RMS
SFX_DB, SFX_DIP = -5.0, -9.0           # effects against the narration, and how far they dip under a line
MUSIC_DB, DIP_DB = -9.0, -8.0          # the score's level against the narration, and how far it dips under a line
_cache = {}


def load(f, mono=False):
    if (f, mono) not in _cache:
        raw = subprocess.run([FF, '-v', 'error', '-i', f, '-ac', '1' if mono else '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        a = np.frombuffer(raw, np.float32).astype(np.float64)
        _cache[(f, mono)] = a if mono else a.reshape(-1, 2)
    return _cache[(f, mono)]


def sfx_file(name, sb_dir):
    for d in (os.path.join(sb_dir, 'sfx'), SKILL_SFX):
        f = os.path.join(d, name if name.endswith('.wav') else name + '.wav')
        if os.path.exists(f): return f
    sys.exit('sound effect not found: ' + name)


def place(track, a, t0, gain_db, length=None, fade=0.0):
    i = int(round(t0 * SR))
    if i >= len(track): return
    if length is not None:                                   # a bed: loop it to length, fade both ends
        n = int(length * SR); reps = int(np.ceil(n / max(1, len(a))))
        a = np.tile(a, (reps, 1))[:n].copy()
        if fade:
            k = min(int(fade * SR), n // 2); ramp = np.linspace(0, 1, k)[:, None]
            a[:k] *= ramp; a[n - k:] *= ramp[::-1]
    a = a[: len(track) - i] * 10 ** (gain_db / 20)
    track[i:i + len(a)] += a


def envelope(key, attack=.03, release=.35, step=64):
    env = np.zeros(len(key)); att, rel = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR)); e = 0.0
    for i in range(0, len(key), step):
        v = key[i:i + step].max(initial=0); e = v + (e - v) * (att ** step if v > e else rel ** step); env[i:i + step] = e
    return np.clip(env / .05, 0, 1)


if __name__ == '__main__':
    src, music, out, sb_path = sys.argv[1:5]
    sb = json.load(open(sb_path)); sb_dir = os.path.dirname(os.path.abspath(sb_path))
    N = int(round(sum(sc['dur'] for sc in sb['scenes']) * SR))
    voice, fx, key = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros(N)
    t = 0.0
    for i, sc in enumerate(sb['scenes']):
        if sc.get('voice'):
            c = load(os.path.join(sb_dir, sc['voice']), mono=True)
            a = t + sc.get('voiceAt', .15)
            place(voice, np.repeat(c[:, None], 2, axis=1), a, VOICE_DB)
            j = int(a * SR); key[j:j + len(c)] += np.abs(c[: max(0, N - j)])
        cues = list(sc.get('sfx', []))
        if not sc.get('silent') and not (sb.get('audio') or {}).get('autoSfx') is False:
            if i > 0 and sc.get('transition', 'slide') in ('slide', 'push', 'rise', 'drop'): cues.append({"at": 0, "name": "paper_slide", "gain": -9})
            if 'banner' in sc or i == 0: cues.append({"at": .3, "name": "paper_place", "gain": -14})
        for c in cues:
            f = os.path.join(sb_dir, c['file']) if c.get('file') else sfx_file(c['name'], sb_dir)
            place(fx, load(f), t + c['at'], (c.get('gain', -8)) + SFX_DB)
        for bd in sc.get('beds', []):
            frm = bd.get('from', 0); to = bd.get('to', sc['dur'])
            place(fx, load(sfx_file(bd['name'], sb_dir)), t + frm, bd.get('gain', -22) + SFX_DB, length=to - frm, fade=.4)
        t += sc['dur']
    env = envelope(key)
    m = np.pad(load(music), ((0, max(0, N - len(load(music)))), (0, 0)))[:N]
    mix = voice + fx * (10 ** (SFX_DIP * env / 20))[:, None] + m * 10 ** (MUSIC_DB / 20) * (10 ** (DIP_DB * env / 20))[:, None]
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, 'a.f32'); mix.astype(np.float32).tofile(f)
        subprocess.run([FF, '-v', 'error', '-y', '-i', src, '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', f, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                        '-af', 'loudnorm=I=-14:TP=-1.2:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-t', '%.3f' % (N / SR), out], check=True)
    print('wrote', out)
