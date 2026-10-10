"""Review page for the pilot dataset (DATASET-PROPOSAL.md Stage 1, assisted verification). Only the clips
tk_pilot_draft.py picked for listening: flagged ones, all B-music, and a random 20% audit of the rest. Each card: Ali's
real clip, the draft transcript to edit, the words worth a closer listen, and three taps (text, complete sentence,
only Ali and clean). 3 clips a page. Output: voice-src/pilot/review/.  Run: python3 build_pilot_review.py"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/pilot"
OUT = SRC / "review"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
D = json.loads((SRC / "drafts.json").read_text())
cards = []
for c in [c for c in D["clips"] if c["review"]]:
    name = f"{c['id']}.mp3"
    if not (OUT / "audio" / name).exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / "clips" / f"{c['id']}.wav"), "-ac", "1", "-b:a", "80k", str(OUT / "audio" / name)], check=True)
    toks = c["draft"].split()
    n = len(cards)
    cards.append({"id": c["id"], "part": n // 3 + 1, "title": f"مقطع {n + 1}", "players": [{"label": "علي", "src": f"audio/{name}"}],
                  "edit": {"key": "text", "value": c["draft"], "marks": [toks[i] for i in c["marks"] if i < len(toks)],
                           "label": "النص: عدّله بحيث يطابق كلام علي بالضبط. اكتب ق لما يقولها گ، والأرقام بالكلمات."},
                  "questions": [{"key": "text_ok", "label": "النص؟", "options": [["yes", "صح مثل ما هو"], ["fixed", "عدّلته وصار صح"], ["unsure", "مو متأكد"]]},
                                {"key": "complete", "label": "الجملة كاملة؟", "options": [["yes", "إي"], ["no", "لا، مقطوعة"]]},
                                {"key": "clean", "label": "علي بروحه وصوت نظيف؟", "options": [["yes", "إي"], ["no", "لا"]]}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", "مراجعة مقاطع علي").replace("__KEY__", "tk-pilot-review").replace(
    "__LEDE__", f"هذي مقاطع حقيقية من حلقات علي، ومعاها نص كتبته أنا كمسودة. اسمع، وعدّل النص إذا فيه غلط، وجاوب ثلاث أسئلة. "
                f"{len(cards)} مقطع، كل صفحة 3. تقدر تخلصها على كذا جلسة، وإجاباتك تنحفظ.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(len(cards), "cards,", cards[-1]["part"] if cards else 0, "pages ->", OUT)
