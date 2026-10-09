"""The Kuwaiti read of the «اسأل محمد» narration (voice-ali/proc, the speaker's own recordings, cleaned by
prep_ali.py) converted to Ali Alyousifi's voice with Chatterbox VC (S3Gen, MIT): the words, pronunciation and
timing stay the speaker's, the timbre becomes Ali's. Target: voice-src/ref.wav (the clip Ali picked).
Consent: video/brand/VOICE-CONSENT.md. Writes voice-vc/proc/sNN.wav.  Run: /root/tkvoice/bin/python vc_ali.py
"""
import subprocess
from pathlib import Path

import torchaudio
from chatterbox.vc import ChatterboxVC

HERE = Path(__file__).resolve().parent
REF = HERE.parents[1] / "voice-src/ref.wav"
SRC, RAW, OUT = HERE / "voice-ali/proc", HERE / "voice-vc/raw", HERE / "voice-vc/proc"
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
vc = ChatterboxVC.from_pretrained("cpu")
vc.set_target_voice(str(REF))
for f in sorted(SRC.glob("s*.wav")):
    wav = vc.generate(str(f))
    torchaudio.save(str(RAW / f.name), wav, vc.sr)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW / f.name), "-af", "loudnorm=I=-18:TP=-2:LRA=11",
                    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(OUT / f.name)], check=True)
    print(f.stem, flush=True)
