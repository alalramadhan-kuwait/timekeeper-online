"""OmniVoice on Ali's own verified sentences (real Kuwaiti text), next to Ali's real recording of the same words.
Per sentence: how close to Ali, and the wrong words. Output: voice-src/compare/page-omni-ali/.  Run: python3 build_omni_ali.py"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "video/brand"))
from tk_pilot0 import texts  # noqa: E402

SRC = ROOT / "voice-src/compare/omni-ali"
OUT = ROOT / "voice-src/compare/page-omni-ali"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
T = texts()
cards = []
for n, wav in enumerate(sorted(SRC.glob("*.wav"))):
    k = wav.stem
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "voice-src/pilot/clips" / f"{k}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{k}-ali.mp3")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{k}-model.mp3")], check=True)
    cards.append({"id": k, "part": n // 3 + 1, "title": f"جملة {n + 1}", "text": T[k],
                  "players": [{"label": "علي الحقيقي", "src": f"audio/{k}-ali.mp3", "ref": True}, {"label": "الموديل", "src": f"audio/{k}-model.mp3"}],
                  "questions": [{"key": "close", "label": "الموديل قد إيش قريب من كلام علي؟", "options": [["very", "قريب وايد"], ["close", "قريب"], ["far", "بعيد"]]}],
                  "words": [{"key": "wrong", "label": "اضغط على أي كلمة قالها الموديل غلط"}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "نص كويتي حقيقي").replace("__KEY__", "tk-omni-ali").replace(
    "__LEDE__", "جمل قالها علي في حلقاته. اسمع علي الحقيقي، بعدين الموديل يقول نفس الكلام بصوته. قول قد إيش قريب، واضغط على الكلمات الغلط.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
