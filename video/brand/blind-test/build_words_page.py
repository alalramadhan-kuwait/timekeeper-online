"""Word-check page for the production voice: one version per sentence, the user taps every wrong word and may write
how it should sound. Output: voice-src/omni-words/<round>/page/.  Run: python3 build_words_page.py <items.json> <round>"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
items, rnd = json.loads(Path(sys.argv[1]).read_text()), sys.argv[2]
SRC = ROOT / "voice-src/omni-words" / rnd
OUT = SRC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
cards = []
for n, it in enumerate(items):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / f"{it['id']}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{it['id']}.mp3")], check=True)
    cards.append({"id": it["id"], "part": n // 4 + 1, "title": f"جملة {n + 1}", "text": it["text"],
                  "players": [{"label": "صوت علي", "src": f"audio/{it['id']}.mp3"}],
                  "questions": [{"key": "ok", "label": "الجملة كلها صح؟", "options": [["yes", "إي، كلها صح"], ["no", "فيها كلمات غلط"]]}],
                  "words": [{"key": "wrong", "label": "اضغط على الكلمات الغلط، واكتب بالملاحظة شلون تنقال إذا تحب"}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", f"تصحيح الكلمات، جولة {rnd[1:]}").replace("__KEY__", f"tk-words-{rnd}").replace(
    "__LEDE__", "الصوت الحالي. اضغط على أي كلمة انقالت غلط. بعدين أجرب لكل كلمة كذا كتابة، وأنت تختار الصح، وتنضاف للقاموس.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
