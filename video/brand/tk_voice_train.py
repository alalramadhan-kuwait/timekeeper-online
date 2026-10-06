"""TK Voice, phases B/D/E (VOICE-PLAN.md 4.3–4.9): LoRA fine-tune of Chatterbox Multilingual V3.

  build    voice-src/<id>.segments.json + voice-data/fixes.json -> voice-src/dataset/ (wavs, metadata.csv, feats.pt)
  train    LoRA (rank 32) on the T3 transformer's q/k/v/o; S3Gen and the voice encoder stay frozen
  sample   the five phase-A lines (+ held-out test clips) from a checkpoint

Runs on CPU (slow but fine for minutes of data) or on a CUDA / Apple GPU via --device.
Audio, features and checkpoints stay in voice-src/ (git-ignored).
"""
import argparse
import json
import math
import random
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "voice-src"
DATA = SRC / "dataset"
FIXES = Path(__file__).resolve().parent / "voice-data/fixes.json"
SR16, SR24 = 16000, 24000


def ffmpeg_pcm(path, sr, start=None, end=None):
    cmd = ["ffmpeg", "-v", "error"]
    if start is not None:
        cmd += ["-ss", str(start), "-to", str(end)]
    cmd += ["-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).copy()


# ---------------------------------------------------------------- build

def draft_clips(segments, min_s=4.0, max_s=11.0, gap_s=0.25):
    """Merge Whisper words into clips that end on a pause, 4–12 s long."""
    words = [w for s in segments for w in s["words"]]
    clips, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        dur = cur[-1][1] - cur[0][0]
        gap = words[i + 1][0] - w[1] if i + 1 < len(words) else 9
        if (dur >= min_s and gap >= gap_s) or dur >= max_s or i + 1 == len(words):
            clips.append(cur)
            cur = []
    return [{"start": round(max(c[0][0] - 0.08, 0), 2), "end": round(c[-1][1] + 0.12, 2),
             "text": "".join(w[2] for w in c).strip()} for c in clips]


def build(audio: Path):
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, punc_norm

    fixes = json.loads(FIXES.read_text())
    clips = draft_clips(json.loads(audio.with_suffix(".segments.json").read_text()))
    (DATA / "wavs").mkdir(parents=True, exist_ok=True)
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    rows, feats = [], {}
    for n, c in enumerate(clips):
        cid = f"{audio.stem}-{n:03d}"
        text = c["text"]
        for a, b in fixes["replace"]:
            text = text.replace(a, b)
        if cid in fixes.get("drop", []):
            continue
        wav_path = DATA / "wavs" / f"{cid}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(c["start"]), "-to", str(c["end"]), "-i", str(audio),
                        "-ac", "1", "-ar", str(SR24), "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-c:a", "pcm_s16le",
                        str(wav_path)], check=True)
        w16 = ffmpeg_pcm(wav_path, SR16)
        with torch.inference_mode():
            speech, _ = tts.s3gen.tokenizer.forward([w16])
            ve = torch.from_numpy(tts.ve.embeds_from_wavs([w16], sample_rate=SR16)).mean(0)
            prompt, _ = tts.s3gen.tokenizer.forward([w16[: 6 * SR16]], max_len=tts.t3.hp.speech_cond_prompt_len)
        text_tokens = tts.tokenizer.text_to_tokens(punc_norm(text), language_id="ar")[0]
        feats[cid] = {"text": text_tokens.cpu(), "speech": torch.atleast_2d(speech)[0].cpu(), "ve": ve.cpu(),
                      "prompt": torch.atleast_2d(prompt)[0].cpu()}
        split = "test" if cid.replace(audio.stem, "tudor") in fixes.get("test", []) or cid in fixes.get("test", []) else "train"
        rows.append(f"{cid}|{text}|{split}")
        print(cid, split, f"{c['end'] - c['start']:.1f}s", len(feats[cid]["speech"]), "tokens", flush=True)
    (DATA / "metadata.csv").write_text("\n".join(rows) + "\n")
    torch.save(feats, DATA / "feats.pt")
    print(f"{len(rows)} clips -> {DATA}")


