"""Prosody experiments 3 and 4: does the model change melody with intent, punctuation and context?

Exp 3  16 lines, 8 intents (voice-data/prosody-bench.json), base vs LoRA.
Exp 4  same words with . ? , … !  and a target sentence alone vs inside its paragraph (cut back out with
       Whisper word timings). Text is used raw (no lexicon, no added end pause) so punctuation is the only change.
Writes voice-src/prosody/exp34/<model>/<id>.wav and results.json.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, load_tts  # noqa: E402
from tk_prosody import features  # noqa: E402

B = json.loads((Path(__file__).resolve().parent / "voice-data/prosody-bench.json").read_text())
CKPT = SRC / "ckpt/v4/step02250.pt"
OUT = SRC / "prosody/exp34"
torch.set_num_threads(4)

jobs = {r["id"]: r["text"] for r in B["intents"]}
jobs.update({f'{B["punctuation"]["id"]}-{k}': t for k, t in B["punctuation"]["variants"].items()})
for c in B["context"]:
    jobs[f'{c["id"]}-alone'] = c["target"]
    jobs[f'{c["id"]}-para'] = c["paragraph"]

for model, ck in (("base", None), ("lora", str(CKPT))):
    d = OUT / model
    d.mkdir(parents=True, exist_ok=True)
    if all((d / f"{k}.wav").exists() for k in jobs):
        continue
    tts = load_tts("cpu", ck)
    tts.prepare_conditionals(str(SRC / "ref.wav"), exaggeration=0.4)
    for k, text in jobs.items():
        if (d / f"{k}.wav").exists():
            continue
        torch.manual_seed(0)
        torchaudio.save(str(d / f"{k}.wav"), tts.generate(text, language_id="ar", exaggeration=0.4, cfg_weight=0.5), tts.sr)
        print(model, k, flush=True)
    del tts

# cut each paragraph render back to its target sentence
from faster_whisper import WhisperModel  # noqa: E402
wm = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
for model in ("base", "lora"):
    d = OUT / model
    for c in B["context"]:
        src = d / f'{c["id"]}-para.wav'
        pcm = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                                           capture_output=True, check=True).stdout, np.float32)
        segs, _ = wm.transcribe(pcm, language="ar", word_timestamps=True)
        words = [w for s in segs for w in s.words]
        tw = c["target"].split()
        first, last = tw[0], tw[-1].strip(".؟?…!،")
        starts = [w.start for w in words if first in w.word]
        ends = [w.end for w in words if last in w.word.strip(".؟?…!، ")]
        if starts and ends and max(ends) > min(starts):
            s0 = min(starts); e0 = min(e for e in ends if e > s0)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(max(0, s0 - 0.05)), "-to", str(e0 + 0.15), "-i", str(src),
                            str(d / f'{c["id"]}-incontext.wav')], check=True)
            print(model, c["id"], "cut", round(s0, 2), round(e0, 2), flush=True)
        else:
            print(model, c["id"], "could not locate target in paragraph", flush=True)

res = {}
for model in ("base", "lora"):
    d = OUT / model
    res[model] = {}
    for f in sorted(d.glob("*.wav")):
        k = f.stem
        if k.endswith("-para"):
            continue
        text = jobs.get(k) or next((c["target"] for c in B["context"] if k.startswith(c["id"])), None)
        res[model][k] = features(f, text)
(OUT / "results.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
print("->", OUT / "results.json")
