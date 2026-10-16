"""Blind A/B: OmniVoice (VoiceStudio's engine, Gulf Arabic mode) vs Chatterbox_Kuwaiti clone (our best automatic voice),
the two comparison sentences, Ali's reference for both. Letters drawn per sentence, key in voice-src/compare/omni-key.json.
Output: voice-src/compare/page-omni/.  Run: python3 build_omni_page.py [--full]"""
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare"
FULL = "--full" in sys.argv   # the 11 test sentences: OmniVoice (compare/omni11) vs the ckkw clone of pilot 0's baseline
OUT = SRC / ("page-omni11" if FULL else "page-omni")
(OUT / "audio").mkdir(parents=True, exist_ok=True)
SENT = [("u06", "عيل خلنا نطلب شوي زيادة باجر قبل لا تخلص."), ("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
if FULL:
    SENT = [(it["id"], it["text"]) for it in json.loads((ROOT / "video/brand/voice-data/ckkw-unseen-10.json").read_text())["items"]] + SENT[1:]
FILES = {"omnivoice": (lambda k: SRC / ("omni11" if FULL else "omnivoice") / f"{k}.wav"),
         "ckkw": (lambda k: ROOT / "voice-src/pilot0/gen/base" / f"clone-{k}.wav") if FULL else (lambda k: SRC / "ckkw" / f"{k}.wav")}
KEYF = SRC / ("omni11-key.json" if FULL else "omni-key.json")
key = json.loads(KEYF.read_text()) if KEYF.exists() else {}
DIAL = [["kw", "كويتية"], ["near", "قريبة"], ["no", "مو كويتية"]]
FLOW = [["natural", "طبيعي"], ["ok", "مقبول"], ["robotic", "آلي"]]
YES = [["yes", "إي"], ["no", "لا"]]
cards = []
for n, (sid, text) in enumerate(SENT):
    key.setdefault(sid, random.SystemRandom().sample(["omnivoice", "ckkw"], 2))
    players, qs = [], []
    for i, (l, m) in enumerate(zip("أب", key[sid])):
        name = f"{sid}-{'ab'[i]}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(FILES[m](sid)), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
        players.append({"label": l, "src": f"audio/{name}"})
        k = "ab"[i]
        qs += [{"key": f"dial_{k}", "label": f"{l}: اللهجة", "options": DIAL}, {"key": f"flow_{k}", "label": f"{l}: الإيقاع", "options": FLOW},
               {"key": f"ali_{k}", "label": f"{l}: صوت علي؟", "options": YES}]
    qs.append({"key": "better", "label": "أيهم أحسن؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]})
    card = {"id": sid, "part": n // 3 + 1, "title": f"جملة {n + 1}", "text": text, "players": players, "questions": qs,
            "words": [{"key": "wrong_a", "label": "في أ: اضغط على أي كلمة غلط"}, {"key": "wrong_b", "label": "في ب: اضغط على أي كلمة غلط"}]}
    if FULL:   # the user asked for one question only: which is better (pronunciation is looked at afterwards)
        card["questions"], card.pop("words")
        card["questions"] = qs[-1:]
    cards.append(card)
KEYF.write_text(json.dumps(key))
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "أيهم أحسن؟" if FULL else "موديل جديد").replace("__KEY__", "tk-omni11" if FULL else "tk-omni").replace(
    "__LEDE__", ("كل جملة بنسختين، كلهم بصوت علي، والترتيب عشوائي. سؤال واحد بس: أيهم أحسن؟ 4 صفحات، كل صفحة 3 جمل." if FULL else "نفس الجملتين بموديلين، كلهم بصوت علي: واحد منهم جديد (من VoiceStudio). الترتيب عشوائي. قيّم كل نسخة، بعدين قول أيهم أحسن."))
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
