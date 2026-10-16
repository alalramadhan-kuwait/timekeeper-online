"""Blind A/B: OmniVoice (VoiceStudio's engine, Gulf Arabic mode) vs Chatterbox_Kuwaiti clone (our best automatic voice),
the two comparison sentences, Ali's reference for both. Letters drawn per sentence, key in voice-src/compare/omni-key.json.
Output: voice-src/compare/page-omni/.  Run: python3 build_omni_page.py"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare"
OUT = SRC / "page-omni"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
SENT = [("u06", "عيل خلنا نطلب شوي زيادة باجر قبل لا تخلص."), ("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
KEYF = SRC / "omni-key.json"
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
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / m / f"{sid}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
        players.append({"label": l, "src": f"audio/{name}"})
        k = "ab"[i]
        qs += [{"key": f"dial_{k}", "label": f"{l}: اللهجة", "options": DIAL}, {"key": f"flow_{k}", "label": f"{l}: الإيقاع", "options": FLOW},
               {"key": f"ali_{k}", "label": f"{l}: صوت علي؟", "options": YES}]
    qs.append({"key": "better", "label": "أيهم أحسن؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]})
    cards.append({"id": sid, "part": 1, "title": f"جملة {n + 1}", "text": text, "players": players, "questions": qs,
                  "words": [{"key": "wrong_a", "label": "في أ: اضغط على أي كلمة غلط"}, {"key": "wrong_b", "label": "في ب: اضغط على أي كلمة غلط"}]})
KEYF.write_text(json.dumps(key))
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "موديل جديد").replace("__KEY__", "tk-omni").replace(
    "__LEDE__", "نفس الجملتين بموديلين، كلهم بصوت علي: واحد منهم جديد (من VoiceStudio). الترتيب عشوائي. قيّم كل نسخة، بعدين قول أيهم أحسن.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
