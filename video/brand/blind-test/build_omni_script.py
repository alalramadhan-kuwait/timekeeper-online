"""Page for the first OmniVoice script: the whole script at two speeds (1.0 and 1.25), labelled, with the text.
Questions: which speed, good enough for a real video, wrong words. Output: voice-src/compare/page-script1/.
Run: python3 build_omni_script.py"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/compare/script1"
OUT = ROOT / "voice-src/compare/page-script1"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
text = " ".join(json.loads((ROOT / "video/brand/voice-data/omni-script-1.json").read_text())["lines"])
for s in ("1.0", "1.25"):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / f"speed-{s}.wav"), "-ac", "1", "-b:a", "128k", str(OUT / "audio" / f"speed-{s}.mp3")], check=True)
cards = [{"id": "script1", "part": 1, "title": "نص تايم كيبر", "text": text,
          "players": [{"label": "السرعة العادية", "src": "audio/speed-1.0.mp3"}, {"label": "أسرع (أقرب لعلي)", "src": "audio/speed-1.25.mp3"}],
          "questions": [{"key": "speed", "label": "أي سرعة أحسن؟", "options": [["1.0", "العادية"], ["1.25", "الأسرع"]]},
                        {"key": "ready", "label": "يصلح لفيديو حقيقي؟", "options": [["yes", "إي، يصلح"], ["almost", "قريب، يحتاج تعديل بسيط"], ["no", "لا"]]}],
          "words": [{"key": "wrong", "label": "اضغط على أي كلمة انقالت غلط"}]}]
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "أول نص تايم كيبر").replace("__KEY__", "tk-script1").replace(
    "__LEDE__", "نص قصير كتبته بالقواعد الجديدة (الإنجليزي بالإنجليزي، كتابة كويتية، بدون تشكيل زايد)، بصوت علي من الموديل الجديد، بسرعتين.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print("->", OUT)
