"""Pilot 0 (PILOT-0.md, approved by the user 2026-10-10): a small learning test of Genarabia-ai/Chatterbox_Kuwaiti on the
clips the user verified. Research only; everything stays on this machine; one run.
  build   voice-src/pilot0/: 24 verified clips (voice-data/pilot-review-answers.json minus pilot0-spoken.json's exclusions),
          text = the user's transcript with digits/Latin written as spoken, audio = the untouched vocal-stem clip
          resampled to 24 kHz (no loudness, pitch, pace or pause change). Features with the Kuwaiti checkpoint's own
          tokenizer. 2 clips held out as 'val' (diagnostic loss only).
  train   LoRA r32 on T3 q/k/v/o, lr 1e-4, batch 1, 300 steps, checkpoints at 150 and 300 (tk_voice_train.train).
  sample  the frozen test set (11 sentences) with base and each checkpoint: voice-src/pilot0/gen/<tag>/.
Run: TK_T3_BASE=/root/ck-kw HF_HUB_OFFLINE=1 /root/tkvoice/bin/python video/brand/tk_pilot0.py build|train|sample"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
SRC = ROOT / "voice-src"
DATA = SRC / "pilot0"
VD = ROOT / "video/brand/voice-data"
TEST = [(it["id"], it["text"]) for it in json.loads((VD / "ckkw-unseen-10.json").read_text())["items"]] + \
       [("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
VAL = {"JtVZPG9Jxqk-u025", "TlGXbHWi-vU-u012"}


def texts():
    ans = json.loads((VD / "pilot-review-answers.json").read_text())
    drafts = {c["id"]: c for c in json.loads((SRC / "pilot/drafts.json").read_text())["clips"]}
    spoken = json.loads((VD / "pilot0-spoken.json").read_text())
    out = {}
    for k, a in sorted(ans.items()):
        if a.get("clip") != "ok" or a.get("text_ok") not in ("yes", "fixed") or k in spoken["exclude"]:
            continue
        t = a.get("text") or drafts[k]["draft"]
        for x, y in spoken["replace"].get(k, []):
            t = t.replace(x, y)
        assert not any(ch.isascii() and ch.isalnum() for ch in t), (k, t)
        out[k] = t
    return out


def build():
    import torch
    from chatterbox.mtl_tts import punc_norm
    from tk_voice_train import load_tts, ffmpeg_pcm, SR16, SR24
    tts = load_tts("cpu")
    (DATA / "wavs").mkdir(parents=True, exist_ok=True)
    rows, feats = [], {}
    for k, text in texts().items():
        wav = DATA / "wavs" / f"{k}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / "pilot/clips" / f"{k}.wav"), "-ac", "1", "-ar", str(SR24),
                        "-c:a", "pcm_s16le", str(wav)], check=True)
        w16 = ffmpeg_pcm(wav, SR16)
        with torch.inference_mode():
            speech, _ = tts.s3gen.tokenizer.forward([w16])
            ve = torch.from_numpy(tts.ve.embeds_from_wavs([w16], sample_rate=SR16)).mean(0)
            prompt, _ = tts.s3gen.tokenizer.forward([w16[: 6 * SR16]], max_len=tts.t3.hp.speech_cond_prompt_len)
        feats[k] = {"text": tts.tokenizer.text_to_tokens(punc_norm(text), language_id="ar")[0].cpu(),
                    "speech": torch.atleast_2d(speech)[0].cpu(), "ve": ve.cpu(), "prompt": torch.atleast_2d(prompt)[0].cpu()}
        rows.append(f"{k}|{text}|{'val' if k in VAL else 'train'}")
        print(k, len(feats[k]["speech"]), "speech tokens", flush=True)
    (DATA / "metadata.csv").write_text("\n".join(rows) + "\n")
    torch.save(feats, DATA / "feats.pt")
    print(len(rows), "clips ->", DATA)


def train():
    from types import SimpleNamespace
    from tk_voice_train import train as t
    t(SimpleNamespace(data="pilot0", name="pilot0", steps=300, batch=1, lr=1e-4, eval_every=150, resume=None, patience=0,
                      device="cpu", rank=32))


def sample():
    from tk_ckkw_ali import clone
    for tag, lora in [("base", None), ("step150", SRC / "ckpt/pilot0/step00150.pt"), ("step300", SRC / "ckpt/pilot0/step00300.pt")]:
        out = DATA / "gen" / tag
        todo = [(k, t) for k, t in TEST if not (out / f"clone-{k}.wav").exists()]
        if todo:
            clone(todo, out, vc_too=False, lora=str(lora) if lora else None)


if __name__ == "__main__":
    import torch
    torch.set_num_threads(4)
    {"build": build, "train": train, "sample": sample}[sys.argv[1]]()
