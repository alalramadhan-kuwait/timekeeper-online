"""Ablation: real speech -> S3 tokens -> S3Gen (voice from ref.wav), skipping T3.
If the resynthesis keeps the Kuwaiti pronunciation, S3Gen can reproduce it and the codes (T3's job) carry the accent.
Writes voice-src/samples/resynth/<id>-orig.wav and <id>-resynth.wav, plus one A/B file."""
import subprocess
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, SR16, ffmpeg_pcm  # noqa: E402
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402

clips = sys.argv[1:]
tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
tts.prepare_conditionals(str(SRC / "ref.wav"))
out = SRC / "samples/resynth"
out.mkdir(parents=True, exist_ok=True)
parts = []
for cid in clips:
    wav = next(p for p in [SRC / "dataset-v2/wavs" / f"{cid}.wav", SRC / "dataset/wavs" / f"{cid}.wav"] if p.exists())
    with torch.inference_mode():
        tokens, _ = tts.s3gen.tokenizer.forward([ffmpeg_pcm(wav, SR16)])
        audio, _ = tts.s3gen.inference(speech_tokens=torch.atleast_2d(tokens)[0], ref_dict=tts.conds.gen)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ar", "24000", "-ac", "1", str(out / f"{cid}-orig.wav")], check=True)
    torchaudio.save(str(out / f"{cid}-resynth.wav"), audio.cpu(), tts.sr)
    parts += [out / f"{cid}-orig.wav", SRC / "gap.wav", out / f"{cid}-resynth.wav", SRC / "gap.wav", SRC / "gap.wav"]
    print(cid, "ok", flush=True)
args = sum([["-i", str(p)] for p in parts], [])
subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", f"concat=n={len(parts)}:v=0:a=1",
                "-ar", "24000", "-ac", "1", str(out / "orig-vs-resynth.wav")], check=True)
print("->", out / "orig-vs-resynth.wav")
