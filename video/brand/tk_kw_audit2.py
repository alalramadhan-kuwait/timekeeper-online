"""Kuwaiti transcript audit, round 2: the cases round 1 could not settle.

Round 1 (Ali's ear, 27 picks): ق→g flags at confidence >= 0.5 were right 22/22; ك→ch flags were wrong 4/4.
Open questions, each answered by a short ear check:
  1. unflagged ق in mostly-g words (حق, قاعد, قبل, ...): did Ali say q there, or did the recognizer miss a g?
     -> decides between a per-instance rule and a per-word rule
  2. ق→g flags below 0.5 confidence (12)
  3. ك→ch flags never heard in round 1 (كم, لكن, فيك ...)
Writes voice-src/kw-audit/round2/ (picks.json + page/).
"""
import json
import random
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

import torch
from huggingface_hub import hf_hub_download
from transformers import AutoModelForCTC

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_kw_audit import FRAME, MODEL, clip_words, norm  # noqa: E402
from tk_voice_train import SRC, SR16, ffmpeg_pcm  # noqa: E402
import difflib  # noqa: E402

A = SRC / "kw-audit"
OUT = A / "round2"
torch.set_num_threads(4)


ROUND3 = ["الوقت", "فقط", "أعتقد", "قدموا", "ننتقل", "بطريقة", "أقل", "علاقة", "طريق", "موقع", "القالب",
          "تعقيدة", "الطاقة", "منطقة", "صديقي", "بالمستقبل", "فستقي", "فرق"]


ROUND5 = ["حق", "قلنا", "تقريبا", "نقول", "نقدر", "فوق", "عقرب", "ننتقل", "طريقة", "يقدمون", "قدموها", "أزرق",
          "يقول", "يقدر", "قال", "تقدرون", "أقول", "أقل", "قاموا", "عقب"]


def bare(w):
    return re.sub(r"[^؀-ۿ]", "", w)


