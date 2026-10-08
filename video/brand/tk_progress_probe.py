"""Render the 3 progress-probe lines with one checkpoint, so Ali can hear V5 at 25/50/75% (listening only;
checkpoint choice stays on val loss). v4 gets the plain text, v5 kw_convention(text). Pauses training while it runs.
Usage: tk_progress_probe.py <ckpt> <tag> <plain|kw>   -> voice-src/progress/<tag>.mp3 (3 lines, 0.8 s apart)
"""
import json
import os
import signal
import subprocess
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, kw_convention, load_tts  # noqa: E402

ckpt, tag, mode = sys.argv[1:4]
lines = json.loads((Path(__file__).resolve().parent / "voice-data/progress-probe.json").read_text())["lines"]
out = SRC / "progress"
out.mkdir(exist_ok=True)
pids = [int(p) for p in subprocess.run(["pgrep", "-f", "[t]k_voice_train.py train"], capture_output=True, text=True).stdout.split()]
for p in pids:
    os.kill(p, signal.SIGSTOP)
try:
    torch.set_num_threads(4)
    tts = load_tts("cpu", ckpt)
    tts.prepare_conditionals(str(SRC / "ref.wav"))
    parts, given = [], {}
    for k, t in lines.items():
        t = given[k] = (kw_convention(t) if mode == "kw" else t).rstrip(".") + "…"
        torch.manual_seed(0)
        w = tts.generate(t, language_id="ar", exaggeration=0.4, cfg_weight=0.5)
        parts += [w, torch.zeros(1, int(0.8 * tts.sr))]
    torchaudio.save(str(out / f"{tag}.wav"), torch.cat(parts, -1), tts.sr)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out / f"{tag}.wav"), "-b:a", "96k", str(out / f"{tag}.mp3")], check=True)
    (out / f"{tag}.json").write_text(json.dumps({"ckpt": ckpt, "texts": given}, ensure_ascii=False, indent=1))
    print(tag, "->", out / f"{tag}.mp3")
finally:
    for p in pids:
        os.kill(p, signal.SIGCONT)
