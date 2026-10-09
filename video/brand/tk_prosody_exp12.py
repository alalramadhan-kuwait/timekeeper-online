"""Prosody experiments 1 and 2 on held-out sessions (val + final, never trained on).

Exp 1  real clip -> S3 speech codes -> S3Gen. Does the code representation keep Ali's melody and timing?
       recon_ref : speaker prompt = ref.wav (how films are rendered)
       recon_self: speaker prompt = the clip itself (isolates what the codes carry)
Exp 2  same transcript spoken by base Chatterbox and by the T3 LoRA, compared with the real clip.

Writes voice-src/prosody/exp12/<id>/{orig,recon_ref,recon_self,base,lora}.wav and results.json.
"""
import json
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, SR16, ffmpeg_pcm, load_tts  # noqa: E402
from tk_prosody import compare, features  # noqa: E402

CKPT = SRC / "ckpt/v4/step02250.pt"
OUT = SRC / "prosody/exp12"
N_PER_SPLIT = 6

screen = {r["id"]: r for r in json.loads((SRC / "screen.json").read_text())}
rows = [l.split("|") for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l]
pick = []
for split in ("val", "final"):
    cand = [(c, t) for c, t, s in rows if s == split and c in screen and 5 <= screen[c]["dur"] <= 11]
    cand.sort(key=lambda ct: -screen[ct[0]]["sim"])
    per_video = {}
    for c, t in cand:                      # at most 2 per video, so 3 sessions each give 2
        v = c.rsplit("-", 1)[0]
        if per_video.get(v, 0) >= 2:
            continue
        pick.append((c, t, split)); per_video[v] = per_video.get(v, 0) + 1
        if sum(1 for p in pick if p[2] == split) >= N_PER_SPLIT:
            break

torch.set_num_threads(4)
OUT.mkdir(parents=True, exist_ok=True)


def wav_of(cid):
    return SRC / "dataset-v2/wavs" / f"{cid}.wav"


# Exp 1 + base generation share the base model
tts = load_tts("cpu")
tts.prepare_conditionals(str(SRC / "ref.wav"), exaggeration=0.4)
ref_gen = tts.conds.gen
for cid, text, split in pick:
    d = OUT / cid
    d.mkdir(exist_ok=True)
    torchaudio.save(str(d / "orig.wav"), torch.from_numpy(ffmpeg_pcm(wav_of(cid), 24000)).unsqueeze(0), 24000)
    with torch.inference_mode():
        tok, _ = tts.s3gen.tokenizer.forward([ffmpeg_pcm(wav_of(cid), SR16)])
        tok = torch.atleast_2d(tok)[0]
        w, _ = tts.s3gen.inference(speech_tokens=tok, ref_dict=ref_gen)
        torchaudio.save(str(d / "recon_ref.wav"), w.cpu(), tts.sr)
        self_ref = tts.s3gen.embed_ref(ffmpeg_pcm(wav_of(cid), 24000)[: 10 * 24000], 24000, device="cpu")
        w, _ = tts.s3gen.inference(speech_tokens=tok, ref_dict=self_ref)
        torchaudio.save(str(d / "recon_self.wav"), w.cpu(), tts.sr)
    if not (d / "base.wav").exists():
        torch.manual_seed(0)
        torchaudio.save(str(d / "base.wav"), tts.generate(text, language_id="ar", exaggeration=0.4, cfg_weight=0.5), tts.sr)
    print("base+recon", cid, flush=True)

del tts
tts = load_tts("cpu", str(CKPT))
tts.prepare_conditionals(str(SRC / "ref.wav"), exaggeration=0.4)
for cid, text, split in pick:
    d = OUT / cid
    if not (d / "lora.wav").exists():
        torch.manual_seed(0)
        torchaudio.save(str(d / "lora.wav"), tts.generate(text, language_id="ar", exaggeration=0.4, cfg_weight=0.5), tts.sr)
    print("lora", cid, flush=True)

results = []
for cid, text, split in pick:
    d = OUT / cid
    r = {"id": cid, "split": split, "text": text, "features": {}, "vs_orig": {}}
    for k in ("orig", "recon_ref", "recon_self", "base", "lora"):
        r["features"][k] = features(d / f"{k}.wav", text)
        if k != "orig":
            r["vs_orig"][k] = compare(d / "orig.wav", d / f"{k}.wav")
    results.append(r)
    print(cid, {k: (v["f0_corr"], v["range_ratio"], v["dur_ratio"]) for k, v in r["vs_orig"].items()}, flush=True)
(OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
print("->", OUT / "results.json")
