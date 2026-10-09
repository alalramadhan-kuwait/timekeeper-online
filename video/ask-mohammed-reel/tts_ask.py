"""Narration for the «اسأل محمد» reel in TK Voice V5, the approved production settings:
ref.wav prompt, exaggeration 0.4, cfg 0.5, seed per take; text through Ali's dictionary (kw_convention) then the
lexicon + end pause (apply_lexicon). Writes voice/<key>.wav and voice/texts.json (what the model actually read).
Usage: python tts_ask.py [keys...] [--takes N]   (run with /root/tkvoice/bin/python)
"""
import json
import sys
from pathlib import Path

import torch
import torchaudio

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "video/brand"))
from tk_voice_train import SRC, apply_lexicon, kw_convention, load_tts  # noqa: E402

CKPT = SRC / "ckpt/v5/step01800.pt"   # V5: best val step (training stopped at 2064)
args = [a for a in sys.argv[1:] if not a.startswith("--")]
takes = int(sys.argv[sys.argv.index("--takes") + 1]) if "--takes" in sys.argv else 1
lines = {k: v for k, v in json.loads((HERE / "narration.json").read_text()).items() if not k.startswith("_")}
keys = [k for k in lines if not args or k in args]
out = HERE / "voice"
out.mkdir(exist_ok=True)
texts = json.loads((out / "texts.json").read_text()) if (out / "texts.json").exists() else {}
torch.set_num_threads(4)
tts = load_tts("cpu", str(CKPT))
tts.prepare_conditionals(str(SRC / "ref.wav"), exaggeration=0.4)
for k in keys:
    t = apply_lexicon(kw_convention(lines[k]))
    for n in range(takes):
        name = k if takes == 1 else f"{k}-t{n}"
        torch.manual_seed(n)
        w = tts.generate(t, language_id="ar", exaggeration=0.4, cfg_weight=0.5)
        torchaudio.save(str(out / f"{name}.wav"), w, tts.sr)
        texts[name] = t
        print(name, f"{w.shape[-1] / tts.sr:.1f}s", t, flush=True)
(out / "texts.json").write_text(json.dumps(texts, ensure_ascii=False, indent=1))
