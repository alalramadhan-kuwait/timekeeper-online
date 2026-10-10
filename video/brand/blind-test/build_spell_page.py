"""Listening page for a spelling test (voice-data/<spec>.json): Chatterbox_Kuwaiti cloned to Ali. A group with one
spelling asks whether the model said it right; a group with several asks which one it said the way Ali would.
3 words a page. Output: voice-src/ck-kw-ali/<spec>/page/.  Run: python3 build_spell_page.py ckkw-spelling-34"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
NAME = sys.argv[1]
SPEC = json.loads((ROOT / f"video/brand/voice-data/{NAME}.json").read_text())
SRC = ROOT / "voice-src/ck-kw-ali" / NAME
OUT = SRC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
DIGITS = "١٢٣٤"
cards = []
for n, g in enumerate(SPEC["groups"]):
    players = []
    for i, (tag, text) in enumerate(g["variants"], 1):
        src = SRC / f"clone-{g['id']}-{tag}.wav"
        if not src.exists():
            continue
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{g['id']}-{tag}.mp3")], check=True)
        players.append({"label": f"كتابة {i}" if len(g["variants"]) > 1 else "التسجيل", "src": f"audio/{g['id']}-{tag}.mp3", "text": text})
    if len(players) == 1:
        q = {"key": "ok", "label": "قال الكلمة صح مثل علي؟", "options": [["yes", "صح"], ["near", "قريب"], ["no", "غلط"]]}
    else:
        q = {"key": "best", "label": "أي وحدة قالها مثل علي؟",
             "options": [[str(i), DIGITS[i - 1]] for i in range(1, len(players) + 1)] + [["all", "كلها صح"], ["none", "كلها غلط"]]}
    cards.append({"id": g["id"], "part": n // 3 + 1, "title": f"«{g['word']}»", "players": players, "questions": [q]})
pages = cards[-1]["part"]
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "قاموس الكتابة ٢").replace("__KEY__", "tk-" + NAME).replace(
    "__LEDE__", f"كل كلمة داخل جملة، وكلها بصوت علي. إذا فيه كتابة وحدة: قول صح أو قريب أو غلط. إذا فيه أكثر من كتابة: اختار اللي قالها مثل علي. "
                f"في أول خمس كلمات القاف لازم تنقال قاف فصيحة. {pages} صفحة، كل صفحة 3 كلمات.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards,", sum(len(c["players"]) for c in cards), "clips ->", OUT)
