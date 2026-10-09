"""«اسأل محمد» narration with Habibi (Ali: personal, non-commercial account; CC-BY-NC-SA-4.0 noted). Adapted from
video/brand/tk_habibi_ref.py: Reference comparison, Habibi side (research only: Unified checkpoint is CC-BY-NC-SA-4.0; never training data,
never redistributed). Unified model with dialect UAE (no Kuwaiti ID; UAE is a Gulf reference, not assumed closest),
cloning Ali from the same 11 s training clip Audar uses, reading the same 30 held-out 'final' sentences, plain text.
Run with /root/habibi/bin/python. Output: voice-src/refcmp/habibi/<clip>.wav
"""
import json
import sys
from importlib.resources import files
from pathlib import Path

import soundfile as sf
import torch
from cached_path import cached_path
from f5_tts.infer.utils_infer import load_model, load_vocoder, preprocess_ref_audio_text
from hydra.utils import get_class
from omegaconf import OmegaConf

from habibi_tts.infer.utils_infer import (cfg_strength, cross_fade_duration, infer_process, nfe_step, speed,
                                          sway_sampling_coef, target_rms)
from habibi_tts.model.utils import dialect_id_map

SRC = Path(__file__).resolve().parents[2] / "voice-src"   # Ali's 11 s reference clip lives here
REF = "2GWn1WniyDI-008"
OUT = Path(__file__).resolve().parent / "voice-habibi"
OUT.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(4)
torch.manual_seed(0)

rows = {l.split("|")[0]: l.split("|") for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l}
lines = [{"id": k, "text": t} for k, t in json.loads((Path(__file__).resolve().parent / "narration.json").read_text()).items() if not k.startswith("_")]
wav = next(p for p in (SRC / "dataset-v2/wavs" / f"{REF}.wav", SRC / "dataset/wavs" / f"{REF}.wav") if p.exists())

cfg = OmegaConf.load(str(files("f5_tts").joinpath("configs/F5TTS_v1_Base.yaml")))
model = load_model(get_class(f"f5_tts.model.{cfg.model.backbone}"), cfg.model.arch,
                   str(cached_path("hf://SWivid/Habibi-TTS/Unified/model_200000.safetensors")),
                   mel_spec_type=cfg.model.mel_spec.mel_spec_type,
                   vocab_file=str(cached_path("hf://SWivid/Habibi-TTS/Unified/vocab.txt")), device="cpu")
vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device="cpu")
ref_audio, ref_text = preprocess_ref_audio_text(str(wav), rows[REF][1])

for ln in lines:
    f = OUT / f"{ln['id']}.wav"
    if f.exists():
        continue
    torch.manual_seed(0)
    audio, sr, _ = infer_process(ref_audio, ref_text, ln["text"], model, vocoder,
                                 mel_spec_type=cfg.model.mel_spec.mel_spec_type, target_rms=target_rms,
                                 cross_fade_duration=cross_fade_duration, nfe_step=nfe_step,
                                 cfg_strength=cfg_strength, sway_sampling_coef=sway_sampling_coef, speed=speed,
                                 device="cpu", dialect_id=dialect_id_map["UAE"])
    sf.write(str(f), audio, sr)
    print(ln["id"], f"{len(audio) / sr:.1f}s", flush=True)
