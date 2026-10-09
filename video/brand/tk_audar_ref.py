"""Reference comparison (Ali's decision 2026-10-08): Audar-TTS-V1-Turbo (AudarAI Community License v1.0; a small
business qualifies for limited commercial use; comparison only, its outputs are never training data) clones Ali
from one 11 s training clip and reads 30 held-out sentences from the 'final' split, so Ali's real recording of the
same words is the reference. Plain text, as Whisper wrote it: Audar has no G2P and claims Gulf dialect handling.
Run with /root/audar/bin/python. Output: voice-src/refcmp/audar/<clip>.wav
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import soundfile as sf
import torch
from huggingface_hub import hf_hub_download
from llama_cpp import Llama
from neucodec import NeuCodec

SRC = Path(__file__).resolve().parents[2] / "voice-src"
REF = "2GWn1WniyDI-008"                       # the clearest Kuwaiti clip (also the phase-B prompt); train split
OUT = SRC / "refcmp/audar"
OUT.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(4)

rows = {l.split("|")[0]: l.split("|") for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l}
lines = json.loads(Path(sys.argv[1]).read_text())
wav = next(p for p in (SRC / "dataset-v2/wavs" / f"{REF}.wav", SRC / "dataset/wavs" / f"{REF}.wav") if p.exists())
ref16 = OUT / "ref16.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-ar", "16000", str(ref16)], check=True)

llm = Llama(model_path=hf_hub_download("audarai/Audar-TTS-V1-Turbo", "Audar-TTS-V1-Turbo-Q5_K_M.gguf"),
            n_ctx=4096, n_gpu_layers=0, n_threads=4, verbose=False, seed=0)
# neuphonic/neucodec (Apache-2.0) is login-gated (auto-approved): needs HF_TOKEN in the environment settings
# from an account that accepted its terms. Third-party mirrors are not used.
codec = NeuCodec.from_pretrained("neuphonic/neucodec").eval()
ref = "".join(f"<|speech_{c}|>" for c in codec.encode_code(str(ref16)).squeeze().tolist())
tce = llm.tokenize(b"<|TARGET_CODES_END|>", add_bos=False, special=True)[0]

for ln in lines:
    f = OUT / f"{ln['id']}.wav"
    if f.exists():
        continue
    prompt = ("user: Convert the text to speech:"
              f"<|REF_TEXT_START|>{rows[REF][1]}<|REF_TEXT_END|>"
              f"<|REF_SPEECH_START|>{ref}<|REF_SPEECH_END|>"
              f"<|TARGET_TEXT_START|>{ln['text']}<|TARGET_TEXT_END|>"
              "\nassistant:<|TARGET_CODES_START|>")
    llm.reset()
    ids = []
    for tid in llm.generate(llm.tokenize(prompt.encode(), add_bos=False, special=True),
                            temp=1.0, top_k=40, top_p=0.9, repeat_penalty=1.1):
        if tid == tce or len(ids) >= 2048:
            break
        ids.append(tid)
    text = "".join(llm.detokenize([t], special=True).decode("utf-8", "ignore") for t in ids)
    codes = [int(x) for x in re.findall(r"<\|speech_(\d+)\|>", text)]
    with torch.inference_mode():
        w = codec.decode_code(torch.tensor(codes)[None, None, :]).cpu().numpy()[0, 0, :]
    sf.write(str(f), w, 24000)
    print(ln["id"], f"{len(w) / 24000:.1f}s", flush=True)
