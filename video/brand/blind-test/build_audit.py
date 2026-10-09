"""Listening page for the Kuwaiti transcript audit: 30 real candidates, spread across sounds, words and
recognizer confidence (high and medium, so false positives show up too). Each plays the word with ~0.6 s of
context from the training clip. Output: voice-src/kw-audit/page/ (+ picks.json, the sample).
"""
import json
import random
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
import sys
A = ROOT / "voice-src" / (sys.argv[1] if len(sys.argv) > 1 else "kw-audit")
OUT = A / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
cands = json.loads((A / "candidates.json").read_text())
rng = random.Random(30)

by_flag = defaultdict(list)
for c in cands:
    by_flag[c["flag"]].append(c)
total = sum(len(v) for v in by_flag.values())
quota = {f: max(4, round(30 * len(v) / total)) for f, v in by_flag.items()}
while sum(quota.values()) > 30:
    quota[max(quota, key=quota.get)] -= 1
picks = []
for f, v in by_flag.items():
    hi = [c for c in v if c["conf"] >= 0.8]
    mid = [c for c in v if 0.5 <= c["conf"] < 0.8]
    rng.shuffle(hi); rng.shuffle(mid)
    seen = defaultdict(int)
    want_mid = quota[f] // 3
    for pool, n in ((mid, want_mid), (hi, quota[f] - want_mid), (hi + mid, quota[f])):
        for c in pool:
            if sum(1 for p in picks if p["flag"] == f) >= quota[f] or n <= 0:
                break
            if c in picks or seen[c["word"]] >= 2:
                continue
            picks.append(c); seen[c["word"]] += 1; n -= 1
rng.shuffle(picks)
items = []
for n, c in enumerate(picks, 1):
    wav = next(p for p in (ROOT / "voice-src/dataset-v2/wavs" / f'{c["clip"]}.wav', ROOT / "voice-src/dataset/wavs" / f'{c["clip"]}.wav') if p.exists())
    name = f"a{n:02d}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(max(0, c["t0"] - 0.6)), "-to", str(c["t1"] + 0.6), "-i", str(wav),
                    "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
    words = c["text"].split()
    wi = next((i for i, w in enumerate(words) if w == c["word"]), -1)
    lo, hi = max(0, wi - 6), wi + 7
    items.append({"id": f"a{n:02d}", "n": n, "flag": c["flag"], "word": c["word"], "heard": c["heard"],
                  "context": " ".join(words[lo:hi]), "wordIndex": wi - lo, "src": f"audio/{name}",
                  "clip": c["clip"], "conf": c["conf"]})
(A / "picks.json").write_text(json.dumps(items, ensure_ascii=False, indent=1))
page = (Path(__file__).parent / "audit-template.html").read_text().replace("__ITEMS__", json.dumps(
    [{k: v for k, v in it.items() if k not in ("clip", "conf")} for it in items], ensure_ascii=False))
(OUT / "index.html").write_text(page)
print(len(items), "examples;", {f: sum(1 for i in items if i["flag"] == f) for f in by_flag}, "->", OUT)
