#!/usr/bin/env python3
"""Temporary generative score for paper-motion drafts. NOT final music: it exists so pacing and mix can be
reviewed before real music is licensed or composed.

   python3 make-score.py --mood curious --duration 80 --tail 10 -o ep1_temp.wav
   moods: curious (nostalgic, sparse, warm) | momentum (pulse, discovery) | scale (fuller, confident)
The last --tail seconds thin out to a single held note so the ending can return to silence and ticking."""
import numpy as np, wave, argparse
SR = 44100
ap = argparse.ArgumentParser()
ap.add_argument('--mood', default='curious'); ap.add_argument('--duration', type=float, default=80); ap.add_argument('--tail', type=float, default=10)
ap.add_argument('--seed', type=int, default=3); ap.add_argument('-o', '--out', default='score.wav')
a = ap.parse_args()
rng = np.random.default_rng(a.seed)
P = {'curious': dict(bpm=66, dens=.30, pulse=0, pad=.5, rev=2.2, ch=[[50, 57, 62, 65], [46, 53, 57, 62], [53, 57, 60, 64], [48, 55, 59, 64]]),
     'momentum': dict(bpm=84, dens=.55, pulse=.5, pad=.7, rev=1.8, ch=[[50, 57, 62, 65], [46, 53, 58, 62], [53, 57, 60, 65], [48, 55, 60, 64]]),
     'scale': dict(bpm=92, dens=.7, pulse=.8, pad=1.0, rev=2.6, ch=[[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]])}[a.mood]
mf = lambda m: 440 * 2 ** ((m - 69) / 12)
N = int(SR * (a.duration + 3)); out = np.zeros(N)
def add(x, t0):
    i = int(t0 * SR)
    if i < N: out[i:i + len(x)] += x[:N - i]
def pluck(f, d=2.2, g=1.0):
    x = np.arange(int(SR * d)) / SR
    y = sum(am * np.sin(2 * np.pi * f * h * x) * np.exp(-(3.2 + h * 1.6) * x) for h, am in [(1, 1), (2, .35), (3, .18), (4, .08), (5.01, .04)])
    y[:60] *= np.linspace(0, 1, 60); return y * g * .35
def pad(freqs, d, g=1.0):
    x = np.arange(int(SR * d)) / SR; y = np.zeros(len(x))
    for f in freqs:
        for det in (-0.004, 0.004): y += np.sin(2 * np.pi * f * (1 + det) * x + rng.random() * 6) + .25 * np.sin(2 * np.pi * f * 2 * (1 + det) * x)
    e = np.minimum(np.minimum(x / 2.0, 1), np.minimum((d - x) / 2.5, 1)); return y * e * g * .035 * (1 + .12 * np.sin(2 * np.pi * .2 * x))
def thump(g=1.0):
    x = np.arange(int(SR * .25)) / SR; return np.sin(2 * np.pi * (48 + 50 * np.exp(-30 * x)) * x) * np.exp(-12 * x) * g * .5
beat = 60 / P['bpm']; bar = 4 * beat; scale = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17]  # D dorian
T = a.duration - a.tail; bars = int(np.ceil(a.duration / bar)); prog = 0
for b in range(bars):
    t0 = b * bar; ch = P['ch'][b % 4]; live = t0 < T
    if live: add(pad([mf(m) for m in ch], bar + 1.2, P['pad'] * (0.55 + 0.45 * min(1, t0 / (T * .6)))), t0)
    if live:
        for s in range(8):
            ramp = .35 + .65 * min(1, t0 / (T * .7))
            if rng.random() < P['dens'] * ramp * (1 if s % 2 == 0 else .6):
                add(pluck(mf(62 + scale[(prog := (prog + rng.integers(-2, 3)) % len(scale))]), 2.2, .9 + .3 * rng.random()), t0 + s * beat / 2)
        if P['pulse'] and t0 > T * .1:
            for q in range(4): add(thump(P['pulse'] * min(1, t0 / (T * .5))), t0 + q * beat)
if a.tail > 0: add(pluck(mf(62), 6, 1.0) * 1.2, T + .2); add(pad([mf(50), mf(57)], a.tail + 2, .6), T - 1)
# reverb: exponentially decaying noise impulse response, applied by FFT convolution
ir = rng.standard_normal(int(SR * P['rev'])) * np.exp(-3.0 * np.arange(int(SR * P['rev'])) / (SR * P['rev'])); ir /= np.sqrt((ir ** 2).sum())
n = N + len(ir); wet = np.fft.irfft(np.fft.rfft(out, n) * np.fft.rfft(ir, n), n)[:N]
y = out * .55 + wet * .75
y = y[:int(SR * a.duration)]; fo = int(SR * 2.5); y[-fo:] *= np.linspace(1, 0, fo)
y = y / (np.abs(y).max() or 1) * .7
w = wave.open(a.out, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype('<i2').tobytes()); w.close()
print('wrote', a.out, a.mood, round(a.duration, 1), 's')
