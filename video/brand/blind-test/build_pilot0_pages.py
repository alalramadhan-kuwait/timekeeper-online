"""Listening pages for pilot 0 (PILOT-0.md).
  pick     2 sentences (u06, t01) at step 150 and step 300, letters أ/ب drawn per sentence: which step is better.
  compare  the 11 frozen test sentences, before (base) vs after (the picked step), letters drawn per sentence; each version
           rated separately (wrong words, dialect, rhythm, is it Ali), then which is better.
Keys are kept in voice-src/pilot0/<mode>-key.json across rebuilds.
Output: voice-src/pilot0/page-<mode>/.  Run: python3 build_pilot0_pages.py pick | compare <step150|step300>"""
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
P0 = ROOT / "voice-src/pilot0"
VD = ROOT / "video/brand/voice-data"
TEST = {it["id"]: it["text"] for it in json.loads((VD / "ckkw-unseen-10.json").read_text())["items"]}
TEST["t01"] = "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟"
MODE = sys.argv[1]
OUT = P0 / f"page-{MODE}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
KEYF = P0 / f"{MODE}-key.json"
key = json.loads(KEYF.read_text()) if KEYF.exists() else {}
rnd = random.SystemRandom()
DIAL = [["kw", "كويتية"], ["near", "قريبة"], ["no", "مو كويتية"]]
FLOW = [["natural", "طبيعي"], ["ok", "مقبول"], ["robotic", "آلي / مو طبيعي"]]
YES = [["yes", "إي"], ["no", "لا"]]
if MODE == "pick":
    ids, pair = ["u06", "t01"], ["step150", "step300"]
else:
    ids, pair = list(TEST), ["base", sys.argv[2]]


def mp3(tag, sid, letter):
    name = f"{sid}-{letter}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(P0 / "gen" / tag / f"clone-{sid}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
    return f"audio/{name}"


cards = []
for n, sid in enumerate(ids):
    if sid not in key:
        key[sid] = rnd.sample(pair, 2)
    players = [{"label": l, "src": mp3(tag, sid, "ab"[i])} for i, (l, tag) in enumerate(zip("أب", key[sid]))]
    if MODE == "pick":
        qs = [{"key": "better", "label": "أيهم أحسن؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]}]
        words = None
    else:
        qs = []
        for k, l in (("a", "أ"), ("b", "ب")):
            qs += [{"key": f"dial_{k}", "label": f"لهجة {l}؟", "options": DIAL}, {"key": f"flow_{k}", "label": f"الإيقاع والنبرة في {l}؟", "options": FLOW},
                   {"key": f"ali_{k}", "label": f"{l} يبين صوت علي؟", "options": YES}]
        qs.append({"key": "better", "label": "أيهم أحسن بشكل عام؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]})
        words = [{"key": "wrong_a", "label": "في أ: اضغط على أي كلمة انقالت غلط أو مو كويتية"},
                 {"key": "wrong_b", "label": "في ب: اضغط على أي كلمة انقالت غلط أو مو كويتية"}]
    card = {"id": sid, "part": n // 3 + 1, "title": f"جملة {n + 1}", "text": TEST[sid], "players": players, "questions": qs}
    if words:
        card["words"] = words
    cards.append(card)
KEYF.write_text(json.dumps(key))
lede = ("نفس الموديل بعد التدريب، بمرحلتين مختلفتين (أ و ب، والترتيب عشوائي). اسمع الجملتين وقول أي نسخة أحسن."
        if MODE == "pick" else
        f"كل جملة بنسختين: قبل التدريب وبعده (أ و ب، والترتيب عشوائي لكل جملة). قيّم كل نسخة لحالها، بعدين قول أيهم أحسن. {cards[-1]['part']} صفحات، كل صفحة 3 جمل.")
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "تجربة 0: اختيار المرحلة" if MODE == "pick" else "تجربة 0: قبل وبعد").replace("__KEY__", f"tk-pilot0-{MODE}").replace("__LEDE__", lede)
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
