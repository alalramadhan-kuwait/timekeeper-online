#!/usr/bin/env python3
"""Original score for the Royal Oak story, synthesised here (no samples, no generated music). A 1970s studio
sound: electric piano, a round bass, brushed drums, a string pad. D minor, 92 bpm, cut to the scenes in film.json:

  1970 ........ electric piano alone, a clock-like hat
  the call .... bass and brushes come in
  night ....... drums drop out, a celesta figure over the pad
  the sketch .. staccato strings climb with the drawing
  steel ....... the groove returns
  Basel ....... a full hit on the reveal, D major
  the end ..... a breath on "many doubted it", then the last chord rings out under the final line

   python3 score.py film.json music.wav"""
import json, sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(11)
sb = json.load(open(sys.argv[1])); durs = [s['dur'] for s in sb['scenes']]
starts = np.cumsum([0] + durs[:-1]); DUR = float(sum(durs)); N = int(DUR * SR) + SR
S = lambda i, t=0.0: float(starts[i - 1] + t)            # scene i (1-based), plus local time
BEAT = 60 / 92.0

NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'])}
def hz(n):
    name, o = n[:-1], int(n[-1]); return 440 * 2 ** ((NOTE[name] - 9) / 12 + (o - 4))

CH = {'Dm9': ['D3', 'F3', 'A3', 'C4', 'E4'], 'G13': ['G2', 'F3', 'B3', 'E4'], 'Bbmaj7': ['Bb2', 'D3', 'F3', 'A3'], 'Am7': ['A2', 'G3', 'C4', 'E4'],
      'Gm9': ['G2', 'F3', 'Bb3', 'D4', 'A4'], 'C7': ['C3', 'E3', 'Bb3', 'D4'], 'Fmaj9': ['F2', 'E3', 'A3', 'C4', 'G4'], 'A7': ['A2', 'G3', 'C#4', 'E4'],
      'Dmaj9': ['D3', 'F#3', 'A3', 'C#4', 'E4'], 'Bb': ['Bb2', 'D3', 'F3', 'Bb3'], 'F': ['F2', 'C3', 'F3', 'A3'], 'C': ['C3', 'E3', 'G3', 'C4'], 'Dm': ['D3', 'F3', 'A3', 'D4'],
      'Gmaj7': ['G2', 'F#3', 'B3', 'D4']}
ROOT = {k: v[0][:-1] for k, v in CH.items()}

out = np.zeros((N, 2))
def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or len(sig) == 0: return
    sig = sig[: N - i]
    if sig.ndim == 1: sig = np.stack([sig * np.sqrt((1 - pan) / 2), sig * np.sqrt((1 + pan) / 2)], 1) * np.sqrt(2)
    out[i: i + len(sig)] += sig * gain

def adsr(n, a=.005, r=.2):
    t = np.arange(n) / SR; return np.minimum(1, t / a) * np.clip((n / SR - t) / r, 0, 1)

def epiano(f, dur, vel=1.0):
    """FM electric piano: a bright tine that mellows, a bell-like attack."""
    n = int(dur * SR); t = np.arange(n) / SR
    idx = 2.2 * vel * np.exp(-t * 5) + .3
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t * 1.1)
    s += .25 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t * 30) * vel
    return s * adsr(n, .003, .25)

def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3) + .12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 6)
    return s * np.exp(-t * 1.4) * adsr(n, .008, .08)

def pad(freqs, dur, cutoff=1400, a=.6, r=.8):
    n = int(dur * SR); t = np.arange(n) / SR; L = np.zeros(n); R = np.zeros(n)
    for j, f in enumerate(freqs):
        for h in range(1, 14):
            if f * h > 9000: break
            w = np.exp(-((f * h) / cutoff) ** 2) / h
            L += w * np.sin(2 * np.pi * f * .998 * h * t + h + j); R += w * np.sin(2 * np.pi * f * 1.002 * h * t + 2 * h + j)
    e = np.minimum(1, t / a) * np.clip((dur - t) / r, 0, 1)
    return np.stack([L * e, R * e], 1)

def stac(f, dur=.16):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for h in range(1, 10): s += np.sin(2 * np.pi * f * h * t) / h * np.exp(-((f * h) / 2500) ** 2)
    return s * adsr(n, .01, .08)

