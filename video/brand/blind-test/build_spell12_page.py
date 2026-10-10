"""Listening page for the 12-word spelling test (voice-data/ckkw-spelling-12.json): Chatterbox_Kuwaiti cloned to Ali,
each word written three ways. 4 pages of 3 words. The user picks the spelling the model says the way Ali would.
Output: voice-src/ck-kw-ali/spell12/page/.  Run: python3 build_spell12_page.py"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = json.loads((ROOT / "video/brand/voice-data/ckkw-spelling-12.json").read_text())
SRC = ROOT / "voice-src/ck-kw-ali/spell12"
OUT = SRC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
cards = []
for n, g in enumerate(SPEC["groups"]):
    players = []
    for i, (tag, text) in enumerate(g["variants"], 1):
        src = SRC / f"clone-{g['id']}-{tag}.wav"
        if not src.exists():
            continue
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{g['id']}-{tag}.mp3")], check=True)
        players.append({"label": f"كتابة {i}", "src": f"audio/{g['id']}-{tag}.mp3", "text": text})
    cards.append({"id": g["id"], "part": n // 3 + 1, "title": f"كلمة «{g['word']}»", "players": players,
                  "questions": [{"key": "best", "label": "أي وحدة قالها مثل علي؟",
                                 "options": [["1", "١"], ["2", "٢"], ["3", "٣"], ["all", "كلها صح"], ["none", "كلها غلط"]]}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "قاموس الكتابة").replace("__KEY__", "tk-spell12").replace(
    "__LEDE__", "كل كلمة مكتوبة بثلاث طرق، وكلها بصوت علي. اختار الكتابة اللي قالها الموديل مثل ما يقولها علي. إذا كلها صح أو كلها غلط، اختار هذا. 4 صفحات، كل صفحة 3 كلمات.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
