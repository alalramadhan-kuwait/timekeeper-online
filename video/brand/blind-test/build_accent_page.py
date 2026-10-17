"""Blind accent test of the first OmniVoice script: three settings under letters أ/ب/ج (order random, key in
voice-src/compare/script1/accent-key.json). Questions: which sounds most Kuwaiti, and is it usable.
Output: voice-src/compare/page-accent/.  Run: python3 build_accent_page.py"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare/script1"
OUT = ROOT / "voice-src/compare/page-accent"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
KEYF = SRC / "accent-key.json"
names = ["afb-ref8", "afb-kwref", "auto-kwref"]
key = json.loads(KEYF.read_text()) if KEYF.exists() else random.SystemRandom().sample(names, 3)
KEYF.write_text(json.dumps(key))
players = []
for i, n in enumerate(key):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / f"accent-{n}.wav"), "-ac", "1", "-b:a", "128k", str(OUT / "audio" / f"v{i}.mp3")], check=True)
    players.append({"label": "أبج"[i], "src": f"audio/v{i}.mp3"})
text = " ".join(json.loads((ROOT / "video/brand/voice-data/omni-script-1.json").read_text())["lines"])
L = [["0", "أ"], ["1", "ب"], ["2", "ج"]]
cards = [{"id": "accent", "part": 1, "title": "نفس النص بثلاث إعدادات", "text": text, "players": players,
          "questions": [{"key": "kuwaiti", "label": "أي وحدة أكثر كويتية (أقل سعودية)؟", "options": L + [["same", "كلهم نفس الشي"]]},
                        {"key": "ready", "label": "الأفضل يصلح لفيديو؟", "options": [["yes", "إي"], ["almost", "قريب"], ["no", "لا"]]}]}]
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "أي وحدة أكثر كويتية؟").replace("__KEY__", "tk-accent").replace(
    "__LEDE__", "قلت إن النبرة سعودية. جربت ثلاث إعدادات مختلفة لنفس النص، والترتيب عشوائي. اختار اللي أكثر كويتية.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print("->", OUT, key)
