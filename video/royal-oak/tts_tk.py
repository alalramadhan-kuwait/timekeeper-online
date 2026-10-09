"""Royal Oak narration in the TK voice (Ali Alyousifi, VOICE-PLAN.md phase F).

Reads the lines from voice-ar/clips.json, applies the pronunciation lexicon and the end pause
(video/brand/tk_voice_train.apply_lexicon), and writes voice-tk/clips/<key>.wav + voice-tk/clips.json in the
same shape the film reads (NARRATOR=voice-tk python3 parts.py).

  python3 tts_tk.py                    all lines (skips ones already rendered)
  python3 tts_tk.py --sample p2-q      one line, re-rendered
  python3 tts_tk.py --ckpt <lora.pt>   use another checkpoint

Needs the TK voice venv (chatterbox, see video/brand/MAC-TRAINING.md) and the LoRA checkpoint, which stays out of git.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "brand"))
from tk_voice_train import SRC, apply_lexicon, load_tts  # noqa: E402

DEFAULT_CKPT = SRC / "ckpt/v4/step02250.pt"   # won the blind A/B/C (31/31), 2026-10-07
REF = SRC / "ref.wav"

p = argparse.ArgumentParser()
p.add_argument("--ckpt", default=str(DEFAULT_CKPT))
p.add_argument("--sample", help="render only this key (overwrites it)")
p.add_argument("--device", default="cpu")
a = p.parse_args()

import torch  # noqa: E402
import torchaudio  # noqa: E402

lines = json.loads((HERE / "voice-ar/clips.json").read_text())
out = HERE / "voice-tk"
(out / "clips").mkdir(parents=True, exist_ok=True)
manifest_path = out / "clips.json"
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

tts = load_tts(a.device, a.ckpt)
tts.prepare_conditionals(str(REF), exaggeration=0.4)
torch.set_num_threads(4)
for key, row in lines.items():
    if a.sample and key != a.sample:
        continue
    f = out / "clips" / f"{key}.wav"
    if f.exists() and not a.sample:
        continue
    torch.manual_seed(0)
    wav = tts.generate(apply_lexicon(row["text"]), language_id="ar", exaggeration=0.4, cfg_weight=0.5)
    torchaudio.save(str(f), wav, tts.sr)
    manifest[key] = {"file": f"clips/{key}.wav", "seconds": round(wav.shape[-1] / tts.sr, 2), "text": row["text"]}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(key, manifest[key]["seconds"], "s", flush=True)
