"""Listening page for the zero-training test of Chatterbox_Kuwaiti + Ali (tk_ckkw_ali.py). Private, research only.
Pages 1-2: the six sentences, two versions in Ali's voice (clone vs built-in voice -> VC) under letters fixed for the
session (one hidden SystemRandom mapping, key in voice-src/ck-kw-ali/page-key.json), plus the checkpoint's own voice as a
labelled dialect reference. Page 3: the spelling test, the same sentence in three spellings.
Output: voice-src/ck-kw-ali/page/ (index.html + audio/).  Run: python3 build_ckkw_page.py"""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/ck-kw-ali"
OUT = SRC / "page"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
BASE = [(it["id"], it["input"]) for it in json.loads((ROOT / "voice-src/silma-baseline/log.json").read_text())["items"]]
SPELL = [("sp1", [("q", "الوكيل قال لي إن الطلب يتأخر شوي."), ("g", "الوكيل گال لي إن الطلب يتأخر شوي."), ("j", "الوكيل جال لي إن الطلب يتأخر شوي.")]),
         ("sp2", [("k", "كم ساعة عندك بالمحل؟"), ("ch", "چم ساعة عندك بالمحل؟"), ("tsh", "تشم ساعة عندك بالمحل؟")]),
         ("sp3", [("q", "قاعد أدور على ساعة رياضية."), ("g", "گاعد أدور على ساعة رياضية."), ("gd", "گاعد أدُوْر على ساعة رياضيّة.")])]
KEY = SRC / "page-key.json"
clone_is_a = json.loads(KEY.read_text())["A"] == "clone" if KEY.exists() else random.SystemRandom().random() < 0.5
KEY.write_text(json.dumps({"A": "clone" if clone_is_a else "vc", "B": "vc" if clone_is_a else "clone"}))
YES = [["yes", "إي"], ["no", "لا"]]
DIAL = [["kw", "كويتية"], ["near", "قريبة"], ["no", "مو كويتية"]]


def mp3(src, name):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-b:a", "96k", str(OUT / "audio" / name)], check=True)
    return f"audio/{name}"


cards = []
for n, (sid, text) in enumerate(BASE, 1):
    clone, vc = SRC / f"clone-{sid}.wav", SRC / f"vc-{sid}.wav"
    vers = [v for v in ((clone_is_a and clone) or vc, (clone_is_a and vc) or clone) if v.exists()]
    if not vers:
        continue
    names = ["أ", "ب"] if len(vers) == 2 else ["صوت علي"]     # one version only: no letter, so the mapping is not implied
    players = [{"label": names[i], "src": mp3(v, f"{sid}-{i}.mp3")} for i, v in enumerate(vers)]
    own = ROOT / f"voice-src/ck-kw-test/ckkw-{n}.m4a"
    if own.exists():
        players.append({"label": "صوت الموديل نفسه", "src": mp3(own, f"{sid}-own.mp3"), "ref": True, "text": "مرجع للهجة بس، مو صوت علي"})
    one = len(vers) == 1
    qs = [{"key": "ali_a", "label": "يبين صوت علي؟" if one else "أ يبين صوت علي؟", "options": YES},
          {"key": "dial_a", "label": "اللهجة؟" if one else "لهجة أ؟", "options": DIAL}]
    if len(vers) == 2:
        qs += [{"key": "ali_b", "label": "ب يبين صوت علي؟", "options": YES}, {"key": "dial_b", "label": "لهجة ب؟", "options": DIAL},
               {"key": "better", "label": "أيهم أحسن؟", "options": [["A", "أ"], ["B", "ب"], ["same", "نفس الشي"]]}]
    cards.append({"id": sid, "part": 1 if n <= 3 else 2, "title": f"جملة {n}", "text": text, "players": players, "questions": qs})
for gid, variants in SPELL:
    players = [{"label": f"كتابة {i}", "src": mp3(SRC / f"clone-{gid}-{tag}.wav", f"{gid}-{tag}.mp3"), "text": t}
               for i, (tag, t) in enumerate(variants, 1) if (SRC / f"clone-{gid}-{tag}.wav").exists()]
    cards.append({"id": gid, "part": 3, "title": "نفس الجملة بثلاث كتابات (كلها بصوت علي)", "players": players,
                  "questions": [{"key": "best", "label": "أي كتابة نطقها كويتي أكثر؟", "options": [["1", "١"], ["2", "٢"], ["3", "٣"], ["same", "كلها نفس"]]},
                                {"key": "ali", "label": "يبين صوت علي؟", "options": YES}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "كويتي بصوت علي").replace("__KEY__", "tk-ckkw-ali").replace(
    "__LEDE__", "موديل كويتي جاهز، ونحط عليه صوت علي بطريقتين، بدون أي تدريب. صفحة 1 و2: الجملة بنسختين، أ و ب، وتحتهم صوت الموديل نفسه كمرجع للهجة. صفحة 3: نفس الجملة مكتوبة بثلاث طرق.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards ->", OUT)
