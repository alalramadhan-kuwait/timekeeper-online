"""One V5 listening page of 3 sealed sentences (Ali: "send me 3 each time"). Uses V5's renders in voice-src/v5ab/v5.
Usage: tk_v5_part.py <part 1-10>   -> voice-src/v5ab/part<N>/
"""
import json
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "voice-src"
N = int(sys.argv[1])
D = SRC / "v5ab"
OUT = D / f"part{N}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
lines = json.loads((Path(__file__).parent / "voice-data/kw-pron-test.json").read_text())["lines"][(N - 1) * 3: N * 3]
items = []
for i, l in enumerate(lines, (N - 1) * 3 + 1):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(D / "v5" / f"{l['id']}.wav"), "-ac", "1", "-b:a", "96k",
                    str(OUT / "audio" / f"{l['id']}.mp3")], check=True)
    items.append({"id": l["id"], "n": i, "text": l["plain"], "ref": None,
                  "opts": [{"label": "▶", "src": f"audio/{l['id']}.mp3"}]})
page = (Path(__file__).parent / "blind-test/refcmp-template.html").read_text()
page = page.replace("<h1>نفس الجملة، كذا نسخة</h1>", f"<h1>الموديل الجديد: الجزء {N}</h1>")
page = page.replace(
    "فوق كل جملة تسجيلك الحقيقي، وهو المرجع. تحته صوتين: <b>أ</b> و<b>ب</b>. في هالجلسة كلها «أ» نفس الموديل و«ب» نفس الموديل، بس ما تدري أي واحد. لكل جملة: اختار أي وحدة أقرب لنطقك، واضغط على الكلمات اللي انقالت غلط إذا تبي. وفي الآخر اكتب انطباعك عن «أ» و«ب».",
    "٣ جمل جديدة ما سجلتها أنت، بصوت الموديل الجديد. لكل جملة: قيّم النطق الكويتي، واضغط على الكلمات اللي انقالت غلط. وفي الآخر اكتب انطباعك.")
page = page.replace('[...it.opts.map(o => [o.label, o.label]), ["same", "نفس الشي"]]', '[["good", "زين"], ["ok", "مقبول"], ["bad", "مو زين"]]')
page = page.replace('ql.textContent = "أي وحدة أقرب لنطقك؟"', 'ql.textContent = "النطق الكويتي؟"')
page = page.replace('nl.textContent = "انطباعك عن «أ» و«ب» (اللهجة، الوقفات، أي شي):"', 'nl.textContent = "انطباعك (النطق، الشبه بصوتك، الوقفات، أي شي):"')
page = page.replace('"tkvoice-refcmp"', f'"tkvoice-v5part{N}"')
assert "النطق الكويتي؟" in page and "٣ جمل جديدة" in page
(OUT / "index.html").write_text(page.replace("__ITEMS__", json.dumps(items, ensure_ascii=False)))
print(OUT, [l["id"] for l in lines])
