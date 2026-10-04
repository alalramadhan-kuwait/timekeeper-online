#!/usr/bin/env python3
"""Original score and sound design for the movement film, synthesised here (no samples, no generated music):
120 bpm, D minor resolving to D major on the dial. It follows the cut: a swell into the rotor, a building pulse
through the winding and the train, near silence for the slowed escapement (the ticks carry it), a riser while the
balance speeds up to 4 Hz, and an impact on the finale.

   python3 score.py events.json out.wav      # events from: node render.mjs --events
Sound effects (ticks, clicks, whooshes) come from the paper-story kit and land on the times the mechanics give."""
import json, os, subprocess, sys, wave
import numpy as np

SR, DUR = 44100, 30.0
N = int(SR * DUR)
H = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.join(H, '..', '..', '.claude', 'skills', 'paper-story', 'assets', 'sfx')
FF = os.environ.get('FFMPEG', 'ffmpeg')
rng = np.random.default_rng(7)

NOTE = {n: 440 * 2 ** ((i - 9) / 12) for i, n in enumerate(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'])}
def f(n):  # 'D3' -> Hz
    name, octv = n[:-1], int(n[-1]); return NOTE[name] * 2 ** (octv - 4)

CHORDS = {'Dm': ['D3', 'F3', 'A3', 'D4'], 'Bb': ['Bb2', 'D3', 'F3', 'Bb3'], 'F': ['F2', 'C3', 'F3', 'A3'], 'C': ['C3', 'E3', 'G3', 'C4'],
          'Gm': ['G2', 'D3', 'G3', 'Bb3'], 'A': ['A2', 'E3', 'A3', 'C#4'], 'D': ['D3', 'F#3', 'A3', 'D4']}
BASS = {'Dm': 'D2', 'Bb': 'Bb1', 'F': 'F2', 'C': 'C2', 'Gm': 'G1', 'A': 'A1', 'D': 'D2'}
PLAN = [(0, 3, 'Dm'), (3, 5, 'Dm'), (5, 7, 'Bb'), (7, 9, 'F'), (9, 11, 'C'), (11, 13, 'Dm'), (13, 15, 'Bb'), (15, 17, 'F'), (17, 18, 'C'),
        (18, 21, 'Dm'), (21, 23, 'Bb'), (23, 24.75, 'Gm'), (24.75, 26.5, 'A'), (26.5, 30, 'D')]

out = np.zeros((N, 2))
def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or len(sig) == 0: return
    sig = sig[: N - i]
    if sig.ndim == 1: sig = np.stack([sig * (1 - pan) ** 0.5, sig * (1 + pan) ** 0.5], 1) / np.sqrt(2) * np.sqrt(2)
    out[i: i + len(sig)] += sig * gain

def env(n, a, r, hold=None):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-3))
    tail = np.clip((n / SR - t) / max(r, 1e-3), 0, 1); return e * tail

def saw(freq, dur, cutoff, k=18, detune=0.004):
    """band-limited, softened saw (additive), two detuned voices across the stereo field"""
    n = int(dur * SR); t = np.arange(n) / SR; L = np.zeros(n); R = np.zeros(n)
    for h in range(1, k + 1):
        if freq * h > 16000: break
        w = (1 / h) * np.exp(-((freq * h) / cutoff) ** 2)
        L += w * np.sin(2 * np.pi * freq * (1 - detune) * h * t + h); R += w * np.sin(2 * np.pi * freq * (1 + detune) * h * t + 2 * h)
    return np.stack([L, R], 1)

def pluck(freq, dur=0.35, bright=3000):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for h in range(1, 9): s += np.sin(2 * np.pi * freq * h * t) * np.exp(-t * (6 + h * 3)) * np.exp(-((freq * h) / bright) ** 2) / h
    return s * np.minimum(1, t / 0.003)

def bell(freq, dur=3.0):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for r, a, d in [(1, 1, 1.6), (2.76, 0.45, 0.9), (5.4, 0.25, 0.5), (8.9, 0.12, 0.3), (2.0, 0.3, 1.2)]:
        s += a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d)
    return s * np.minimum(1, t / 0.002)

def kick(level=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR; fr = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(fr) / SR; s = np.sin(ph) * np.exp(-t * 7) + 0.25 * rng.standard_normal(n) * np.exp(-t * 120)
    return s * level

def impact(dur=3.2):
    n = int(dur * SR); t = np.arange(n) / SR; fr = 32 + 60 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 1.2)
    nz = rng.standard_normal(n); nz = np.convolve(nz, np.ones(24) / 24, 'same') * np.exp(-t * 3.5)
    return s * 1.0 + nz * 0.5

def riser(dur, f0=200, f1=2400):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    nz = rng.standard_normal(n); k = 40; nz = nz - np.convolve(nz, np.ones(k) / k, 'same')   # thin, airy noise
    tone = np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** u) / SR)
    return (nz * 0.35 + tone * 0.25) * u ** 2.2

def swell(dur):
    n = int(dur * SR); t = np.arange(n) / SR; nz = rng.standard_normal(n); nz = np.convolve(nz, np.ones(60) / 60, 'same')
    return nz * (t / dur) ** 3 * 2.0

# ---- pad and bass follow the plan; the cutoff opens as the energy builds
def cutoff(t):
    return float(np.interp(t, [0, 3, 13, 18, 18.3, 23, 26.5, 27.5, 30], [500, 700, 1800, 2600, 600, 700, 3000, 2200, 900]))