def build_screened(keep_path: Path, name: str):
    """Add the screened channel clips (tk_voice_screen.py) to a dataset next to the Tudor episode."""
    import re
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, punc_norm

    fixes = json.loads(FIXES.read_text())
    keep = set(json.loads(keep_path.read_text()))
    rows_in = [r for r in json.loads((SRC / "screen.json").read_text())
               if r["id"] in keep and not re.search(r"[0-9\u0660-\u0669]", r["text"])]
    out = SRC / name
    (out / "wavs").mkdir(parents=True, exist_ok=True)
    feats = torch.load(DATA / "feats.pt")                       # start from the Tudor episode
    rows = (DATA / "metadata.csv").read_text().split("\n")
    rows = [r for r in rows if r]
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    rng = random.Random(0)
    for r in rows_in:
        text = r["text"]
        for a, b in fixes["replace"]:
            text = text.replace(a, b)
        wav_path = out / "wavs" / f"{r['id']}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(r["start"]), "-to", str(r["end"]), "-i", str(SRC / r["src"]),
                        "-ac", "1", "-ar", str(SR24), "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-c:a", "pcm_s16le",
                        str(wav_path)], check=True)
        w16 = ffmpeg_pcm(wav_path, SR16)
        with torch.inference_mode():
            speech, _ = tts.s3gen.tokenizer.forward([w16])
            ve = torch.from_numpy(tts.ve.embeds_from_wavs([w16], sample_rate=SR16)).mean(0)
            prompt, _ = tts.s3gen.tokenizer.forward([w16[: 6 * SR16]], max_len=tts.t3.hp.speech_cond_prompt_len)
        feats[r["id"]] = {"text": tts.tokenizer.text_to_tokens(punc_norm(text), language_id="ar")[0].cpu(),
                          "speech": torch.atleast_2d(speech)[0].cpu(), "ve": ve.cpu(),
                          "prompt": torch.atleast_2d(prompt)[0].cpu()}
        rows.append(f"{r['id']}|{text}|{'test' if rng.random() < 0.03 else 'train'}")
    (out / "metadata.csv").write_text("\n".join(rows) + "\n")
    torch.save(feats, out / "feats.pt")
    print(f"{len(rows)} clips ({len(rows_in)} new) -> {out}")


# ---------------------------------------------------------------- LoRA

class LoRA(nn.Module):
    def __init__(self, base: nn.Linear, r=32, alpha=64, dropout=0.05):
        super().__init__()
        self.base, self.scale = base, alpha / r
        self.A = nn.Parameter(torch.randn(r, base.in_features) / math.sqrt(base.in_features))
        self.B = nn.Parameter(torch.zeros(base.out_features, r))
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        return self.base(x) + (self.drop(x) @ self.A.T @ self.B.T) * self.scale


def add_lora(t3, r):
    names = []
    for name, mod in list(t3.tfmr.named_modules()):
        for proj in ("q_proj", "k_proj", "v_proj", "o_proj"):
            lin = getattr(mod, proj, None)
            if isinstance(lin, nn.Linear):
                setattr(mod, proj, LoRA(lin, r=r, alpha=2 * r))
                names.append(f"{name}.{proj}")
    return names


def lora_state(t3):
    return {k: v.detach().cpu() for k, v in t3.state_dict().items() if k.endswith(".A") or k.endswith(".B")}


def load_tts(device, ckpt=None, r=32):
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    tts = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model="v3")
    if ckpt:
        add_lora(tts.t3, r)
        missing = tts.t3.load_state_dict(torch.load(ckpt, map_location=device), strict=False)
        assert not missing.unexpected_keys, missing.unexpected_keys
        tts.t3.to(device).eval()
    return tts


