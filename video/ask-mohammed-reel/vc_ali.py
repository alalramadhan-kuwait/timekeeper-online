"""Superseded by video/brand/tk_ali_voice.py (all steps, recordings in parts). Kept as the record of how the reel was made.

The Kuwaiti read of the «اسأل محمد» narration (voice-ali/proc, the speaker's own recordings, cleaned by
prep_ali.py) made into Ali Alyousifi's voice: the words and pronunciation stay the speaker's, the delivery is moved
toward Ali's and the timbre becomes Ali's (Chatterbox VC, S3Gen, MIT). Consent: video/brand/VOICE-CONSENT.md.

Measured 2026-10-09 against 20 of Ali's own clips: same pitch level (126 vs 127 Hz), but Ali's pitch moves more
(10-90% range 75 Hz vs 52 Hz) and he talks about 13% faster, with shorter pauses. So, per line:
  1. pauses inside the line capped at PAUSE seconds
  2. Chatterbox VC to Ali's timbre (target voice-src/ref.wav, the clip Ali picked)
  3. the pitch contour widened around its median by RANGE (Praat PSOLA). This has to come after VC: S3Gen makes its
     own pitch and flattens a widened source back (source widened to 70 Hz came out at 51 Hz)
  4. pace x TEMPO (rubberband, pitch kept), loudness -18 LUFS
Writes voice-vc/proc/sNN.wav and voice-vc/all.m4a (every line in order, to listen before the video).
Run: /root/tkvoice/bin/python vc_ali.py [--tempo 1.13] [--range 1.45] [--pause 0.15]
"""
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import parselmouth
import soundfile as sf
import torchaudio
from chatterbox.vc import ChatterboxVC
from parselmouth.praat import call


def arg(name, default):
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


TEMPO, RANGE, PAUSE = arg("--tempo", 1.13), arg("--range", 1.45), arg("--pause", 0.15)
HERE = Path(__file__).resolve().parent
REF = HERE.parents[1] / "voice-src/ref.wav"
SRC, WORK, OUT = HERE / "voice-ali/proc", HERE / "voice-vc/work", HERE / "voice-vc/proc"
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)


def tighten(y, sr):
    """Keep the speech, cap every pause between stretches of speech at PAUSE s (10 ms fades at each cut)."""
    iv = librosa.effects.split(y, top_db=35, frame_length=1024, hop_length=160)
    fade = int(0.01 * sr)
    parts = []
    for i, (a, b) in enumerate(iv):
        if i:
            gap = a - iv[i - 1][1]
            parts.append(np.zeros(min(gap, int(PAUSE * sr)), y.dtype))
        seg = y[max(0, a - fade):b + fade].copy()
        ramp = np.linspace(0, 1, fade, dtype=y.dtype)
        seg[:fade] *= ramp
        seg[-fade:] *= ramp[::-1]
        parts.append(seg)
    return np.concatenate(parts)


def widen(path_in, path_out):
    snd = parselmouth.Sound(str(path_in))
    man = call(snd, "To Manipulation", 0.01, 60, 350)
    tier = call(man, "Extract pitch tier")
    med = call(snd.to_pitch(), "Get quantile", 0, 0, 0.5, "Hertz")
    call(tier, "Multiply frequencies", snd.xmin, snd.xmax, 1.0)   # no-op; keeps the tier editable
    for i in range(1, call(tier, "Get number of points") + 1):
        t, f = call(tier, "Get time from index", i), call(tier, "Get value at index", i)
        call(tier, "Remove point", i)
        call(tier, "Add point", t, med * (f / med) ** RANGE)
    call([tier, man], "Replace pitch tier")
    call(man, "Get resynthesis (overlap-add)").save(str(path_out), "WAV")


vc = ChatterboxVC.from_pretrained("cpu")
vc.set_target_voice(str(REF))
lines = sorted(SRC.glob("s*.wav"))
for f in lines:
    y, sr = librosa.load(str(f), sr=24000)
    sf.write(WORK / f"{f.stem}-1tight.wav", tighten(y, sr), sr)
    torchaudio.save(str(WORK / f"{f.stem}-2vc.wav"), vc.generate(str(WORK / f"{f.stem}-1tight.wav")), vc.sr)
    widen(WORK / f"{f.stem}-2vc.wav", WORK / f"{f.stem}-3wide.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(WORK / f"{f.stem}-3wide.wav"), "-af",
                    f"rubberband=tempo={TEMPO}:pitchq=quality,loudnorm=I=-18:TP=-2:LRA=11",
                    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(OUT / f.name)], check=True)
    print(f.stem, f"{librosa.get_duration(path=str(f)):.2f}s -> {librosa.get_duration(path=str(OUT / f.name)):.2f}s", flush=True)
# every line in order with a short gap, to listen before the video is made
gap = ["-f", "lavfi", "-t", "0.35", "-i", "anullsrc=r=48000:cl=mono"]
ins = sum([["-i", str(OUT / f.name)] + gap for f in lines], [])
n = 2 * len(lines)
subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", "".join(f"[{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1",
                "-b:a", "128k", str(HERE / "voice-vc/all.m4a")], check=True)
