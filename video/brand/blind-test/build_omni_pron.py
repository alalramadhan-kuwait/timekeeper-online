"""Pronunciation check of OmniVoice (the winner, 11/11) on the 11 test sentences: one version per sentence, the user taps
wrong words and rates the dialect. Output: voice-src/compare/page-omni-pron/.  Run: python3 build_omni_pron.py"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare"
OUT = SRC / "page-omni-pron"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
SENT = [(it["id"], it["text"]) for it in json.loads((ROOT / "video/brand/voice-data/ckkw-unseen-10.json").read_text())["items"]] + \
       [("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
cards = []
for n, (sid, text) in enumerate(SENT):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / "omni11" / f"{sid}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{sid}.mp3")], check=True)
    cards.append({"id": sid, "part": n // 4 + 1, "title": f"جملة {n + 1}", "text": text, "players": [{"label": "صوت علي", "src": f"audio/{sid}.mp3"}],
                  "questions": [{"key": "dial", "label": "اللهجة؟", "options": [["kw", "كويتية"], ["near", "قريبة"], ["no", "مو كويتية"]]}],
                  "words": [{"key": "wrong", "label": "اضغط على أي كلمة انقالت غلط أو مو كويتية (إذا كلها صح، لا تضغط شي)"}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "نطق الموديل الجديد").replace("__KEY__", "tk-omni-pron").replace(
    "__LEDE__", "الموديل اللي فاز ١١ من ١١. اسمع كل جملة، اضغط على الكلمات الغلط، وقول اللهجة. ٣ صفحات.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