# ---------------------------------------------------------------- train

def t3_loss(t3, t3_cond, text_tokens, text_token_lens, speech_tokens, speech_token_lens):
    """Next-token cross-entropy. (T3.loss upstream feeds (B, L, C) logits unshifted, so it can't be used.)"""
    out = t3.forward(t3_cond=t3_cond, text_tokens=text_tokens, text_token_lens=text_token_lens,
                     speech_tokens=speech_tokens, speech_token_lens=speech_token_lens, training=True)

    def ce(logits, tokens, lens):
        tgt = tokens[:, 1:].masked_fill(torch.arange(tokens.size(1) - 1, device=tokens.device)[None] >= (lens - 1)[:, None], -100)
        return F.cross_entropy(logits[:, :-1].transpose(1, 2), tgt, ignore_index=-100)

    return ce(out.text_logits, text_tokens, text_token_lens), ce(out.speech_logits, speech_tokens, speech_token_lens)


def batchify(items, hp, device):
    from chatterbox.models.t3.modules.cond_enc import T3Cond

    sot, eot = hp.start_text_token, hp.stop_text_token
    sos, eos = hp.start_speech_token, hp.stop_speech_token
    texts = [torch.cat([torch.tensor([sot]), it["text"], torch.tensor([eot])]) for it in items]
    speech = [torch.cat([torch.tensor([sos]), it["speech"], torch.tensor([eos])]) for it in items]
    tl = torch.tensor([len(t) for t in texts]); sl = torch.tensor([len(s) for s in speech])
    T = torch.full((len(items), int(tl.max())), eot); S = torch.full((len(items), int(sl.max())), eos)
    for i, (t, s) in enumerate(zip(texts, speech)):
        T[i, : len(t)] = t; S[i, : len(s)] = s
    plen = hp.speech_cond_prompt_len
    P = torch.stack([F.pad(it["prompt"][:plen], (0, max(0, plen - len(it["prompt"][:plen]))), value=0) for it in items])
    cond = T3Cond(speaker_emb=torch.stack([it["ve"] for it in items]), cond_prompt_speech_tokens=P,
                  emotion_adv=0.5 * torch.ones(len(items), 1, 1)).to(device=device)
    return cond, T.to(device), tl.to(device), S.to(device), sl.to(device)


def with_other_prompt(feats, key, by_video, rng=random):
    """Same clip, but speaker embedding and prompt tokens from another clip of the same video."""
    pool = [k for k in by_video[key.rsplit("-", 1)[0]] if k != key] or [key]
    other = feats[rng.choice(pool)]
    return {**feats[key], "prompt": other["prompt"], "ve": other["ve"]}


