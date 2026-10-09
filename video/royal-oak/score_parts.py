#!/usr/bin/env python3
"""Score for the two Arabic parts (part1.json, part2.json), synthesised like score.py: electric piano, round bass,
brushed drums, string pad, celesta. Each scene gets a mood from MOODS, cut to its exact start and length.

   python3 score_parts.py part1.json music1.wav      (or part2.json)"""
import json, sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(11)
sb = json.load(open(sys.argv[1])); durs = [s['dur'] for s in sb['scenes']]
STORY = len([s for s in sb['scenes'] if not s.get('endcard')])     # the Time Keeper end card plays without music, only its ticks
starts = np.cumsum([0] + durs[:-1]); DUR = float(sum(durs)); N = int(DUR * SR) + SR
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


part = 1 if 'part1' in sys.argv[1] else 2
MOODS = {1: [('pad', ['Dm9', 'Fmaj9']), ('rewind', ['Dmaj9']), ('groove_light', ['Fmaj9', 'C7']), ('hit', ['Dmaj9']), ('groove_light', ['Am7', 'Gmaj7']),
             ('groove', ['Gm9', 'C7']), ('groove', ['Bbmaj7', 'A7']), ('pad', ['Dm9', 'G13']), ('groove_light', ['Fmaj9', 'Bbmaj7']), ('tension', ['Dm'])],
         2: [('pad', ['Dm9', 'Bbmaj7']), ('groove', ['Dm9', 'G13']), ('groove', ['Gm9', 'C7']), ('pad', ['Dm9', 'Bbmaj7', 'Gm9', 'A7']), ('groove', ['Dm9', 'G13']), ('celesta', ['Bbmaj7', 'Am7']), ('strings', ['Dm', 'Bb', 'F', 'C']),
             ('pad', ['Fmaj9']), ('groove', ['Gm9', 'C7', 'Fmaj9', 'A7']), ('hit', ['Dmaj9', 'Gmaj7']), ('final', ['Bbmaj7', 'Dmaj9'])]}[part]
for i, (mood, chords) in enumerate(MOODS):
    a, b = float(starts[i]), float(starts[i] + durs[i])
    segs = segment(chords, a, b)
    if mood == 'rewind':
        t_back = a + .12 + 6.25
        add(pad([hz(n) for n in CH['Dmaj9']], t_back - a + .6, 1500, a=1.2, r=.8), a, .06); comp('Dmaj9', a + .1, t_back, [(0, 3.5)], .7, up=1)
        add(swell(2.4)[::-1].copy(), t_back, .16)
        for k in range(14): add(hat(.9), t_back + .1 + k * .12, .5, pan=(.4 if k % 2 else -.4))
        for k, n in enumerate(['D5', 'C#5', 'A4', 'F4', 'D4']): add(celesta(hz(n), 1.4), t_back + .2 + k * .3, .05)
    for c, s0, s1 in segs:
        if mood in ('groove', 'groove_light'):
            comp(c, s0, s1, [(0, 1.2), (1.5, .4), (2.5, 1.2)], .8 if mood == 'groove' else .65); bassline(c, s0, s1); add(pad([hz(n) for n in CH[c]], s1 - s0 + .5, 1200), s0, .035)
        elif mood == 'pad':
            add(pad([hz(n) for n in CH[c]], s1 - s0 + .8, 1000, a=.8), s0, .06); comp(c, s0, s1, [(0, 3.5)], .55)
        elif mood == 'celesta':
            add(pad([hz(n) for n in CH[c]], s1 - s0 + .8, 800, a=.8), s0, .06); comp(c, s0, s1, [(0, 3.5)], .55)
            fig = [hz(n) * 4 for n in CH[c][1:]]; t = s0; k = 0
            while t < s1 - .05: add(celesta(fig[[0, 2, 1, 3, 2, 1][k % 6] % len(fig)]), t, .05, pan=(.4 if k % 2 else -.4)); t += BEAT / 2; k += 1
        elif mood == 'strings':
            add(pad([hz(n) for n in CH[c]], s1 - s0 + .5, 1600), s0, .05); bassline(c, s0, s1, steps=(0, 1, 2, 3)); t = s0; k = 0
            while t < s1 - .02: add(stac(hz(CH[c][[1, 2, 3, 2][k % 4]]) * 2), t, .07, pan=(.3 if k % 2 else -.3)); t += BEAT / 2; k += 1
        elif mood == 'hit':
            comp(c, s0, s1, [(0, 1.2), (1.5, .4), (2.5, 1.2)], .9, up=1); bassline(c, s0, s1); add(pad([hz(n) for n in CH[c]], s1 - s0 + .6, 2200), s0, .06)
        elif mood == 'tension':
            add(pad([hz(n) for n in CH['Dm']], s1 - s0, 700, a=1.5, r=.3), s0, .07)
            for k in range(int((s1 - s0 - 2.2) / (BEAT / 2))): add(hat(.6 + .4 * k / 40), s0 + k * BEAT / 2, .3, pan=.3)
        elif mood == 'final':
            pass
    if mood in ('groove',): drums(a, b, .85)
    if mood == 'groove_light': drums(a, b, .55, kick_on=(0,), snare_on=(2,))
    if mood == 'hit':
        reveal = a + .12 + 2.6; add(hit(3.5), reveal, .3); drums(reveal, b, 1.0)
    if mood == 'final':
        t_end = a + .12 + 8.0
        add(pad([hz(n) for n in CH['Bbmaj7']], t_end - a, 900), a, .05); comp('Bbmaj7', a, t_end, [(0, 3.5)], .5)
        add(swell(1.4), t_end - 1.4, .06); add(pad([hz(n) for n in CH['Dmaj9']], b - t_end + 1, 1800, a=.5, r=2.2), t_end, .07)
        comp('Dmaj9', t_end, t_end + 1, [(0, 6)], .9, up=1); add(hit(3.0), a + .12 + 11.1, .18)
        for k, n in enumerate(['A5', 'C#6', 'E6', 'F#6']): add(celesta(hz(n), 2.5), a + .12 + 11.3 + k * .22, .05, pan=(-.3 + .2 * k))
    if i + 1 < len(MOODS) and mood != 'tension': add(swell(1.0), b - 1.0, .05)
if part == 1:      # the phone rings into silence, then one low suspense chord under the "to be continued" card
    a = float(starts[STORY - 1]); ring = a + .12 + 10.6; story_end = a + durs[STORY - 1]
    add(pad([hz(n) for n in ['D2', 'A2', 'Eb3', 'D4']], story_end - ring + .3, 600, a=.05, r=1.2), ring, .09); add(hit(3.0), ring, .25)

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
print('wrote %s (%.1f s)' % (sys.argv[2], DUR))
