"""Text-fix page for the 5 real sentences: the user's three causes of wrong words (misspellings, missing diacritics,
English written in Arabic). Each sentence's box is prefilled with Claude's proposal (English in Latin letters, diacritics
on the ambiguous words); the user corrects it. Output: voice-src/compare/page-omni-fix/.  Run: python3 build_omni_fix.py"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "video/brand"))
from tk_pilot0 import texts  # noqa: E402

OUT = ROOT / "voice-src/compare/page-omni-fix"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
T = texts()
FIX = {"JtVZPG9Jxqk-u025": [("كمبليكيتد", "complicated"), ("الكمبليكيشن", "الـ complication")],
       "TlGXbHWi-vU-u000": [("سبشيال", "special"), ("جيرارد شارلز", "Girard Charles"), ("شغلة", "شَغْلة")],
       "TlGXbHWi-vU-u008": [("سمك ما لها", "سُمك ما لها"), ("سمكها", "سُمكها"), ("صايرة", "صايْرة")]}
MARKS = {"F1-HaUKtkkQ-u010": ["مكان", "وكلة", "وكله", "كولكيوم", "بالكويت"], "JtVZPG9Jxqk-u025": ["شفناني", "ضعيفة"],
         "TlGXbHWi-vU-u000": ["اليوم"]}
cards = []
for n, k in enumerate(["1DL9LBbCuiY-u001", "F1-HaUKtkkQ-u010", "JtVZPG9Jxqk-u025", "TlGXbHWi-vU-u000", "TlGXbHWi-vU-u008"]):
    t = T[k]
    for a, b in FIX.get(k, []):
        t = t.replace(a, b)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "voice-src/compare/omni-ali" / f"{k}.wav"), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / f"{k}.mp3")], check=True)
    cards.append({"id": k, "part": 1 if n < 3 else 2, "title": f"جملة {n + 1}", "players": [{"label": "الموديل (قبل)", "src": f"audio/{k}.mp3"}],
                  "edit": {"key": "text", "value": t, "marks": MARKS.get(k, []),
                           "label": "صحّح النص: الكلمات الإنجليزية بالإنجليزي، وحط تشكيل على الكلمة اللي ممكن تنقرى غلط."},
                  "questions": [{"key": "ready", "label": "النص جاهز؟", "options": [["yes", "إي"]]}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "تصحيح النص").replace("__KEY__", "tk-omni-fix").replace(
    "__LEDE__", "صحّحت أنا اللي أقدر عليه: الكلمات الإنجليزية كتبتها بالإنجليزي، وحطيت تشكيل على سُمك وصايْرة وشَغْلة. "
                "الكلمات اللي ما أعرف صحها مكتوبة فوق كل مربع: عدّلها مثل ما قالها علي. بعدين أعيد التوليد ونقارن.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
