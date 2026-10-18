#!/usr/bin/env bash
# One-time setup of Ali's automatic voice. Needs Python 3.10+ and ffmpeg. About 4 GB of disk (model weights download
# from Hugging Face on first use). Works on CPU (about 30-60 s per sentence) or a CUDA GPU.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cpu || .venv/bin/pip install -q torch torchaudio
.venv/bin/pip install -q "transformers>=5.3.0" accelerate peft soundfile librosa numpy pydub
.venv/bin/pip install -q --no-deps "git+https://github.com/k2-fsa/OmniVoice.git"
echo "ready: .venv/bin/python say.py \"هلا والله\" test.wav"
