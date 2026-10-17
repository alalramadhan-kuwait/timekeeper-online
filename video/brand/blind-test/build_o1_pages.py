"""Pages for pilot O1 (PILOT-O1.md).
  pick     u06 and the script at step 150 vs 300, letters drawn per item: which is more Kuwaiti.
  compare  the 12 frozen items, before (base OmniVoice) vs after (the picked step), letters drawn per item; one question
           each («أيهم أكثر كويتية؟») plus, once, whether the better one is usable.
Keys in voice-src/pilotO1/<mode>-key.json.  Output: voice-src/pilotO1/page-<mode>/.
Run: python3 build_o1_pages.py pick | compare <150|300>"""
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
P = ROOT / "voice-src/pilotO1"
VD = ROOT / "video/brand/voice-data"
TEXT = {it["id"]: it["text"] for it in json.loads((VD / "ckkw-unseen-10.json").read_text())["items"]}
TEXT["t01"] = "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟"
TEXT["script"] = " ".join(json.loads((VD / "omni-script-1.json").read_text())["lines"])
MODE = sys.argv[1]


def path(tag, k):
    if tag == "base":
        return ROOT / ("voice-src/compare/script1/speed-1.0.wav" if k == "script" else f"voice-src/compare/omni11/{k}.wav")
    return P / "gen" / tag / f"{k}.wav"


ids, pair = (["u06", "script"], ["150", "300"]) if MODE == "pick" else (list(TEXT), ["base", sys.argv[2]])
OUT = P / f"page-{MODE}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
KEYF = P / f"{MODE}-key.json"
key = json.loads(KEYF.read_text()) if KEYF.exists() else {}
cards = []
for n, k in enumerate(ids):
    key.setdefault(k, random.SystemRandom().sample(pair, 2))
    players = []
    for i, (l, tag) in enumerate(zip("أب", key[k])):
        name = f"{k}-{'ab'[i]}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path(tag, k)), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
        players.append({"label": l, "src": f"audio/{name}"})
    qs = [{"key": "kuwaiti", "label": "أيهم أكثر كويتية؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]}]
    if MODE == "compare" and k == "script":
        qs.append({"key": "ready", "label": "الأفضل يصلح لفيديو؟", "options": [["yes", "إي"], ["almost", "قريب"], ["no", "لا"]]})
    cards.append({"id": k, "part": n // 4 + 1, "title": "نص تايم كيبر" if k == "script" else f"جملة {n + 1}", "text": TEXT[k],
                  "players": players, "questions": qs})
KEYF.write_text(json.dumps(key))
page = (Path(__file__).parent / "listen-template.html").read_text()
title, lede = (("تدريب O1: اختيار المرحلة", "مرحلتين من التدريب على كلام علي (الترتيب عشوائي). أيهم أكثر كويتية؟") if MODE == "pick" else
               ("تدريب O1: قبل وبعد", f"كل جملة بنسختين: قبل التدريب على كلام علي وبعده، والترتيب عشوائي. سؤال واحد: أيهم أكثر كويتية؟ {cards[-1]['part']} صفحات."))
page = page.replace("__TITLE__", title).replace("__KEY__", f"tk-o1-{MODE}").replace("__LEDE__", lede)
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
