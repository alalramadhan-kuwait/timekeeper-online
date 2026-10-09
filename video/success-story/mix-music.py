#!/usr/bin/env python3
"""Lays the music under a rendered film and ducks it under the narration.

   MUSIC_GAIN=-90 python3 simple.py && node render.mjs simple.json -o renders/X-nomusic.mp4 ...   # voice + paper sounds, no music
   python3 mix-music.py renders/X-nomusic.mp4 renders/X.mp4

Timing comes from simple.json, so the music follows any change to scene lengths:
  - the hook scene (if any) plays the music's drop, then the film proper starts the music from the top;
  - 7 bars of the calm intro are repeated so the drop lands on the 2018 scene;
  - the music is pushed down while any narration clip plays (sidechain on the clips themselves).
The cover (renders/cover/time-keeper-story-cover.jpg) is attached when present."""
import json, os, subprocess, sys, tempfile
import numpy as np

H = os.path.dirname(os.path.abspath(__file__))
FF = os.environ.get('FFMPEG', 'ffmpeg')
SR = 44100
MUSIC = os.path.join(H, 'assets', 'audio', 'music-option1.m4a')   # Higgsfield sonilo_music job 155fa6d3, 123 bpm
DROP = 31.55                       # where the drop hits in the music
BAR = 240 / 123.0
INSERT_BARS, SPLICE = 7, 23.745    # repeat 7 bars of the build that ends at SPLICE


def load(f):
    raw = subprocess.run([FF, '-v', 'error', '-i', f, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def main(src, out, sbname='simple.json'):
    sb = json.load(open(os.path.join(H, sbname)))
    i = lambda t: int(round(t * SR))
    total = sum(s['dur'] for s in sb['scenes']); N = i(total)
    m = load(MUSIC)
    xf = i(0.04); ramp = np.linspace(0, 1, xf)[:, None]
    def join(a, b):
        a = a.copy(); a[-xf:] = a[-xf:] * (1 - ramp) + b[:xf] * ramp; return np.concatenate([a, b[xf:]])
    L = sb.get('musicInsertBars', INSERT_BARS) * BAR
    ext = join(join(m[:i(SPLICE)], m[i(SPLICE - L):i(SPLICE)]), m[i(SPLICE):])

    mus = np.zeros((N, 2), np.float32); key = np.zeros((N, 2), np.float32)
    t = 0.0; start = 0.0
    for sc in sb['scenes']:
        if sc.get('hook'):
            seg = m[i(DROP):i(DROP + sc['dur'])].copy(); f = i(0.3)
            seg[-f:] *= np.linspace(1, 0, f)[:, None]
            mus[i(t):i(t) + len(seg)] += seg[:N - i(t)]
            start = t + sc['dur']
        if sc.get('voice'):
            c = load(os.path.join(H, sc['voice'])); a = i(t + sc.get('voiceAt', 0.15))
            key[a:a + len(c)] += c[:max(0, N - a)]
        t += sc['dur']
    a = i(start); n = min(len(ext), N - a)
    mus[a:a + n] += ext[:n]
    print('film %.2f s, music from %.2f s, drop at %.2f s' % (total, start, start + DROP + L))

    with tempfile.TemporaryDirectory() as d:
        mus.tofile(os.path.join(d, 'm.f32')); key.tofile(os.path.join(d, 'k.f32'))
        cover = os.path.join(H, 'renders', 'cover', 'time-keeper-story-cover.jpg')
        raw = ['-f', 'f32le', '-ar', str(SR), '-ac', '2']
        cmd = [FF, '-v', 'error', '-y', '-i', src] + raw + ['-i', os.path.join(d, 'm.f32')] + raw + ['-i', os.path.join(d, 'k.f32')]
        if os.path.exists(cover): cmd += ['-i', cover]
        cmd += ['-filter_complex',
                '[1:a]loudnorm=I=-17:TP=-2[m];[m][2:a]sidechaincompress=threshold=0.04:ratio=5:attack=30:release=450:makeup=1[bed];'
                '[0:a]aresample=44100[fx];[fx][bed]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.2[a]',
                '-map', '0:v', '-map', '[a]']
        if os.path.exists(cover): cmd += ['-map', '3:v', '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic']
        cmd += ['-c:v:0', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]
        subprocess.run(cmd, check=True)
    print('wrote', out)


if __name__ == '__main__':
    main(*sys.argv[1:4])
