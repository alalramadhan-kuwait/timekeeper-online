#!/usr/bin/env python3
"""Procedural sound kit for paper-story drafts: writes mono 44.1 kHz WAVs to assets/sfx/.
Deterministic (seeded). These are reference-quality placeholders for reviewing timing and mix; replace any
of them by dropping a WAV with the same name into assets/sfx/ (or a project-level sfx/ folder).
   python3 make-sfx.py            """
import numpy as np, wave, os, sys
SR = 44100
rng = np.random.default_rng(7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx')
os.makedirs(OUT, exist_ok=True)

def t(d): return np.arange(int(SR * d)) / SR
def env(d, a=0.002, k=8.0):
    x = t(d); e = np.exp(-k * x / d); n = int(a * SR); e[:n] *= np.linspace(0, 1, n) if n else 1; return e
def noise(d): return rng.standard_normal(int(SR * d))
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.clip((f - lo) / max(lo * .3, 1), 0, 1) * np.clip((hi - f) / max(hi * .3, 1), 0, 1)
    return np.fft.irfft(X * m, len(x))
def lowpass(x, hi): return bandpass(x, 1, hi)
def damped(freq, d, k=30.0, ph=0.0): x = t(d); return np.sin(2 * np.pi * freq * x + ph) * np.exp(-k * x)
def norm(x, peak=0.8): m = np.max(np.abs(x)) or 1; return x / m * peak
def mix(*parts, n=None):
    n = n or max(len(p) for p in parts); out = np.zeros(n)
    for p in parts: out[:len(p)] += p[:n]
    return out
def at(x, start, total): out = np.zeros(int(SR * total)); i = int(SR * start); out[i:i + len(x)] += x[:len(out) - i]; return out
def fade(x, ms=8): n = int(SR * ms / 1000); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def save(name, x, peak=0.8):
    x = np.clip(norm(x, peak), -1, 1); w = wave.open(os.path.join(OUT, name + '.wav'), 'wb')
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes()); w.close()

# --- the watch: a tick and a tock, then a one-second pair
def tick(p=1.0):
    return mix(damped(3100 * p, .06, 70), 0.6 * damped(5200 * p, .05, 90), 0.5 * damped(1150 * p, .08, 55), 0.5 * bandpass(noise(.06), 2500, 9000) * env(.06, .0005, 40))
save('tick', tick(1.0)); save('tock', tick(.86))
pair = at(tick(1.0), 0, 1.0) + at(tick(.86), .5, 1.0); save('tick_pair', pair)
# 8 beats per second ticking bed (10 s) for ambience under quiet scenes
bed = np.zeros(int(SR * 10))
for i in range(80): bed += at(tick(1.0 if i % 2 == 0 else .88) * 0.5, i / 8, 10)
save('watch_run', bed, .35)

# --- paper
save('paper_slide', bandpass(noise(.55), 700, 6500) * (np.sin(np.linspace(0, np.pi, int(SR * .55))) ** 1.6) * (0.7 + 0.3 * np.sin(np.linspace(0, 40, int(SR * .55)))), .5)
x = noise(.8); imp = (rng.random(len(x)) < np.linspace(.002, .02, len(x))) * rng.standard_normal(len(x))
save('paper_tear', bandpass(x, 800, 8000) * env(.8, .01, 2.5) * .5 + bandpass(imp, 1500, 9000) * 2.2 * env(.8, .001, 2), .6)
x = noise(.45); save('tape', bandpass(x, 900, 5500) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 95 * t(.45)))) * env(.45, .01, 2.2), .55)
save('paper_place', mix(lowpass(noise(.18), 3500) * env(.18, .001, 26) * .6, damped(120, .15, 35) * .7), .6)
save('fold', bandpass(noise(.35), 500, 4200) * (np.sin(np.linspace(0, np.pi, int(SR * .35))) ** 2) * .5, .45)
save('pin', mix(damped(2600, .05, 90), damped(900, .08, 50) * .6, bandpass(noise(.03), 2000, 8000) * env(.03, .0003, 50) * .4), .5)

# --- impacts and mechanics
x = t(.35); thump = np.sin(2 * np.pi * (45 + 60 * np.exp(-18 * x)) * x) * np.exp(-14 * x)
save('stamp', mix(thump, lowpass(noise(.35), 1200) * env(.35, .0005, 40) * .7, bandpass(noise(.35), 2500, 7000) * env(.35, .0003, 80) * .3), .85)
sh = mix(bandpass(noise(.04), 1800, 7000) * env(.04, .0003, 35), np.zeros(int(SR * .04)))
save('shutter', mix(at(sh, 0, .22) * 1.0, at(sh * .8, .075, .22), at(damped(180, .1, 45) * .5, 0, .22)), .7)
winds = np.zeros(int(SR * 1.1))
for i in range(16): winds += at(mix(damped(2300 + i * 40, .035, 110), .4 * bandpass(noise(.02), 3000, 8000) * env(.02, .0002, 60)), i * 0.062, 1.1)
save('crown_wind', winds, .55)
save('clasp', mix(damped(4200, .09, 55), .6 * damped(6700, .07, 80), .5 * damped(320, .12, 40), bandpass(noise(.02), 3500, 9000) * env(.02, .0002, 90) * .5), .6)
x = t(1.8); sw = np.sin(np.pi * x / 1.8) ** 1.5
w = bandpass(noise(1.8), 300, 1800) * sw * .6 + bandpass(noise(1.8), 1200, 4200) * sw * sw * .25
save('plane', w, .5)
save('whoosh', bandpass(noise(.4), 400, 3800) * (np.sin(np.linspace(0, np.pi, int(SR * .4))) ** 2) * .6, .5)

# --- digital and rooms
def bell(f, d=1.2, k=5.0): return sum(a * damped(f * r, d, k * r ** .6) for a, r in [(1, 1), (.5, 2.01), (.3, 3.02), (.15, 4.7)])
save('notif', mix(bell(1047, .5, 9), at(bell(1568, .6, 8), .11, .5) * .9), .5)
save('mic_tap', mix(damped(140, .12, 38) * .9, bandpass(noise(.05), 300, 2500) * env(.05, .0005, 40) * .5), .6)
save('door_chime', mix(bell(880, 1.6, 3.2), at(bell(1175, 1.4, 3.6), .35, 1.6) * .8, bandpass(noise(.6), 300, 2000) * np.sin(np.linspace(0, np.pi, int(SR * .6))) ** 2 * .06), .5)
save('click', mix(damped(2900, .03, 140), bandpass(noise(.01), 2500, 9000) * env(.01, .0001, 60) * .5), .5)
# crowd murmur (loopable-ish): band-limited noise with syllable-like modulation
n = 8.0; x = bandpass(noise(n), 200, 3200); m = np.zeros(len(x))
for f, a in [(3.1, .5), (4.7, .35), (6.2, .3), (2.3, .4)]: m += a * np.sin(2 * np.pi * f * t(n) + rng.random() * 6)
save('crowd', x * (0.55 + 0.45 * np.clip(m, -1, 1)), .35)
save('room', lowpass(noise(8), 900) * .3 + bandpass(noise(8), 60, 180) * .6, .2)
print('wrote', len(os.listdir(OUT)), 'files to', os.path.normpath(OUT))