def celesta(f, dur=1.2):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 8)) * np.exp(-t * 3) * adsr(n, .002, .1)

def kick(v=1.0):
    n = int(.35 * SR); t = np.arange(n) / SR; fr = 48 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 9) * v

def brush(v=1.0, dur=.18):
    n = int(dur * SR); t = np.arange(n) / SR; nz = rng.standard_normal(n); nz -= np.convolve(nz, np.ones(4) / 4, 'same')
    return nz * np.exp(-t * 18) * v * .5

def hat(v=1.0):
    n = int(.06 * SR); t = np.arange(n) / SR; nz = rng.standard_normal(n); nz -= np.convolve(nz, np.ones(2) / 2, 'same')
    return nz * np.exp(-t * 70) * v * .4

def swell(dur):
    n = int(dur * SR); t = np.arange(n) / SR; nz = np.convolve(rng.standard_normal(n), np.ones(40) / 40, 'same')
    return nz * (t / dur) ** 3 * 2

def hit(dur=3.0):
    n = int(dur * SR); t = np.arange(n) / SR; fr = 40 + 50 * np.exp(-t * 7)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 1.6) + np.convolve(rng.standard_normal(n), np.ones(30) / 30, 'same') * np.exp(-t * 4) * .6

def comp(chord, t0, t1, pattern, vel=.8, up=0):
    """Electric piano chords on the given beat offsets inside [t0, t1)."""
    t = t0
    while t < t1 - 1e-3:
        for off, ln in pattern:
            if t + off * BEAT >= t1: break
            for k, n in enumerate(CH[chord]):
                f = hz(n) * (2 if up else 1)
                add(epiano(f, ln * BEAT + .4, vel), t + off * BEAT + k * .006, .11 * vel, pan=(k - 2) * .15)
        t += 4 * BEAT

def bassline(chord, t0, t1, steps=(0, 2, 2.5), oct_=1):
    f0 = hz(ROOT[chord] + '2') * (2 ** (oct_ - 1)); t = t0
    while t < t1 - 1e-3:
        for j, off in enumerate(steps):
            if t + off * BEAT >= t1: break
            f = f0 * (1.5 if j == len(steps) - 1 and len(steps) > 2 else 1)
            add(bass(f, BEAT * .9), t + off * BEAT, .32)
        t += 4 * BEAT

def drums(t0, t1, v=1.0, kick_on=(0, 2.5), snare_on=(1, 3), hats=True):
    t = t0
    while t < t1 - 1e-3:
        for b in kick_on:
            if t + b * BEAT < t1: add(kick(v), t + b * BEAT, .5)
        for b in snare_on:
            if t + b * BEAT < t1: add(brush(v), t + b * BEAT, .55, pan=.1)
        if hats:
            for k in range(8):
                if t + k * BEAT / 2 < t1: add(hat(v * (1 if k % 2 else .55)), t + k * BEAT / 2, .35, pan=-.3)
        t += 4 * BEAT

def segment(chords, t0, t1):
    """Split [t0, t1) evenly between chords."""
    d = (t1 - t0) / len(chords); return [(c, t0 + i * d, t0 + (i + 1) * d) for i, c in enumerate(chords)]

# 1 1970: the piano alone, a ticking hat
for c, a, b in segment(['Dm9', 'Bbmaj7'], 0.1, S(2)):
    comp(c, a, b, [(0, 3.5)], .7); add(pad([hz(n) for n in CH[c]], b - a + .6, 900, a=1.0), a, .045)
for k in range(int(S(2) / (BEAT / 2))): add(hat(.5), k * BEAT / 2, .25 if k % 2 else .15, pan=.3)
add(swell(1.2), S(2) - 1.2, .05)
# 2 the call: the groove
for c, a, b in segment(['Dm9', 'G13', 'Dm9', 'G13'], S(2), S(3)):
    comp(c, a, b, [(0, 1.2), (1.5, .4), (2.5, 1.2)], .8); bassline(c, a, b); add(pad([hz(n) for n in CH[c]], b - a + .5, 1100), a, .03)
