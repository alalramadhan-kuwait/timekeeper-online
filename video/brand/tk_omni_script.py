"""A short Time Keeper script (voice-data/omni-script-1.json) in Ali's voice with OmniVoice (Gulf Arabic, ref8.wav),
line by line, joined with 0.35 s pauses, at two speeds: 1.0 (the model's own pace) and 1.25 (closer to Ali, who speaks
about 1.4x faster than the model). Research only (CC-BY-NC weights). Output: voice-src/compare/script1/speed-<x>.wav.
Run: HF_HUB_OFFLINE=1 /root/omni/bin/python video/brand/tk_omni_script.py"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "voice-src/compare/script1"
LINES = json.loads((ROOT / "video/brand/voice-data/omni-script-1.json").read_text())["lines"]

if __name__ == "__main__":
    from omnivoice import OmniVoice
    torch.set_num_threads(4)
    OUT.mkdir(parents=True, exist_ok=True)
    m = OmniVoice.from_pretrained("/root/omnivoice-w", device_map="cpu", dtype=torch.float32)
    ref, ref_text = str(ROOT / "voice-src/ref8.wav"), (ROOT / "voice-src/ref8.txt").read_text().strip()
    gap = np.zeros(int(0.35 * 24000), dtype=np.float32)
    for speed in (1.0, 1.25):
        parts = []
        for i, line in enumerate(LINES):
            torch.manual_seed(i)
            a = m.generate(text=line, language="afb", ref_audio=ref, ref_text=ref_text, speed=speed)[0]
            parts += [a.astype(np.float32), gap]
        sf.write(OUT / f"speed-{speed}.wav", np.concatenate(parts[:-1]), 24000)
        print("speed", speed, round(sum(len(p) for p in parts[:-1]) / 24000, 1), "s", flush=True)