def main():
    cands = json.loads((A / "candidates.json").read_text())
    done = {(p["clip"], p["word"]) for p in json.loads((A / "picks.json").read_text())}
    rows = [l.split("|") for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l]
    flagged = {(c["clip"], c["word"]) for c in cands if c["flag"] == "ق→g"}
    total = Counter(bare(t) for _, tx, _ in rows for t in tx.split() if "ق" in t)
    gcount = Counter(bare(c["word"]) for c in cands if c["flag"] == "ق→g")
    mixed = {w for w, n in total.items() if gcount[w] and gcount[w] < n}
    rng = random.Random(2)

    # 1. unflagged instances of mixed words, at most 2 per word, the most frequent words first
    pool = defaultdict(list)
    for cid, tx, _ in rows:
        for t in tx.split():
            if bare(t) in mixed and (cid, t) not in flagged:
                pool[bare(t)].append((cid, t, tx))
    want = []
    for w in sorted(pool, key=lambda w: -total[w]):
        rng.shuffle(pool[w])
        want += [("ق-unflagged", *x) for x in pool[w][:2]]
    want = want[:16]
    # 2. low-confidence ق→g flags, 6 of 12
    lo = [c for c in cands if c["flag"] == "ق→g" and c["conf"] < 0.5]
    rng.shuffle(lo)
    want += [("ق→g-low", c["clip"], c["word"], c["text"]) for c in lo[:6]]
    if len(sys.argv) > 1 and sys.argv[1] in ("3", "5"):
        # round 3: ق words the recognizer never flagged, one clip per frequent word family, plus the other كم
        global OUT
        OUT = A / f"round{sys.argv[1]}"
        heard_before = {(p["clip"], p["word"]) for p in json.loads((A / "round3/picks.json").read_text())} if sys.argv[1] == "5" else set()
        want = []
        for fam in (ROUND3 if sys.argv[1] == "3" else ROUND5):
            hits = [(cid, t, tx) for cid, tx, _ in rows for t in tx.split() if bare(t) == fam and (cid, t) not in heard_before]
            if hits:
                want.append(("ق-never", *rng.choice(hits)))
        if sys.argv[1] == "3":
            want += [("كم", cid, t, tx) for cid, tx, _ in rows for t in tx.split()
                     if bare(t) in ("كم", "بكم", "وكم") and (cid, t) not in {(c["clip"], c["word"]) for c in cands}]
    # 3. ك→ch flags not yet heard (one per word)
    seen = set() if not (len(sys.argv) > 1 and sys.argv[1] in ("3", "5")) else {bare(c["word"]) for c in cands}
    for c in sorted((c for c in cands if c["flag"] == "ك→ch"), key=lambda c: -c["conf"]):
        if (c["clip"], c["word"]) in done or bare(c["word"]) in seen or bare(c["word"]).startswith(("شرك", "الشرك")):
            continue
        seen.add(bare(c["word"]))
        want.append(("ك→ch", c["clip"], c["word"], c["text"]))

    vocab = json.loads(Path(hf_hub_download(MODEL, "vocab.json")).read_text())
    inv = {i: p for p, i in vocab.items()}
    blank = vocab.get("<pad>", 0)
    model = AutoModelForCTC.from_pretrained(MODEL).eval()
    timed = clip_words()
    (OUT / "page/audio").mkdir(parents=True, exist_ok=True)
    items = []
    rng.shuffle(want)
    for kind, cid, word, text in want:
        wav = next(p for p in (SRC / "dataset-v2/wavs" / f"{cid}.wav", SRC / "dataset/wavs" / f"{cid}.wav") if p.exists())
        start, words = timed[cid]
        tw = [norm(t) for t in text.split()]
        sm = difflib.SequenceMatcher(a=tw, b=[norm(w[0]) for w in words], autojunk=False)
        spans = {}
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
                for j in range(i2 - i1):
                    spans[i1 + j] = words[j1 + j]
        wi = text.split().index(word)
        if wi not in spans:
            continue
        _, t0, t1 = spans[wi]
        t0, t1 = t0 - start, t1 - start
        a = ffmpeg_pcm(wav, SR16)
        a = (a - a.mean()) / (a.std() + 1e-7)
        with torch.inference_mode():
            ids = model(torch.from_numpy(a)[None]).logits[0].argmax(-1).numpy()
        f0, f1 = int((t0 - 0.03) / FRAME), int((t1 + 0.03) / FRAME)
        heard, prev = [], None
        for f, i in enumerate(ids):
            if i != prev and i != blank and f0 <= f <= f1:
                heard.append(inv[int(i)])
            prev = i
        n = len(items) + 1
        name = f"b{n:02d}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(max(0, t0 - 0.6)), "-to", str(t1 + 0.6), "-i", str(wav),
                        "-ac", "1", "-b:a", "96k", str(OUT / "page/audio" / name)], check=True)
        ws = text.split()
        lo_, hi_ = max(0, wi - 6), wi + 7
        items.append({"id": f"b{n:02d}", "n": n, "kind": kind, "flag": "ك→ch" if kind in ("ك→ch", "كم") else "ق→g",
                      "word": word, "heard": " ".join(heard), "context": " ".join(ws[lo_:hi_]),
                      "wordIndex": wi - lo_, "src": f"audio/{name}", "clip": cid})
    (OUT / "picks.json").write_text(json.dumps(items, ensure_ascii=False, indent=1))
    page = (Path(__file__).parent / "blind-test/audit-template.html").read_text()
    page = page.replace("<title>تدقيق النطق الكويتي</title>", "<title>تدقيق النطق ٢</title>" if OUT.name == "round2" else "<title>تدقيق النطق ٣</title>")
    page = page.replace("const PART = 10;", "const PART = 9;" if OUT.name == "round2" else "const PART = 7;")
    # blind to the recognizer this time: no "heard" line, so the ear decides alone
    page = page.replace("meta.append(a); card.append(meta);", "")
    lede = re.search(r'<p class="lede">.*?</p>', page).group(0)
    page = page.replace(lede, '<p class="lede">' + ("الجولة الثالثة: كلمات فيها ق ما علّمها الجهاز ولا مرة، وكلمة كم. " if OUT.name == "round3" else "الجولة الثانية: الحالات اللي الجولة الأولى ما حسمتها. ") + 'هالمرة ما أوريك شنو سمع الجهاز، عشان أذنك بروحها تحكم. اسمع الكلمة المعلّمة وقلي شنو قلت.</p>')
    page = page.replace("__ITEMS__", json.dumps([{k: v for k, v in it.items() if k not in ("clip", "kind")} for it in items],
                                                ensure_ascii=False))
    (OUT / "page/index.html").write_text(page)
    print(len(items), Counter(i["kind"] for i in items), "mixed words:", len(mixed))


if __name__ == "__main__":
    main()
