"""Spelling-variant page for the production voice: each wrong word in its sentence, written several ways. The user
picks the one said right (or none). Output: voice-src/omni-words/<dir>/page/.
Run: python3 build_variants_page.py <variants.json> <dir>"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec, d = json.loads(Path(sys.argv[1]).read_text()), sys.argv[2]
SRC = ROOT / "voice-src/omni-words" / d
OUT = SRC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
DIG = "١٢٣٤٥٦"
cards = []
for n, g in enumerate(spec["groups"]):
    players = []
    for i, (vid, text) in enumerate(g["variants"]):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / f"{vid}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{vid}.mp3")], check=True)
        players.append({"label": f"كتابة {DIG[i]}", "src": f"audio/{vid}.mp3", "text": text})
    opts = [[str(i + 1), DIG[i]] for i in range(len(players))] + [["none", "كلها غلط"]]
    cards.append({"id": g["id"], "part": n // 3 + 1, "title": f"كلمة «{g['word']}»", "players": players,
                  "questions": [{"key": "best", "label": "أي وحدة قالت الكلمة صح؟", "options": opts}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "اختار الكتابة الصح").replace("__KEY__", f"tk-variants-{d}").replace(
    "__LEDE__", "كل كلمة قلت إنها غلط، بنفس الجملة، مكتوبة بأكثر من طريقة. اختار اللي انقالت صح، وتنضاف للقاموس. إذا كلها غلط، اختار «كلها غلط» واكتب بالملاحظة شلون تنقال.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
