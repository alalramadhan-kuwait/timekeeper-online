"""Blind page for the 30-sentence reference comparison: Ali's real recording (labelled reference) + every model
present in voice-src/refcmp/<model>/ for that sentence, shuffled per sentence under letters. The key
(sentence -> letter -> model) stays in voice-src/refcmp/blind-key.json. Output: voice-src/refcmp/page/
Usage: python3 build_refcmp.py <part 1-6> v4 habibi [audar ...]   (Ali's sessions: 5 sentences each)
"""
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
R = ROOT / "voice-src/refcmp"
PART = int(sys.argv[1])
OUT = R / f"page{PART}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
models = sys.argv[2:]
lines = json.loads((R / "lines.json").read_text())
letters = "أبجد"
KEY = R / "blind-key.json"
key = json.loads(KEY.read_text())["key"] if KEY.exists() else {}
items = []


def mp3(src, name):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
    return f"audio/{name}"


for n, ln in enumerate(lines, 1):
    if not (PART - 1) * 5 < n <= PART * 5:
        continue
    have = [m for m in models if (R / m / f"{ln['id']}.wav").exists()]
    random.Random(f"refcmp-{n}").shuffle(have)
    opts = []
    for i, m in enumerate(have):
        key.setdefault(f"s{n:02d}", {"clip": ln["id"]})[letters[i]] = m
        opts.append({"label": letters[i], "src": mp3(R / m / f"{ln['id']}.wav", f"s{n:02d}-{i}.mp3")})
    items.append({"id": f"s{n:02d}", "clip": ln["id"], "n": n, "text": ln["text"],
                  "ref": mp3(R / "ali" / f"{ln['id']}.wav", f"s{n:02d}-ref.mp3"), "opts": opts})
KEY.write_text(json.dumps({"models": models, "key": key}, ensure_ascii=False, indent=1))
page = (Path(__file__).parent / "refcmp-template.html").read_text()
(OUT / "index.html").write_text(page.replace("__ITEMS__", json.dumps(
    [{k: v for k, v in it.items() if k != "clip"} for it in items], ensure_ascii=False)))
print(len(items), "sentences;", models, "->", OUT)
