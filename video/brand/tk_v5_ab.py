"""The v4-vs-V5 blind test (2026-10-08, widened to all 30 sealed sentences in parts of 3 at the reviewer's request) (kw-pron-test.json, unedited), production
setup (Test B): v4 reads the plain line, V5 reads kw_convention(plain) from the dictionary. Same prompt, seed 0,
exaggeration 0.4, cfg 0.5, end pause «…». Blind page with one hidden mapping (أ/ب fixed for the 3 lines).
Usage: tk_v5_ab.py <v5 ckpt>   -> voice-src/v5ab/{v4,v5}/<id>.wav, page/, key.json
"""
import json
import random
import re
import subprocess
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, kw_convention, load_tts  # noqa: E402

IDS = [l["id"] for l in json.loads((Path(__file__).parent / "voice-data/kw-pron-test.json").read_text())["lines"]]  # all 30
D = SRC / "v5ab"
sealed = {l["id"]: l for l in json.loads((Path(__file__).parent / "voice-data/kw-pron-test.json").read_text())["lines"]}
end = lambda t: t if re.search(r"[؟?]\s*$", t) else re.sub(r"[.…]*\s*$", "", t.rstrip()) + "…"
torch.set_num_threads(4)
texts = {}
SOLO = "--solo" in sys.argv   # Ali (2026-10-08): the old models are not good enough to compare against; judge V5 on its own
MODELS = (("v5", sys.argv[1], True),) if SOLO else (("v4", str(SRC / "ckpt/v4/step02250.pt"), False), ("v5", sys.argv[1], True))
for model, ckpt, conv in MODELS:
    (D / model).mkdir(parents=True, exist_ok=True)
    tts = load_tts("cpu", ckpt)
    tts.prepare_conditionals(str(SRC / "ref.wav"))
    for k in IDS:
        t = end(kw_convention(sealed[k]["plain"]) if conv else sealed[k]["plain"])
        texts[f"{model}/{k}"] = t
        if (D / model / f"{k}.wav").exists():
            continue
        torch.manual_seed(0)
        w = tts.generate(t, language_id="ar", exaggeration=0.4, cfg_weight=0.5)
        torchaudio.save(str(D / model / f"{k}.wav"), w, tts.sr)
        print(model, k, t, flush=True)
        if conv and t != end(sealed[k]["plain"]):     # controlled extra: V5 on the plain line too (analysis only)
            torch.manual_seed(0)
            w = tts.generate(end(sealed[k]["plain"]), language_id="ar", exaggeration=0.4, cfg_weight=0.5)
            (D / "v5-plain").mkdir(exist_ok=True)
            torchaudio.save(str(D / "v5-plain" / f"{k}.wav"), w, tts.sr)
    del tts
order = ["v5"] if SOLO else ["v4", "v5"]
random.SystemRandom().shuffle(order)
(D / "page/audio").mkdir(parents=True, exist_ok=True)
items = []
for n, k in enumerate(IDS, 1):
    opts = []
    for i, m in enumerate(order):
        name = f"{k}-{i}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(D / m / f"{k}.wav"), "-ac", "1", "-b:a", "96k",
                        str(D / "page/audio" / name)], check=True)
        opts.append({"label": "أب"[i], "src": f"audio/{name}"})
    items.append({"id": k, "n": n, "text": sealed[k]["plain"], "ref": None, "opts": opts})
(D / "key.json").write_text(json.dumps({**{"أب"[i]: m for i, m in enumerate(order)}, "v5_ckpt": sys.argv[1], "texts": texts},
                                       ensure_ascii=False, indent=1))
page = (Path(__file__).parent / "blind-test/refcmp-template.html").read_text()
page = page.replace("<h1>نفس الجملة، كذا نسخة</h1>", "<h1>القديم ولا الجديد؟</h1>")
page = page.replace("فوق كل جملة تسجيلك الحقيقي، وهو المرجع. تحته صوتين", "جمل جديدة ما سجلتها أنت. كل جملة فيها صوتين")
if SOLO:
    page = page.replace("<h1>القديم ولا الجديد؟</h1>", "<h1>الموديل الجديد</h1>")
    page = page.replace("جمل جديدة ما سجلتها أنت. كل جملة فيها صوتين: <b>أ</b> و<b>ب</b>. في هالجلسة كلها «أ» نفس الموديل و«ب» نفس الموديل، بس ما تدري أي واحد. لكل جملة: اختار أي وحدة أقرب لنطقك، واضغط على الكلمات اللي انقالت غلط إذا تبي. وفي الآخر اكتب انطباعك عن «أ» و«ب».",
                        "جمل جديدة ما سجلتها أنت، بصوت الموديل الجديد. لكل جملة: قيّم النطق الكويتي، واضغط على الكلمات اللي انقالت غلط. وفي الآخر اكتب انطباعك.")
    page = page.replace('[...it.opts.map(o => [o.label, o.label]), ["same", "نفس الشي"]]', '[["good", "زين"], ["ok", "مقبول"], ["bad", "مو زين"]]')
    page = page.replace('ql.textContent = "أي وحدة أقرب لنطقك؟"', 'ql.textContent = "النطق الكويتي؟"')
    page = page.replace('nl.textContent = "انطباعك عن «أ» و«ب» (اللهجة، الوقفات، أي شي):"', 'nl.textContent = "انطباعك (النطق، الشبه بصوتك، الوقفات، أي شي):"')
(D / "page/index.html").write_text(page.replace("__ITEMS__", json.dumps(items, ensure_ascii=False)))
print("page ->", D / "page")