def train(args):
    torch.manual_seed(0); random.seed(0)
    data = SRC / args.data
    feats = torch.load(data / "feats.pt")
    split = dict(l.split("|")[0::2] for l in (data / "metadata.csv").read_text().split("\n") if l)
    tr = [k for k, s in split.items() if s == "train"]; te = [k for k, s in split.items() if s == "test"]

    # The voice prompt must come from a *different* clip: a prompt cut from the target clip lets T3 copy it,
    # and at inference (prompt = ref.wav) that shortcut is gone and the speech falls apart.
    by_video = {}
    for k in feats:
        by_video.setdefault(k.rsplit("-", 1)[0], []).append(k)

    tts = load_tts(args.device)
    t3 = tts.t3
    del tts.s3gen, tts.ve  # only T3 trains; frees ~3 GB on a 15 GB box
    t3.tfmr.gradient_checkpointing_enable()
    t3.tfmr.config.use_cache = False
    for p in t3.parameters():
        p.requires_grad_(False)
    n = add_lora(t3, args.rank)
    t3.to(args.device).train()
    params = [p for p in t3.parameters() if p.requires_grad]
    print(f"LoRA on {len(n)} projections, {sum(p.numel() for p in params) / 1e6:.1f}M trainable; "
          f"{len(tr)} train / {len(te)} test clips", flush=True)
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=0.0)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 20))
    out = SRC / "ckpt" / args.name
    out.mkdir(parents=True, exist_ok=True)

    def evaluate():
        t3.eval(); tot = []
        with torch.no_grad():
            for k in te:
                lt, ls = t3_loss(t3, *batchify([with_other_prompt(feats, k, by_video, random.Random(k))], t3.hp, args.device))
                tot.append(ls.item())
        t3.train()
        return float(np.mean(tot)) if tot else float("nan")

    log = open(out / "log.tsv", "a")
    print(f"step 0  test_speech_loss {evaluate():.3f}", flush=True)
    step, t0 = 0, time.time()
    while step < args.steps:
        random.shuffle(tr)
        for i in range(0, len(tr), args.batch):
            keys = tr[i: i + args.batch]
            cond, T, tl, S, sl = batchify([with_other_prompt(feats, k, by_video) for k in keys], t3.hp, args.device)
            lt, ls = t3_loss(t3, cond, T, tl, S, sl)
            loss = ls + 0.1 * lt
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step(); sched.step(); step += 1
            msg = f"step {step}  speech {ls.item():.3f}  text {lt.item():.3f}  {(time.time() - t0) / step:.1f}s/step"
            if step % args.eval_every == 0 or step == args.steps:
                msg += f"  test_speech_loss {evaluate():.3f}"
                torch.save(lora_state(t3), out / f"step{step:05d}.pt")
            print(msg, flush=True); log.write(msg + "\n"); log.flush()
            if step >= args.steps:
                break


# ---------------------------------------------------------------- sample

def sample(args):
    import sys
    import torchaudio
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from tk_voice_a import LINES, CLIPS

    torch.manual_seed(0)
    tts = load_tts(args.device, args.ckpt, args.rank)
    clips = json.loads(CLIPS.read_text())
    lines = {k: (v or clips[k]["text"]) for k, v in LINES.items()}
    for row in (DATA / "metadata.csv").read_text().split("\n"):
        if row.endswith("|test"):
            cid, text, _ = row.split("|"); lines[cid] = text
    out = SRC / "samples" / (Path(args.ckpt).parent.name + "-" + Path(args.ckpt).stem if args.ckpt else "base")
    out.mkdir(parents=True, exist_ok=True)
    for k, text in lines.items():
        wav = tts.generate(text, language_id="ar", audio_prompt_path=str(SRC / "ref.wav"),
                           exaggeration=args.exaggeration, cfg_weight=args.cfg)
        torchaudio.save(str(out / f"{k}.wav"), wav, tts.sr)
        print(k, f"{wav.shape[-1] / tts.sr:.1f}s", flush=True)
    print("->", out)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--device", default="cpu")
    p.add_argument("--rank", type=int, default=32)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build"); b.add_argument("audio", type=Path)
    bs = sub.add_parser("build-screened"); bs.add_argument("keep", type=Path); bs.add_argument("--name", default="dataset-v2")
    t = sub.add_parser("train"); t.add_argument("--name", default="run1"); t.add_argument("--data", default="dataset"); t.add_argument("--steps", type=int, default=300)
    t.add_argument("--batch", type=int, default=1); t.add_argument("--lr", type=float, default=1e-4)
    t.add_argument("--eval-every", type=int, default=50)
    s = sub.add_parser("sample"); s.add_argument("--ckpt"); s.add_argument("--exaggeration", type=float, default=0.4)
    s.add_argument("--cfg", type=float, default=0.5)
    a = p.parse_args()
    torch.set_num_threads(4)
    {"build": lambda: build(a.audio), "build-screened": lambda: build_screened(a.keep, a.name), "train": lambda: train(a), "sample": lambda: sample(a)}[a.cmd]()
