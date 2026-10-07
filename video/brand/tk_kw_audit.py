"""Kuwaiti transcript audit: does the training text say what Ali actually pronounced?

For every clip in dataset-v4 (train + val + final, 699 clips):
  1. phoneme recognition on the clip (wav2vec2-xlsr-53-espeak-cv-ft, IPA, 20 ms frames; analysis only)
  2. align the training-text words with Whisper's timed words for that clip
  3. for each training word containing ق / ك / ج, read the phones heard inside that word's time span and
     flag candidates: ق heard as g, ق heard as dʒ, ك heard as tʃ, ج heard as j
Flags are CANDIDATES for Ali's ear, not ground truth. Nothing is rewritten here.
Writes voice-src/kw-audit/candidates.json, stats.json and a short audio snippet per candidate.
"""
import difflib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import hf_hub_download
from transformers import AutoModelForCTC

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, SR16, draft_clips, ffmpeg_pcm  # noqa: E402

MODEL = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
OUT = SRC / "kw-audit"
FRAME = 0.02
Q_LIKE, G_LIKE, DJ_LIKE = {"q", "ɢ", "qʰ"}, {"ɡ", "g", "ɡʲ"}, {"dʒ", "ʒ", "dʑ", "ɟ"}
K_LIKE, CH_LIKE, Y_LIKE = {"k", "kʰ", "c"}, {"tʃ", "tɕ", "ʃ"}, {"j"}
torch.set_num_threads(4)


def norm(w):
    w = re.sub(r"[^ء-يچگa-zA-Z]", "", w)
    return w.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")


def clip_words():
    """clip id -> (clip start in its video, [(word, t0, t1), ...]) from Whisper's word timings."""
    out = {}
    screen = {r["id"]: r for r in json.loads((SRC / "screen.json").read_text())}
    tudor = json.loads((SRC / "ZhOZyrX90nI.segments.json").read_text())
    for n, c in enumerate(draft_clips(tudor)):
        screen[f"ZhOZyrX90nI-{n:03d}"] = {"start": c["start"], "end": c["end"], "video": "ZhOZyrX90nI"}
    cache = {}
    for cid, r in screen.items():
        vid = r.get("video") or cid.rsplit("-", 1)[0]
        if vid not in cache:
            p = SRC / "raw" / f"{vid}.segments.json"
            cache[vid] = tudor if vid == "ZhOZyrX90nI" else json.loads(p.read_text())
        words = [(w[2].strip(), w[0], w[1]) for s in cache[vid] for w in s["words"]
                 if w[0] >= r["start"] - 0.05 and w[1] <= r["end"] + 0.05]
        out[cid] = (r["start"], words)
    return out


def main():
    global OUT
    if len(sys.argv) > 1:
        OUT = SRC / "kw-audit-smoke"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "snips").mkdir(exist_ok=True)
    vocab = json.loads(Path(hf_hub_download(MODEL, "vocab.json")).read_text())
    inv = {i: p for p, i in vocab.items()}
    blank = vocab.get("<pad>", 0)
    model = AutoModelForCTC.from_pretrained(MODEL).eval()
    timed = clip_words()
    rows = [l.split("|") for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l]
    if len(sys.argv) > 1:                       # smoke test: python3 tk_kw_audit.py 8
        rows = rows[:: max(1, len(rows) // int(sys.argv[1]))][: int(sys.argv[1])]
    letters = Counter()
    cands = []
    clips_flagged = set()
    for k, (cid, text, split) in enumerate(rows):
        wav = next(p for p in (SRC / "dataset-v2/wavs" / f"{cid}.wav", SRC / "dataset/wavs" / f"{cid}.wav") if p.exists())
        a = ffmpeg_pcm(wav, SR16)
        a = (a - a.mean()) / (a.std() + 1e-7)
        with torch.inference_mode():
            logits = model(torch.from_numpy(a)[None]).logits[0]
        probs = logits.softmax(-1)
        ids = probs.argmax(-1).numpy()
        phones = []  # (phone, frame, prob)
        prev = None
        for f, i in enumerate(ids):
            if i != prev and i != blank:
                phones.append((inv[int(i)], f, float(probs[f, i])))
            prev = i
        start, words = timed.get(cid, (0, []))
        tw = [norm(t) for t in text.split()]
        ww = [norm(w[0]) for w in words]
        sm = difflib.SequenceMatcher(a=tw, b=ww, autojunk=False)
        spans = {}
        for blk in sm.get_matching_blocks():
            for j in range(blk.size):
                spans[blk.a + j] = words[blk.b + j]
        for tag, i1, i2, j1, j2 in sm.get_opcodes():       # 1:1 replacements (spelling differences) also get times
            if tag == "replace" and i2 - i1 == j2 - j1:
                for j in range(i2 - i1):
                    spans[i1 + j] = words[j1 + j]
        for i, word in enumerate(text.split()):
            for ch in "قكج":
                letters[ch] += word.count(ch)
            if not any(ch in word for ch in "قكج") or i not in spans:
                continue
            _, t0, t1 = spans[i]
            f0, f1 = int((t0 - start - 0.03) / FRAME), int((t1 - start + 0.03) / FRAME)
            heard = [(p, pr) for p, f, pr in phones if f0 <= f <= f1]
            hp = {p for p, _ in heard}
            flags = []
            if "ق" in word and not hp & Q_LIKE:
                if hp & G_LIKE:
                    flags.append("ق→g")
                elif hp & DJ_LIKE:
                    flags.append("ق→dʒ")
            if "ك" in word and hp & CH_LIKE and not hp & K_LIKE:
                flags.append("ك→ch")
            if "ج" in word and hp & Y_LIKE and not hp & DJ_LIKE and not hp & G_LIKE:
                flags.append("ج→y")
            for fl in flags:
                ev = {"ق→g": G_LIKE, "ق→dʒ": DJ_LIKE, "ك→ch": CH_LIKE, "ج→y": Y_LIKE}[fl]
                conf = max(pr for p, pr in heard if p in ev)
                cands.append({"clip": cid, "split": split, "word": word, "flag": fl, "conf": round(conf, 3),
                              "t0": round(t0 - start, 2), "t1": round(t1 - start, 2),
                              "heard": " ".join(p for p, _ in heard), "text": text})
                clips_flagged.add(cid)
        if k % 50 == 0:
            print(k, len(rows), "clips;", len(cands), "candidates", flush=True)
    for n, c in enumerate(sorted(cands, key=lambda c: -c["conf"])):
        c["rank"] = n
    by = Counter(c["flag"] for c in cands)
    words = Counter((c["flag"], c["word"]) for c in cands)
    stats = {
        "clips": len(rows), "clips_with_candidates": len(clips_flagged),
        "pct_clips": round(100 * len(clips_flagged) / len(rows), 1),
        "letters_in_text": dict(letters), "candidates_by_sound": dict(by),
        "candidate_rate_per_letter": {f: round(100 * n / max(1, letters[f[0]]), 1) for f, n in by.items()},
        "top_words": [[f, w, n] for (f, w), n in words.most_common(40)],
    }
    (OUT / "candidates.json").write_text(json.dumps(cands, ensure_ascii=False, indent=1))
    (OUT / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1))
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
