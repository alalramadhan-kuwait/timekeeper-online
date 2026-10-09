"""One V5 listening page of 3 sealed sentences (Ali: "send me 3 each time"). Uses V5's renders in voice-src/v5ab/v5.
Usage: tk_v5_part.py <part 1-10>   -> voice-src/v5ab/part<N>/
Ali then asked to compare the latest model with the one before: each part is a blind A/B of V5 against v4 (same
sentences, same settings), with one hidden mapping per part kept in part<N>/key.json.
"""
import json
import random
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "voice-src"
N = int(sys.argv[1])
D = SRC / "v5ab"
OUT = D / f"part{N}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
lines = json.loads((Path(__file__).parent / "voice-data/kw-pron-test.json").read_text())["lines"][(N - 1) * 3: N * 3]
order = ["v4", "v5"]
random.SystemRandom().shuffle(order)
(OUT / "key.json").write_text(json.dumps({"أب"[i]: m for i, m in enumerate(order)}))
items = []
for i, l in enumerate(lines, (N - 1) * 3 + 1):
    opts = []
    for j, m in enumerate(order):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(D / m / f"{l['id']}.wav"), "-ac", "1", "-b:a", "96k",
                        str(OUT / "audio" / f"{l['id']}-{j}.mp3")], check=True)
        opts.append({"label": "أب"[j], "src": f"audio/{l['id']}-{j}.mp3"})
    items.append({"id": l["id"], "n": i, "text": l["plain"], "ref": None, "opts": opts})
page = (Path(__file__).parent / "blind-test/refcmp-template.html").read_text()
page = page.replace("<h1>نفس الجملة، كذا نسخة</h1>", f"<h1>الجديد ولا اللي قبله؟ الجزء {N}</h1>")
page = page.replace("فوق كل جملة تسجيلك الحقيقي، وهو المرجع. تحته صوتين",
                    "٣ جمل جديدة ما سجلتها أنت. كل جملة فيها صوتين: الموديل الجديد واللي قبله")
page = page.replace('ql.textContent = "أي وحدة أقرب لنطقك؟"', 'ql.textContent = "أي وحدة نطقها كويتي أصح؟"')
page = page.replace('"tkvoice-refcmp"', f'"tkvoice-v5part{N}"')
assert "الموديل الجديد واللي قبله" in page
(OUT / "index.html").write_text(page.replace("__ITEMS__", json.dumps(items, ensure_ascii=False)))
print(OUT, [l["id"] for l in lines])
