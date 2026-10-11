"""Blind page for tk_compare_all.py: 2 sentences, every model under a letter (أ ب ج د هـ و) drawn per sentence and kept in
voice-src/compare/key.json. Each version: dialect, rhythm and tone, is it Ali; then the best of the sentence.
One sentence a page. Output: voice-src/compare/page/.  Run: python3 build_compare_all.py"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare"
OUT = SRC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
MODELS = ["ckkw", "ckkw_p0", "ckkw_own", "v5", "silma", "fahed_vc"]
SENT = [("u06", "عيل خلنا نطلب شوي زيادة باجر قبل لا تخلص."), ("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"]
KEYF = SRC / "key.json"
key = json.loads(KEYF.read_text()) if KEYF.exists() else {}
DIAL = [["kw", "كويتية"], ["near", "قريبة"], ["no", "مو كويتية"]]
FLOW = [["natural", "طبيعي"], ["ok", "مقبول"], ["robotic", "آلي"]]
YES = [["yes", "إي"], ["no", "لا"]]
cards = []
for n, (sid, text) in enumerate(SENT):
    present = [m for m in MODELS if (SRC / m / f"{sid}.wav").exists()]
    if sid not in key or sorted(key[sid]) != sorted(present):
        key[sid] = random.SystemRandom().sample(present, len(present))
    players, qs = [], []
    for i, m in enumerate(key[sid]):
        name = f"{sid}-{i}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / m / f"{sid}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
        players.append({"label": LETTERS[i], "src": f"audio/{name}"})
        qs += [{"key": f"dial_{i}", "label": f"{LETTERS[i]}: اللهجة", "options": DIAL},
               {"key": f"flow_{i}", "label": f"{LETTERS[i]}: الإيقاع", "options": FLOW},
               {"key": f"ali_{i}", "label": f"{LETTERS[i]}: صوت علي؟", "options": YES}]
    qs.append({"key": "best", "label": "الأفضل بشكل عام؟", "options": [[str(i), LETTERS[i]] for i in range(len(players))]})
    cards.append({"id": sid, "part": n + 1, "title": f"جملة {n + 1}", "text": text, "players": players, "questions": qs})
KEYF.write_text(json.dumps(key))
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "كل الموديلات").replace("__KEY__", "tk-compare-all").replace(
    "__LEDE__", f"نفس الجملة من {len(MODELS)} موديلات مختلفة، كل واحد تحت حرف، والترتيب عشوائي. "
                "قيّم كل نسخة: اللهجة، الإيقاع، وهل هو صوت علي. بعدين اختار الأفضل. صفحتين، كل صفحة جملة.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards,", [len(c["players"]) for c in cards], "versions ->", OUT)
