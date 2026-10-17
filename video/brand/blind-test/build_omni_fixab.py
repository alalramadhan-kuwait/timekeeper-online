"""Blind before/after: OmniVoice on Ali's real sentences with the uncorrected text (omni-ali) vs the user's corrected
text (omni-ali-fixed: English in English, diacritics, misspellings fixed). Letters drawn per sentence, key in
voice-src/compare/fixab-key.json. One question plus the wrong words of each.
Output: voice-src/compare/page-omni-fixab/.  Run: python3 build_omni_fixab.py"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare"
OUT = SRC / "page-omni-fixab"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
FIXED = json.loads((ROOT / "video/brand/voice-data/omni-fixed-texts.json").read_text())["texts"]
KEYF = SRC / "fixab-key.json"
key = json.loads(KEYF.read_text()) if KEYF.exists() else {}
cards = []
for n, (k, text) in enumerate(FIXED.items()):
    key.setdefault(k, random.SystemRandom().sample(["omni-ali", "omni-ali-fixed"], 2))
    players = []
    for i, (l, d) in enumerate(zip("أب", key[k])):
        name = f"{k}-{'ab'[i]}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / d / f"{k}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
        players.append({"label": l, "src": f"audio/{name}"})
    players.insert(0, {"label": "علي الحقيقي", "src": f"audio/{k}-ali.mp3", "ref": True})
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "voice-src/pilot/clips" / f"{k}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{k}-ali.mp3")], check=True)
    cards.append({"id": k, "part": 1 if n < 2 else 2, "title": f"جملة {n + 1}", "text": text, "players": players,
                  "questions": [{"key": "better", "label": "أيهم أقرب لكلام علي؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]}]})
KEYF.write_text(json.dumps(key))
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "بعد تصحيح النص").replace("__KEY__", "tk-omni-fixab").replace(
    "__LEDE__", "نفس الجمل: وحدة من النص القديم ووحدة من النص اللي صححته أنت، والترتيب عشوائي. فوقهم علي الحقيقي كمرجع. سؤال واحد: أيهم أقرب لكلام علي؟")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
