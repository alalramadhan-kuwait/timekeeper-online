"""Build the blind A/B/C listening page.

For each of the 10 lines, the three versions get random labels (س / ص / ع). The page only knows the labels;
the label -> version key stays in voice-src/abc/blind-key.json (git-ignored) and is applied when reading results.
Output: voice-src/abc/page/ (index.html + audio/*.mp3) ready to publish.
"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ABC = ROOT / "voice-src/abc"
OUT = ABC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
lines = json.loads((ABC / "A/lines.json").read_text())
labels = ["س", "ص", "ع"]
rng = random.Random(20261007)
key, items = {}, []
for n, (lid, text) in enumerate(lines.items(), 1):
    order = ["A", "B", "C"]
    rng.shuffle(order)
    key[lid] = dict(zip(labels, order))
    opts = []
    for i, (lab, var) in enumerate(zip(labels, order)):
        name = f"s{n:02d}-{i}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ABC / var / f"{lid}.wav"), "-ac", "1",
                        "-b:a", "96k", str(OUT / "audio" / name)], check=True)
        opts.append({"label": lab, "src": f"audio/{name}"})
    items.append({"id": lid, "n": n, "text": text, "opts": opts})
(ABC / "blind-key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
html = (Path(__file__).parent / "template.html").read_text().replace("__ITEMS__", json.dumps(items, ensure_ascii=False))
(OUT / "index.html").write_text(html)
print(len(items), "lines ->", OUT)
