"""Reference comparison, Chatterbox side: the current model (v4 LoRA, ref.wav prompt, seed 0, exaggeration 0.4,
cfg 0.5, plain text) reads the same 30 held-out 'final' sentences that tk_audar_ref.py gives Audar, and Ali's real
recording of each is copied next to them. Listening only; nothing here trains or picks a checkpoint.
Usage: tk_refcmp.py <lines.json>   -> voice-src/refcmp/{ali,v4}/<clip>.wav
"""
import json
import shutil
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, load_tts  # noqa: E402

lines = json.loads(Path(sys.argv[1]).read_text())
(SRC / "refcmp/ali").mkdir(parents=True, exist_ok=True)
(SRC / "refcmp/v4").mkdir(parents=True, exist_ok=True)
(SRC / "refcmp/lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1))
for ln in lines:
    wav = next(p for p in (SRC / "dataset-v2/wavs" / f"{ln['id']}.wav", SRC / "dataset/wavs" / f"{ln['id']}.wav") if p.exists())
    shutil.copy(wav, SRC / "refcmp/ali" / f"{ln['id']}.wav")
torch.set_num_threads(4)
tts = load_tts("cpu", str(SRC / "ckpt/v4/step02250.pt"))
tts.prepare_conditionals(str(SRC / "ref.wav"))
for ln in lines:
    f = SRC / "refcmp/v4" / f"{ln['id']}.wav"
    if f.exists():
        continue
    torch.manual_seed(0)
    w = tts.generate(ln["text"], language_id="ar", exaggeration=0.4, cfg_weight=0.5)
    torchaudio.save(str(f), w, tts.sr)
    print(ln["id"], f"{w.shape[-1] / tts.sr:.1f}s", flush=True)
