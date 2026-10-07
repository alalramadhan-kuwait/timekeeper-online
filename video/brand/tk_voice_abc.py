"""TK Voice quick A/B/C before any data expansion.

  A  zero-shot clone from a 30 s reference (Tudor episode, 1:41.8–2:11.8)
  B  zero-shot, stronger conditioning: speaker embedding averaged over ~8 min of clean Kuwaiti clips
     (voice-src/abc-condset.json), prompt = the clearest Kuwaiti 10 s clip. Chatterbox only reads the first
     6 s (T3 prompt) / 10 s (S3Gen) of a reference, so minutes of audio can only enter through the embedding.
  C  the two hours + T3 LoRA (pass --ckpt)

Same 10 hard lines, same seed. Output: voice-src/abc/<A|B|C>/<id>.wav
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, SR16, ffmpeg_pcm, load_tts  # noqa: E402
from tk_voice_a import CLIPS, LINES  # noqa: E402

BENCH = {r["id"]: r["text"] for r in json.loads((Path(__file__).resolve().parent / "voice-data/benchmark.json").read_text())["lines"]}
ROYAL = json.loads(CLIPS.read_text())
TEN = {
    "p1-0": ROYAL["p1-0"]["text"],                 # Gérald Genta
    "p2-q": ROYAL["p2-q"]["text"],                 # quartz crisis
    "p2-2": ROYAL["p2-2"]["text"],                 # باچر
    "p2-7": LINES["p2-7"],                         # Royal Oak + numbers
    "fn01": BENCH["fn01"],                         # Audemars Piguet / Royal Oak / Genta
    "kw01": BENCH["kw01"], "kw08": BENCH["kw08"], "kw10": BENCH["kw10"],
    "wv02": BENCH["wv02"],                         # code-switching
    "nm04": BENCH["nm04"],                         # years
}

p = argparse.ArgumentParser()
p.add_argument("variant", choices=["A", "B", "C"])
p.add_argument("--ckpt")
a = p.parse_args()
torch.set_num_threads(4)
out = SRC / "abc" / a.variant
out.mkdir(parents=True, exist_ok=True)

if a.variant == "A":
    ref = SRC / "abc/ref30.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "101.8", "-t", "30", "-i", str(SRC / "ZhOZyrX90nI.mp3"),
                    "-ac", "1", "-ar", "24000", "-af", "loudnorm=I=-20:TP=-2:LRA=11", str(ref)], check=True)
    tts = load_tts("cpu")
    tts.prepare_conditionals(str(ref))
elif a.variant == "B":
    ids = json.loads((SRC / "abc-condset.json").read_text())
    wav = lambda c: SRC / "dataset-v2/wavs" / f"{c}.wav"
    tts = load_tts("cpu")
    tts.prepare_conditionals(str(wav("2GWn1WniyDI-008")))
    emb = torch.from_numpy(tts.ve.embeds_from_wavs([ffmpeg_pcm(wav(c), SR16) for c in ids], sample_rate=SR16)).mean(0, keepdim=True)
    tts.conds.t3.speaker_emb = emb.to(tts.conds.t3.speaker_emb)
else:
    tts = load_tts("cpu", a.ckpt)
    tts.prepare_conditionals(str(SRC / "ref.wav"))

for k, text in TEN.items():
    torch.manual_seed(0)
    w = tts.generate(text, language_id="ar", exaggeration=0.4, cfg_weight=0.5)
    torchaudio.save(str(out / f"{k}.wav"), w, tts.sr)
    print(a.variant, k, f"{w.shape[-1] / tts.sr:.1f}s", flush=True)
(out / "lines.json").write_text(json.dumps(TEN, ensure_ascii=False, indent=1))
