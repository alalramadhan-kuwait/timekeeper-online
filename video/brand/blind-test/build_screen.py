"""Listening page for the screening run (voice-data/screen-9.json, arm A1 Fahed). 3 pages of 3 sentences.
Per sentence: for the «اسأل محمد» lines first a blind A/B against the recorded-mode benchmark (before Fahed is heard on the
card), then Fahed raw (mark wrong words) -> final in Ali's voice (is it Ali? words broken by conversion) -> raw VC vs
final (does the post chain help?). One hidden A/B mapping for the whole session
(SystemRandom). Key: voice-src/screen/page-key.json.
Output: voice-src/screen/page/ (index.html + audio/, and screen-fahed.html with the audio inlined, sent to the user
directly: the page holds Ali's voice and is not published as an artifact).  Run: python3 build_screen.py
"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = json.loads((ROOT / "video/brand/voice-data/screen-9.json").read_text())
RUN = ROOT / "voice-src/screen/fahed"
OUT = ROOT / "voice-src/screen/page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)


def mp3(src, name):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
    return f"audio/{name}"


fahed_is_a = random.SystemRandom().random() < 0.5
items = []
for n, it in enumerate(SPEC["items"], 1):
    k = it["id"]
    a = {"tts": mp3(RUN / "tts" / f"{k}.wav", f"{n:02d}-1.mp3"), "vc": mp3(RUN / "vc" / f"{k}.wav", f"{n:02d}-2.mp3"),
         "final": mp3(RUN / "final" / f"{k}.wav", f"{n:02d}-3.mp3")}
    row = {"id": k, "n": n, "part": (n - 1) // 3 + 1, "text": it["text"], "audio": a}
    bf = it["bench_files"]
    if "ali" in bf:
        a["ref"] = mp3(ROOT / bf["ali"], f"{n:02d}-r.mp3")
        row["refLabel"] = "علي الحقيقي"
    if "final" in bf:
        bench = mp3(ROOT / bf["final"], f"{n:02d}-x.mp3")
        a["a"], a["b"] = (a["final"], bench) if fahed_is_a else (bench, a["final"])
    items.append(row)
(ROOT / "voice-src/screen/page-key.json").write_text(json.dumps(
    {"A": "fahed final" if fahed_is_a else "recorded mode final", "B": "recorded mode final" if fahed_is_a else "fahed final"}, indent=1))
page = (Path(__file__).parent / "screen-template.html").read_text()
(OUT / "index.html").write_text(page.replace("__ITEMS__", json.dumps(items, ensure_ascii=False)))
print(len(items), "sentences ->", OUT)

# one self-contained file (audio inlined) to send straight to the user: the page holds Ali's voice, so it is not published
import base64  # noqa: E402
single = (OUT / "index.html").read_text()
for f in sorted((OUT / "audio").iterdir()):
    single = single.replace(f'"audio/{f.name}"', '"data:audio/mpeg;base64,' + base64.b64encode(f.read_bytes()).decode() + '"')
(OUT / "screen-fahed.html").write_text("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">\n" + single)
print("single file:", OUT / "screen-fahed.html")
