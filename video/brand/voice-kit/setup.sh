#!/usr/bin/env bash
# One-time setup of Ali's automatic voice. Needs Python 3.10+ and ffmpeg. About 4 GB of disk (model weights download
# from Hugging Face on first use). Works on CPU (about 30-60 s per sentence) or a CUDA GPU.
set -e
cd "$(dirname "$0")"
# The adapter comes in two parts (each under 30 MB). Put adapter-part1 and adapter-part2 in this folder or in adapter/.
if [ ! -f adapter/adapter_model.safetensors ]; then
  p1=$(ls adapter-part1 adapter/adapter-part1 2>/dev/null | head -1); p2=$(ls adapter-part2 adapter/adapter-part2 2>/dev/null | head -1)
  if [ -n "$p1" ] && [ -n "$p2" ]; then cat "$p1" "$p2" > adapter/adapter_model.safetensors && rm -f "$p1" "$p2" && echo "adapter joined"
  else echo "adapter-part1 and adapter-part2 not found: say.py needs them (or run it with --no-adapter)"; exit 1; fi
fi
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cpu || .venv/bin/pip install -q torch torchaudio
.venv/bin/pip install -q "transformers>=5.3.0" accelerate peft soundfile librosa numpy pydub
.venv/bin/pip install -q --no-deps "git+https://github.com/k2-fsa/OmniVoice.git"
echo "ready: .venv/bin/python say.py \"هلا والله\" test.wav"
