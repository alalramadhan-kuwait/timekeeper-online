"""LoRA strength test (2026-10-08). The exaggeration sweep Ali rated on 10-07 showed a trade: the base model
pronounced better (pron 3-4/5) but did not sound like him (voice 1-3); the LoRA sounded like him (voice 5) but
pronounced worse (pron 1-2). Scaling the LoRA at inference blends the two: strength 0 = base, 1 = full LoRA.
Same ref.wav, seed 0, exaggeration 0.4, cfg 0.5. Output: voice-src/blend/s<strength>-<line>.wav
Usage: tk_lora_blend.py <ckpt> 0 0.5 0.75 1
"""
import json
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, LoRA, load_tts  # noqa: E402

LINES = json.loads((Path(__file__).parent / "voice-data/progress-probe.json").read_text())["lines"]
PICK = ["pr1", "pr3"]
out = SRC / "blend"
out.mkdir(exist_ok=True)
torch.set_num_threads(4)
tts = load_tts("cpu", sys.argv[1])
tts.prepare_conditionals(str(SRC / "ref.wav"))
mods = [m for m in tts.t3.modules() if isinstance(m, LoRA)]
full = [m.scale for m in mods]
for s in map(float, sys.argv[2:]):
    for m, f in zip(mods, full):
        m.scale = f * s
    for k in PICK:
        torch.manual_seed(0)
        w = tts.generate(LINES[k].rstrip(".") + "…", language_id="ar", exaggeration=0.4, cfg_weight=0.5)
        torchaudio.save(str(out / f"s{s:g}-{k}.wav"), w, tts.sr)
        print(s, k, flush=True)
