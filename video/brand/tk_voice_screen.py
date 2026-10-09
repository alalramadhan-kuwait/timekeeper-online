"""TK Voice, phase B screening (VOICE-PLAN.md 4.4 + 4.6).

For every voice-src/raw/<id>.segments.json: draft 4–12 s clips (same cutter as tk_voice_train.build),
then score each clip:
  sim    speaker similarity to voice-src/ref.wav (Resemblyzer, cosine)
  cps    characters per second (keep 4–25, as the plan says)
  lp     Whisper average log-probability of the words in the clip
Writes voice-src/screen.json and prints a per-video summary.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, ffmpeg_pcm, draft_clips  # noqa: E402

from resemblyzer import VoiceEncoder, preprocess_wav  # noqa: E402

enc = VoiceEncoder("cpu")
ref = enc.embed_utterance(preprocess_wav(ffmpeg_pcm(SRC / "ref.wav", 16000), source_sr=16000))
# Videos whose non-voice stem is within 25 dB of the voice: train on the Demucs vocals instead.
gaps = {l.split()[0]: float(l.split()[-1]) for l in (SRC / "music.txt").read_text().splitlines() if "gap" in l}
out = []
for seg_path in sorted((SRC / "raw").glob("*.segments.json")):
    vid = seg_path.name.split(".")[0]
    segs = json.loads(seg_path.read_text())
    if gaps.get(vid, 99) < 0:
        print(f"{vid:12s} no voice, skipped"); continue
    src = SRC / "sep/htdemucs" / vid / "vocals.wav" if gaps.get(vid, 99) < 25 else SRC / "raw" / f"{vid}.mp3"
    audio = ffmpeg_pcm(src, 16000)
    lp_of = [(s["start"], s["end"], s["logprob"]) for s in segs]
    rows = []
    for n, c in enumerate(draft_clips(segs)):
        a = audio[int(c["start"] * 16000): int(c["end"] * 16000)]
        dur = c["end"] - c["start"]
        try:
            sim = float(enc.embed_utterance(preprocess_wav(a, source_sr=16000)) @ ref)
        except Exception:
            sim = 0.0
        lps = [lp for s, e, lp in lp_of if s < c["end"] and e > c["start"]]
        rows.append({"id": f"{vid}-{n:03d}", "video": vid, "src": str(src.relative_to(SRC)), **c, "dur": round(dur, 2), "sim": round(sim, 3),
                     "cps": round(len(c["text"].replace(" ", "")) / dur, 1), "lp": round(float(np.mean(lps)) if lps else -9, 3)})
    out += rows
    s = np.array([r["sim"] for r in rows])
    print(f"{vid:12s} clips {len(rows):3d}  sim median {np.median(s):.2f}  <0.75: {int((s < 0.75).sum()):3d}", flush=True)
(SRC / "screen.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out), "clips ->", SRC / "screen.json")
