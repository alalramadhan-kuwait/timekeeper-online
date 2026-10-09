"""Screening run, arm A1: Fahed (ar-KW-FahedNeural, Microsoft) -> Chatterbox VC -> the production chain, on the nine
sentences of voice-data/screen-9.json. No training. Every stage is kept so a problem can be traced to where it starts:
  tts/<id>.wav    Fahed as generated (rate +0%)
  vc/<id>.wav     Fahed through Chatterbox VC to Ali (target voice-src/ref.wav), nothing else
  final/<id>.wav  the production chain of tk_ali_voice.py: tighten pauses, VC, pitch range, clarity EQ, pace
Pace and pitch range of the final stage are set from the data, not reused from the reader (one factor each for the
whole set): Fahed's speech rate (letters per second of speech) is moved to Ali's 11.3, and the pitch range after VC to
Ali's 75 Hz (10-90%), both measured on 20 of his clips. The reader's x1.45 overshot on Fahed, who already moves his
pitch more than Ali: first run, final ranges 75-123 Hz against Ali's real 52-77, and lower likeness than raw VC.
Text: Fahed gets the sentence as written («…» read as «،», as in the reel). Output: voice-src/screen/fahed/ (not in git).
Run: /root/tkvoice/bin/python video/brand/tk_fahed_poc.py   (the TTS step runs in /root/habibi, which has edge-tts)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_ali_voice import BRIGHT, REF, SR, load, tighten, widen  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SPEC = json.loads((Path(__file__).parent / "voice-data/screen-9.json").read_text())
OUT = ROOT / "voice-src/screen/fahed"
ALI_RATE = 11.3          # letters per second of speech, Ali's median (2026-10-09)
ALI_RANGE = 75.0        # Hz, 10-90% pitch range, Ali's median
PAUSE = 0.15

TTS = r'''
import asyncio, json, ssl, subprocess, sys
from pathlib import Path
import edge_tts, edge_tts.communicate
ca = Path("/root/.ccr/ca-bundle.crt")
if ca.exists():
    edge_tts.communicate._SSL_CTX = ssl.create_default_context(cafile=str(ca))
items, out = json.loads(sys.argv[1]), Path(sys.argv[2])
async def main():
    for it in items:
        mp3 = out / (it["id"] + ".mp3")
        await edge_tts.Communicate(it["text"].replace("…", "،"), "ar-KW-FahedNeural", rate="+0%").save(str(mp3))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-ac", "1", "-ar", "24000", str(out / (it["id"] + ".wav"))], check=True)
        mp3.unlink()
asyncio.run(main())
'''


def letters(t):
    return len(re.sub(r"[^ء-ي]", "", t))


def speech_seconds(y):
    return sum(b - a for a, b in librosa.effects.split(y, top_db=30)) / SR


def f0_range(path):
    y, sr = librosa.load(str(path), sr=16000)
    f, v, _ = librosa.pyin(y, fmin=60, fmax=350, sr=sr, frame_length=1024)
    f = f[v]
    return float(np.percentile(f, 90) - np.percentile(f, 10))


def main():
    items = SPEC["items"]
    for d in ("tts", "vc", "work", "final"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    subprocess.run(["/root/habibi/bin/python", "-c", TTS, json.dumps([{"id": i["id"], "text": i["text"]} for i in items]),
                    str(OUT / "tts")], check=True)
    print("tts done", flush=True)

    rate = np.median([letters(i["text"]) / speech_seconds(load(OUT / "tts" / f"{i['id']}.wav")) for i in items])
    tempo = round(float(ALI_RATE / rate), 3)
    print(f"Fahed {rate:.1f} letters/s of speech -> tempo x{tempo}", flush=True)

    import torchaudio
    from chatterbox.vc import ChatterboxVC
    vc = ChatterboxVC.from_pretrained("cpu")
    vc.set_target_voice(str(REF))
    for it in items:
        k = it["id"]
        torchaudio.save(str(OUT / "vc" / f"{k}.wav"), vc.generate(str(OUT / "tts" / f"{k}.wav")), vc.sr)
        sf.write(OUT / "work" / f"{k}-1tight.wav", tighten(load(OUT / "tts" / f"{k}.wav"), PAUSE), SR)
        torchaudio.save(str(OUT / "work" / f"{k}-2vc.wav"), vc.generate(str(OUT / "work" / f"{k}-1tight.wav")), vc.sr)
    rng = round(min(1.6, max(0.6, ALI_RANGE / np.median([f0_range(OUT / "work" / f"{i['id']}-2vc.wav") for i in items]))), 3)
    print(f"pitch range factor x{rng}", flush=True)
    for it in items:
        k = it["id"]
        widen(OUT / "work" / f"{k}-2vc.wav", OUT / "work" / f"{k}-3wide.wav", rng)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(OUT / "work" / f"{k}-3wide.wav"), "-af",
                        f"{BRIGHT},rubberband=tempo={tempo}:pitchq=quality,loudnorm=I=-18:TP=-2:LRA=11",
                        "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(OUT / "final" / f"{k}.wav")], check=True)
        print(k, flush=True)
    (OUT / "run.json").write_text(json.dumps({"fahed_rate": float(rate), "tempo": tempo, "range": rng, "pause": PAUSE}, indent=1))


if __name__ == "__main__":
    main()
