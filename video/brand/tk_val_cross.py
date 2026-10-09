"""Validation report kept apart from listening (2026-10-08): speech-token loss of each checkpoint on each dataset's
text, same clips, same deterministic prompts as training's evaluate(). V5's own val number is on its corrected text,
so it is not comparable with v4's; the cross table (both models x both texts) is. Also reports the held-out 'final'
split, now that both models are already chosen (reporting only, never selection).
Usage: tk_val_cross.py <v4 ckpt> <v5 ckpt>
"""
import json
import random
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, add_lora, batchify, load_tts, t3_loss, with_other_prompt  # noqa: E402

torch.set_num_threads(4)
res = {}
for name, ckpt in (("v4", sys.argv[1]), ("v5", sys.argv[2])):
    tts = load_tts("cpu", ckpt)
    t3 = tts.t3.eval()
    for data in ("dataset-v4", "dataset-v5"):
        feats = torch.load(SRC / data / "feats.pt")
        split = dict(l.split("|")[0::2] for l in (SRC / data / "metadata.csv").read_text().split("\n") if l)
        by_video = {}
        for k in feats:
            by_video.setdefault(k.rsplit("-", 1)[0], []).append(k)
        for part in ("val", "final"):
            keys = [k for k, s in split.items() if s == part]
            with torch.no_grad():
                ls = [t3_loss(t3, *batchify([with_other_prompt(feats, k, by_video, random.Random(k))], t3.hp, "cpu"))[1].item()
                      for k in keys]
            res[f"{name} on {data} {part}"] = round(float(np.mean(ls)), 4)
            print(name, data, part, res[f"{name} on {data} {part}"], flush=True)
    del tts
(SRC / "v5-val-cross.json").write_text(json.dumps(res, indent=1))
