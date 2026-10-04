#!/usr/bin/env python3
"""Score for the flight through the movement, synthesised here (no samples, no generated music): 120 bpm, D minor
resolving to D major on the dial, cut to the camera's pace. A building pulse over the rotor and the winding wheels,
a breath over the barrel, tension inside it, full drums through the train, a rush that stops dead before the pallet,
near silence in the slow motion with a deep hit on the impulse, a riser while the balance comes up to 4 Hz, a broad
chord on the reveal, a downward rush through the dial, and D major on the watch.

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
PLAN = [(0, 2.6, 'Dm'), (2.6, 4.6, 'Dm'), (4.6, 6.6, 'Bb'), (6.6, 8.4, 'F'), (8.4, 10.2, 'C'), (10.2, 11.8, 'Dm'), (11.8, 13.2, 'Bb'), (13.2, 15.4, 'C'),
        (15.4, 18.4, 'Dm'), (18.4, 20.6, 'Bb'), (20.6, 22.4, 'Gm'), (22.4, 24.0, 'A'), (24.0, 25.6, 'Bb'), (25.6, 26.9, 'A'), (26.9, 30, 'D')]

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
    return float(np.interp(t, [0, 2.6, 6.6, 7.6, 10.2, 13.2, 15.3, 15.6, 20.6, 24.0, 25.6, 27, 30], [700, 1200, 1500, 700, 1400, 2600, 3200, 500, 700, 2800, 2200, 2600, 900]))
def level(t):
    return float(np.interp(t, [0, 2.6, 6.6, 7.2, 10.2, 13.2, 15.35, 15.45, 20.6, 24.0, 25.6, 26.9, 29.2, 30], [0.45, 0.6, 0.7, 0.45, 0.6, 0.85, 0.95, 0.25, 0.35, 0.9, 0.8, 1.0, 0.8, 0.0]))
for t0, t1, ch in PLAN:
    for k, n in enumerate(CHORDS[ch]):
        pad = saw(f(n), t1 - t0 + 0.6, cutoff((t0 + t1) / 2), detune=0.0035 + 0.001 * k)
        pad *= env(len(pad), 0.2, 0.6)[:, None]
        add(pad, t0, 0.055 * level((t0 + t1) / 2))
    b = saw(f(BASS[ch]), t1 - t0 + 0.3, 260, k=8, detune=0.001) * env(int((t1 - t0 + 0.3) * SR), 0.05, 0.3)[:, None]
    add(b, t0, 0.22 * level((t0 + t1) / 2))

def chord_at(t): return next(c for a, b, c in PLAN if a <= t < b)
def arp(t0, t1, stepf, gainf, octave=2, bright=(2500, 5000)):
    t = t0; i = 0
    while t < t1:
        tones = CHORDS[chord_at(t)]; n = f(tones[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]]) * octave
        add(pluck(n, 0.3, np.interp(t, [t0, t1], bright)), t, 0.15 * gainf(t) * (1.15 if i % 4 == 0 else 0.85), pan=(-0.5 if i % 2 else 0.5)); t += stepf(t); i += 1
# pulse: 8ths over the rotor, 16ths through winding and train, accelerating into the rush, gone for the slow motion
arp(0.3, 6.6, lambda t: 0.25 if t < 2.6 else 0.125, lambda t: np.interp(t, [0.3, 6.6], [0.3, 0.6]))
arp(7.6, 10.2, lambda t: 0.25, lambda t: np.interp(t, [7.6, 10.2], [0.2, 0.5]))
arp(10.2, 15.35, lambda t: float(np.interp(t, [10.2, 13.2, 15.3], [0.125, 0.125, 0.0625])), lambda t: np.interp(t, [10.2, 15.3], [0.6, 0.95]))
arp(20.8, 24.0, lambda t: float(np.interp(t, [20.8, 23.4], [0.25, 0.0625])), lambda t: np.interp(t, [20.8, 24.0], [0.25, 0.85]))
arp(24.0, 25.6, lambda t: 0.125, lambda t: 0.6, octave=4)
t = 26.9; i = 0
while t < 29.2:
    n = f(CHORDS['D'][[0, 2, 1, 3][i % 4]]) * 4; add(pluck(n, 0.5, 5000), t, 0.10 * np.interp(t, [26.9, 29.2], [1, 0.2]), pan=(-0.5 if i % 2 else 0.5)); t += 0.25; i += 1
# drums
for k in range(int((6.6 - 2.6) / 0.5)): add(kick(0.6), 2.6 + k * 0.5, 0.45)
for k in range(int((15.3 - 10.2) / 0.25)): tt = 10.2 + k * 0.25; add(kick(0.9 if k % 2 == 0 else 0.35), tt, 0.5 if k % 2 == 0 else 0.25)
for k in range(int((25.6 - 24.0) / 0.5)): add(kick(0.8), 24.0 + k * 0.5, 0.5)
# design
add(swell(1.2), 1.4, 0.10)
add(impact(2.0), 2.6, 0.18)                                   # under the rotor
add(swell(0.9), 6.7, 0.08)                                    # the breath over the barrel
add(riser(2.4, 200, 1800), 7.8, 0.08)
add(impact(2.4), 10.2, 0.26)                                  # out into the train
add(riser(2.1, 400, 4200), 13.2, 0.14)                        # the rush
add(impact(4.5), 18.45, 0.50)                                 # the impulse, in slow motion
for tt, n in [(15.5, 'D5'), (17.0, 'A4'), (19.6, 'F5')]: add(bell(f(n), 3.0), tt, 0.045, pan=0.2)
add(riser(3.2, 150, 4000), 20.8, 0.15)
add(impact(2.6), 24.0, 0.34)                                  # the whole movement, alive
add(riser(1.2, 3000, 300), 25.6, 0.12)                        # down through the movement
add(impact(3.2), 26.9, 0.42)                                  # among the hands
for tt, n in [(26.95, 'D5'), (27.0, 'A5'), (28.0, 'F#5'), (28.7, 'D6')]: add(bell(f(n), 2.4), tt, 0.06, pan=-0.2)
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
cues = json.load(open(sys.argv[1])) + [{'t': round(3.0 + k * 0.17, 3), 'name': 'click', 'gain': -14} for k in range(22)] + [{'t': 18.45, 'name': 'tick', 'gain': 2}]
for e in cues:
    s = cache.setdefault(e['name'], load(e['name'])); i = int(e['t'] * SR)
    if i >= N: continue
    seg = s[: N - i]; fx[i: i + len(seg)] += seg * 10 ** (e['gain'] / 20)
mix = music / (np.max(np.abs(music)) + 1e-9) * 0.62 + fx * 0.75
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[2], '%.1f s' % DUR)