drums(S(2) + 4 * BEAT * 0, S(3), .8)
# 3 night: no drums, a celesta figure
for c, a, b in segment(['Bbmaj7', 'Am7'], S(3), S(4)):
    add(pad([hz(n) for n in CH[c]], b - a + .8, 800, a=.8), a, .06); comp(c, a, b, [(0, 3.5)], .55)
    fig = [hz(n) * 4 for n in CH[c][1:]] + [hz(CH[c][2]) * 8]
    t = a; i = 0
    while t < b - .05: add(celesta(fig[[0, 2, 1, 3, 2, 1][i % 6]]), t, .05, pan=(.4 if i % 2 else -.4)); t += BEAT / 2; i += 1
# 4 the sketch: strings climb with the drawing
for c, a, b in segment(['Dm', 'Bb', 'F', 'C'], S(4), S(5)):
    add(pad([hz(n) for n in CH[c]], b - a + .5, 1600), a, .05); bassline(c, a, b, steps=(0, 1, 2, 3))
    t = a; i = 0
    while t < b - .02: add(stac(hz(CH[c][[1, 2, 3, 2][i % 4]]) * 2), t, .07, pan=(.3 if i % 2 else -.3)); t += BEAT / 2; i += 1
drums(S(4) + (S(5) - S(4)) / 2, S(5), .6, kick_on=(0, 1, 2, 3), snare_on=(), hats=True)
add(swell(1.4), S(5) - 1.4, .08)
# 5 steel: the groove returns
for c, a, b in segment(['Gm9', 'C7', 'Fmaj9', 'A7'], S(5), S(6)):
    comp(c, a, b, [(0, 1.2), (1.5, .4), (2.5, 1.2)], .85); bassline(c, a, b); add(pad([hz(n) for n in CH[c]], b - a + .5, 1300), a, .035)
drums(S(5), S(6), .9)
add(swell(1.0), S(6) - 1.0, .07)
# 6 Basel: the reveal on the watch, D major
reveal = S(6, 0.12 + 1.95)
add(hit(3.5), reveal, .3)
for c, a, b in [('Bbmaj7', S(6), reveal), ('Dmaj9', reveal, reveal + 3.0), ('Gmaj7', reveal + 3.0, S(7))]:
    comp(c, a, b, [(0, 1.2), (1.5, .4), (2.5, 1.2)], .9, up=(c != 'Bbmaj7')); bassline(c, a, b); add(pad([hz(n) for n in CH[c]], b - a + .6, 2200), a, .06)
drums(reveal, S(7), 1.0)
# 7 the end: a breath, then the last chord under the final line
t_doubt = S(7, .12 + 2.9)
for c, a, b in [('Bbmaj7', S(7), t_doubt)]:
    add(pad([hz(n) for n in CH[c]], b - a + .6, 900), a, .05); comp(c, a, b, [(0, 3.5)], .5)
add(swell(1.4), t_doubt - 1.4, .06)
final = S(7, .12 + 4.45)
add(pad([hz(n) for n in CH['Dmaj9']], DUR - t_doubt + 1, 1800, a=.5, r=2.2), t_doubt, .07)
comp('Dmaj9', t_doubt, t_doubt + 1.0, [(0, 6)], .7)
comp('Dmaj9', final, final + 1.0, [(0, 6)], .9, up=1)
add(hit(3.0), final, .18)
for k, n in enumerate(['A5', 'C#6', 'E6', 'F#6']): add(celesta(hz(n), 2.5), final + .25 + k * .22, .05, pan=(-.3 + .2 * k))

# room and master
ir_n = int(1.8 * SR); ti = np.arange(ir_n) / SR
ir = rng.standard_normal((ir_n, 2)) * np.exp(-ti / .45)[:, None]
M = 1 << int(np.ceil(np.log2(N + ir_n)))
wet = np.stack([np.fft.irfft(np.fft.rfft(out[:, c], M) * np.fft.rfft(ir[:, c], M), M)[:N] for c in (0, 1)], 1)
mix = out + wet * (.18 / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(out)))
mix = mix[: int(DUR * SR)]
fade = np.clip((DUR - np.arange(len(mix)) / SR) / 1.2, 0, 1) ** 1.5; mix *= fade[:, None]
mix = np.tanh(mix / (np.max(np.abs(mix)) + 1e-9) * 1.4) / np.tanh(1.4) * .9
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote %s (%.1f s), reveal at %.2f s, final chord at %.2f s' % (sys.argv[2], DUR, reveal, final))
