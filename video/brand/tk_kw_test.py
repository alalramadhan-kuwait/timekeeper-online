"""Sealed Kuwaiti pronunciation test (voice-data/kw-pron-test.json, never edited): 2 models x 2 spellings.

  model  v4 = current LoRA (ckpt/v4/step02250.pt), v5 = same training on ق→گ text (best val checkpoint)
  input  plain = the sealed 'plain' line; kw = kw_convention(plain), the approved convention applied by code
Test A (controlled) compares v4 and v5 on the same input; Test B (production) is v4-plain vs v5-kw.
Same settings everywhere: ref.wav prompt, seed 0, exaggeration 0.4, cfg 0.5, end pause "…" (no lexicon respellings,
so only the spelling differs). Output: voice-src/kwtest/<model>-<input>/<id>.wav
Usage: tk_kw_test.py v5 kw --ckpt voice-src/ckpt/v5/stepNNNNN.pt
"""
import argparse
import json
import re
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, kw_convention, load_tts  # noqa: E402

SEALED = Path(__file__).resolve().parent / "voice-data/kw-pron-test.json"

p = argparse.ArgumentParser()
p.add_argument("model", choices=["v4", "v5"])
p.add_argument("input", choices=["plain", "kw"])
p.add_argument("--ckpt", required=True)
a = p.parse_args()
torch.set_num_threads(4)
out = SRC / "kwtest" / f"{a.model}-{a.input}"
out.mkdir(parents=True, exist_ok=True)


def end_pause(text):
    return text if re.search(r"[؟?]\s*$", text) else re.sub(r"[.…]*\s*$", "", text.rstrip()) + "…"


lines = {r["id"]: r["plain"] for r in json.loads(SEALED.read_text())["lines"]}
texts = {k: end_pause(kw_convention(t) if a.input == "kw" else t) for k, t in lines.items()}
tts = load_tts("cpu", a.ckpt)
tts.prepare_conditionals(str(SRC / "ref.wav"))
for k, text in texts.items():
    if (out / f"{k}.wav").exists():
        continue
    torch.manual_seed(0)
    w = tts.generate(text, language_id="ar", exaggeration=0.4, cfg_weight=0.5)
    torchaudio.save(str(out / f"{k}.wav"), w, tts.sr)
    print(a.model, a.input, k, f"{w.shape[-1] / tts.sr:.1f}s", flush=True)
(out / "texts.json").write_text(json.dumps({"ckpt": a.ckpt, "texts": texts}, ensure_ascii=False, indent=1))
