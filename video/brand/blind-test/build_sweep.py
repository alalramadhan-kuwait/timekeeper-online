"""Blind page for an inference sweep: one paragraph, every render shuffled under a letter.
Usage: python3 build_sweep.py <sweep dir name, e.g. exag>
Key (letter -> render) stays in voice-src/sweep/<dir>/blind-key.json.
"""
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
D = ROOT / "voice-src/sweep" / sys.argv[1]
OUT = D / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tk_voice_sweep import PARAGRAPH  # noqa: E402

renders = sorted(p.stem for p in D.glob("*.wav"))
random.Random(f"sweep-{sys.argv[1]}").shuffle(renders)
letters = "أبتثجحخدذرزسشصضطظعغف"
key, opts = {}, []
for i, name in enumerate(renders):
    lab = letters[i]
    key[lab] = name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(D / f"{name}.wav"), "-ac", "1", "-b:a", "96k",
                    str(OUT / "audio" / f"v{i:02d}.mp3")], check=True)
    opts.append({"label": lab, "src": f"audio/v{i:02d}.mp3"})
(D / "blind-key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
items = [{"id": "para", "n": 1, "sec": "sweep", "text": PARAGRAPH, "opts": opts}]
t = (Path(__file__).parent / "template.html").read_text()
t = t.replace('const SCALES = [["voice","الصوت"],["clarity","الوضوح"],["pron","النطق"],["kw","كويتي"],["prosody","النغمة والإيقاع"]];',
              'const SCALES = [["prosody","النغمة والإيقاع"],["pron","النطق"],["voice","يشبهني"],["reel","أستخدمه بريل؟"]];')
t = t.replace("<title>اختبار صوت علي</title>", "<title>إعدادات الصوت</title>")
t = t.replace("<h1>اختبار صوت علي</h1>", "<h1>نفس الفقرة، إعدادات مختلفة</h1>")
t = t.replace('كل جملة لها ثلاث نسخ (س، ص، ع)، والترتيب يتغير من جملة لجملة. ما تدري أي نسخة هي القديمة وأي وحدة الجديدة. اسمعها كلها، وقيّم كل وحدة من 1 إلى 5، واختار الأحسن.',
              f'نفس الفقرة بـ {len(renders)} نسخ مخلوطة بدون أسماء. اسمعها، وقيّم كل نسخة من 1 إلى 5 على النغمة والإيقاع (طلوع ونزول، ضغط على الكلمات، وقفات، إحساس القصة)، والنطق، والشبه بصوتك، وهل تستخدمها بريل. وبعدين اختار الأحسن.')
(OUT / "index.html").write_text(t.replace("__ITEMS__", json.dumps(items, ensure_ascii=False)))
print(len(renders), "renders ->", OUT)