def level(t):
    return float(np.interp(t, [0, 2.8, 3.0, 13, 18, 18.4, 23, 26.4, 26.5, 29, 30], [0.25, 0.5, 0.55, 0.75, 0.85, 0.35, 0.4, 0.9, 1.0, 0.8, 0.0]))
for t0, t1, ch in PLAN:
    seg = 0.25
    for k, n in enumerate(CHORDS[ch]):
        pad = saw(f(n), t1 - t0 + 0.6, cutoff((t0 + t1) / 2), detune=0.0035 + 0.001 * k)
        pad *= env(len(pad), 0.25, 0.6)[:, None]
        add(pad, t0, 0.055 * level((t0 + t1) / 2))
    b = saw(f(BASS[ch]), t1 - t0 + 0.3, 260, k=8, detune=0.001) * env(int((t1 - t0 + 0.3) * SR), 0.05, 0.3)[:, None]
    add(b, t0, 0.22 * level((t0 + t1) / 2))

# ---- pulse: 16ths through winding and train, gone in the slow escapement, back and faster while the balance speeds up
def chord_at(t): return next(c for a, b, c in PLAN if a <= t < b)
step = 0.125; t = 3.0; i = 0
while t < 18.0:
    tones = CHORDS[chord_at(t)]; n = f(tones[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]]) * 2
    vel = np.interp(t, [3, 9, 13, 18], [0.25, 0.45, 0.6, 0.75]) * (1.15 if i % 4 == 0 else 0.85)
    add(pluck(n, 0.3, bright=np.interp(t, [3, 18], [1800, 5000])), t, 0.16 * vel, pan=(-0.5 if i % 2 else 0.5)); t += step; i += 1
t = 23.0; i = 0
while t < 26.4:
    tones = CHORDS[chord_at(t)]; n = f(tones[[0, 2, 1, 3][i % 4]]) * 2
    add(pluck(n, 0.25, 4500), t, 0.15 * np.interp(t, [23, 26.4], [0.35, 0.9]), pan=(-0.4 if i % 2 else 0.4))
    t += float(np.interp(t, [23, 25.5], [0.25, 0.0625])); i += 1
t = 26.5; i = 0
while t < 29.0:
    n = f(CHORDS['D'][[0, 2, 1, 3][i % 4]]) * 4; add(pluck(n, 0.5, 5000), t, 0.10 * np.interp(t, [26.5, 29], [1, 0.2]), pan=(-0.5 if i % 2 else 0.5)); t += 0.25; i += 1

# ---- drums: kicks on the beat once the train builds
for k in range(int((13.0 - 5.0) / 0.5)): add(kick(0.55 + 0.25 * k / 16), 5.0 + k * 0.5, 0.5)
for k in range(10): tt = 13.0 + k * 0.5; add(kick(0.9), tt, 0.55); add(kick(0.35), tt + 0.25, 0.3)
# ---- design: swell into the rotor, risers, impacts, bells
add(swell(1.3), 1.7, 0.18); add(impact(), 3.0, 0.32)
add(riser(2.0, 300, 3000), 11.0, 0.10); add(impact(2.4), 13.0, 0.26)
add(riser(1.0, 500, 2000), 17.0, 0.06)
add(impact(2.0), 18.0, 0.18)
for tt, n in [(18.05, 'D5'), (20.05, 'A4'), (22.05, 'F5')]: add(bell(f(n), 2.6), tt, 0.05, pan=0.2)
add(riser(3.4, 150, 4000), 23.1, 0.16)
add(impact(3.3), 26.5, 0.42)
for tt, n in [(26.55, 'D5'), (26.6, 'A5'), (27.6, 'F#5'), (28.3, 'D6')]: add(bell(f(n), 2.4), tt, 0.06, pan=-0.2)

# ---- room: synthetic reverb on the music
ir_n = int(2.4 * SR); ti = np.arange(ir_n) / SR
ir = rng.standard_normal((ir_n, 2)) * np.exp(-ti / 0.55)[:, None]; ir[:, 0] = np.convolve(ir[:, 0], np.ones(8) / 8, 'same'); ir[:, 1] = np.convolve(ir[:, 1], np.ones(8) / 8, 'same')
M = 1 << int(np.ceil(np.log2(N + ir_n)))
wet = np.stack([np.fft.irfft(np.fft.rfft(out[:, c], M) * np.fft.rfft(ir[:, c], M), M)[:N] for c in (0, 1)], 1)
music = out + wet * (0.22 / np.max(np.abs(wet)) * np.max(np.abs(out)))
fade = np.clip((DUR - np.arange(N) / SR) / 0.9, 0, 1) ** 1.5; music *= fade[:, None]

# ---- sound effects on the mechanics' own times
def load(name):
    raw = subprocess.run([FF, '-v', 'error', '-i', os.path.join(SFX, name + '.wav'), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
cache = {}; fx = np.zeros((N, 2))
for e in json.load(open(sys.argv[1])):
    s = cache.setdefault(e['name'], load(e['name'])); i = int(e['t'] * SR)
    if i >= N: continue
    seg = s[: N - i]; fx[i: i + len(seg)] += seg * 10 ** (e['gain'] / 20)
mix = music / (np.max(np.abs(music)) + 1e-9) * 0.62 + fx * 0.75
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[2], '%.1f s' % DUR)
