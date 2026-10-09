#!/usr/bin/env python3
"""Two sounds the paper-story kit does not have, synthesised here: an old desk telephone's bell (ring.wav) and a
pencil on drafting paper (pencil.wav). python3 sfx.py -> sfx/*.wav"""
import os, wave
import numpy as np
SR = 44100; H = os.path.dirname(os.path.abspath(__file__)); rng = np.random.default_rng(3)

def write(name, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    with wave.open(os.path.join(H, 'sfx', name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())

def bell_ring(dur=0.42, f0=1180.0, rate=22.0):
    """A clapper hitting two bells about 22 times a second."""
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for k, ts in enumerate(np.arange(0, dur, 1 / rate)):
        i = int(ts * SR); tt = t[: n - i]; f = f0 * (1.0 if k % 2 else 1.06)
        s = sum(a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt * d) for r, a, d in ((1, 1, 9), (2.32, .5, 14), (3.9, .25, 22), (5.6, .12, 30)))
        out[i:] += s
    return out * np.minimum(1, (dur - t) / 0.03)

ring = np.zeros(int(1.0 * SR)); r = bell_ring(); ring[: len(r)] += r; ring[int(.55 * SR): int(.55 * SR) + len(r)] += r[: len(ring) - int(.55 * SR)]
write('ring', ring)

def pencil(dur=1.1):
    n = int(dur * SR); t = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - np.convolve(nz, np.ones(6) / 6, 'same')       # papery hiss
    strokes = np.zeros(n); pos = 0.0
    while pos < dur - 0.1:
        L = rng.uniform(.08, .22); a, b = int(pos * SR), int(min(dur, pos + L) * SR); u = np.linspace(0, 1, b - a)
        strokes[a:b] = np.sin(np.pi * u) ** .6 * rng.uniform(.6, 1); pos += L + rng.uniform(.02, .07)
    grain = 1 + .6 * (rng.random(n) < .002)
    return nz * strokes * grain * np.minimum(1, (dur - t) / .05)

write('pencil', pencil())
print('sfx/ring.wav, sfx/pencil.wav')
