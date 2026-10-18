"""Combined word page: 'confirm' sentences (dictionary applied; tap wrong words) and spelling-variant groups (pick the
right one). Output: voice-src/omni-words/<dir>/page/.  Run: python3 build_round_page.py <spec.json> <dir>"""
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


def mp3(i):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / f"{i}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{i}.mp3")], check=True)
    return f"audio/{i}.mp3"


cards = []
for it in spec.get("confirm", []):
    cards.append({"id": it["id"], "title": f"تأكيد: جملة {len(cards) + 1}", "text": it["text"], "players": [{"label": "صوت علي", "src": mp3(it["id"])}],
                  "questions": [{"key": "ok", "label": "الجملة كلها صح؟", "options": [["yes", "إي، كلها صح"], ["no", "فيها كلمات غلط"]]}],
                  "words": [{"key": "wrong", "label": "اضغط على الكلمات الغلط"}]})
for g in spec.get("groups", []):
    players = [{"label": f"كتابة {DIG[i]}", "src": mp3(v), "text": t} for i, (v, t) in enumerate(g["variants"])]
    cards.append({"id": g["id"], "title": f"كلمة «{g['word']}»", "players": players,
                  "questions": [{"key": "best", "label": "أي وحدة قالت الكلمة صح؟",
                                 "options": [[str(i + 1), DIG[i]] for i in range(len(players))] + [["none", "كلها غلط"]]}]})
for n, c in enumerate(cards):
    c["part"] = n // 4 + 1
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", f"تصحيح الكلمات، جولة {d[1:]}").replace("__KEY__", f"tk-words-{d}").replace(
    "__LEDE__", "أول شي: جمل جديدة فيها الكلمات اللي صلحناها، نتأكد إنها صارت صح. بعدين: كلمات بعدها غلط، كل وحدة بكذا كتابة، اختار الصح.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
