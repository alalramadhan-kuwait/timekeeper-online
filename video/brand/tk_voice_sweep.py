"""Inference-control sweep on one storytelling paragraph, base vs LoRA.

Stage 1 (default): exaggeration only (0.25 0.4 0.5 0.7 0.9); temperature 0.8, cfg 0.5, min_p 0.05,
top_p 1.0, repetition_penalty 1.2, seed 0 held fixed.
  python3 tk_voice_sweep.py                      -> voice-src/sweep/exag/<model>-e<x>.wav
  python3 tk_voice_sweep.py --param cfg_weight --values 0.2 0.35 0.5 0.7 --exaggeration 0.5
                                                 -> voice-src/sweep/cfg_weight/...
Each render also gets prosody features (tk_prosody.features) in results.json. No Whisper scoring here:
the choice is made by blind listening.
"""
import argparse
import json
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, load_tts  # noqa: E402
from tk_prosody import features  # noqa: E402

PARAGRAPH = ("كانت الساعة تقارب أربعة العصر لما رن التلفون. كان غولاي. "
             "أعرف جورج من سنين، بس هالمرة طلبه كان مختلف: يبي ساعة ستيل… ما انسوت مثلها قبل.")
CKPT = SRC / "ckpt/v4/step02250.pt"
DEFAULTS = {"exaggeration": 0.4, "cfg_weight": 0.5, "temperature": 0.8, "min_p": 0.05, "top_p": 1.0,
            "repetition_penalty": 1.2}

p = argparse.ArgumentParser()
p.add_argument("--param", default="exaggeration", choices=list(DEFAULTS))
p.add_argument("--values", nargs="+", type=float, default=[0.25, 0.4, 0.5, 0.7, 0.9])
p.add_argument("--seeds", nargs="+", type=int, default=[0])
for k, v in DEFAULTS.items():
    p.add_argument(f"--{k}", type=float, default=v)
a = p.parse_args()
torch.set_num_threads(4)
out = SRC / "sweep" / ("exag" if a.param == "exaggeration" else a.param)
out.mkdir(parents=True, exist_ok=True)

results = json.loads((out / "results.json").read_text()) if (out / "results.json").exists() else {}
for model, ck in (("base", None), ("lora", str(CKPT))):
    tts = None
    for v in a.values:
        for seed in a.seeds:
            name = f"{model}-{a.param[:4]}{v:g}" + (f"-s{seed}" if len(a.seeds) > 1 else "")
            f = out / f"{name}.wav"
            if not f.exists():
                if tts is None:
                    tts = load_tts("cpu", ck)
                    tts.prepare_conditionals(str(SRC / "ref.wav"), exaggeration=0.5)
                kw = {k: getattr(a, k) for k in DEFAULTS}
                kw[a.param] = v
                torch.manual_seed(seed)
                torchaudio.save(str(f), tts.generate(PARAGRAPH, language_id="ar", **kw), tts.sr)
                print(name, flush=True)
            results[name] = {"model": model, a.param: v, "seed": seed, **features(f, PARAGRAPH)}
    del tts
(out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
for k, r in results.items():
    print(f'{k:22s} range {r["range_st"]:5.1f} st  sd {r["f0_sd_st"]:4.1f}  dur {r["dur"]:5.1f}s  pauses {r["pauses"]}  '
          f'rate {r.get("rate_chars_s", 0):4.1f}  final {r["final_slope_st_s"]:6.1f}  energy_sd {r["energy_sd_db"]:4.1f}')
