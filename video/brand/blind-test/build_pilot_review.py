"""Review page for the pilot dataset (DATASET-PROPOSAL.md Stage 1, assisted verification). Only the clips
tk_pilot_draft.py picked for listening: flagged ones, all B-music, and a random 20% audit of the rest. Each card: Ali's
real clip, the draft transcript to edit, the words worth a closer listen, and three taps (text, complete sentence,
only Ali and clean). 3 clips a page. Batches of 15 (the user found 152 at once too many): A clips first, easiest (fewest marked words) first,
then B-music. Output: voice-src/pilot/review/b<N>/.  Run: python3 build_pilot_review.py <batch number, from 1>"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "voice-src/pilot"
BATCH, SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 1, 15
OUT = SRC / "review" / f"b{BATCH}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)
D = json.loads((SRC / "drafts.json").read_text())
order = sorted([c for c in D["clips"] if c["review"]], key=lambda c: (c["tier"] != "A", len(c["marks"]) / max(1, len(c["draft"].split())), c["id"]))
# answers already collected (review/answers.json, merged from each batch's page): a clip left unanswered goes into the next batch
ANS = json.loads((SRC / "review" / "answers.json").read_text()) if (SRC / "review" / "answers.json").exists() else {}
done = {k for k, a in ANS.items() if a.get("text_ok") and a.get("clip")}
todo = [c for c in order if c["id"] not in done]
batch = todo[:SIZE]
left = -(-len(todo) // SIZE)
(SRC / "review" / f"b{BATCH}.json").write_text(json.dumps([c["id"] for c in batch]))
cards = []
for c in batch:
    name = f"{c['id']}.mp3"
    if not (OUT / "audio" / name).exists():
        old = next((p for p in (SRC / "review").glob(f"*/audio/{name}") if p.parent.parent != OUT), None)
        if old:
            subprocess.run(["cp", str(old), str(OUT / "audio" / name)], check=True)
        else:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / "clips" / f"{c['id']}.wav"), "-ac", "1", "-b:a", "80k", str(OUT / "audio" / name)], check=True)
    toks = c["draft"].split()
    n = len(cards)
    cards.append({"id": c["id"], "part": n // 3 + 1, "title": f"مقطع {n + 1}", "players": [{"label": "علي", "src": f"audio/{name}"}],
                  "edit": {"key": "text", "value": ANS.get(c["id"], {}).get("text") or c["draft"], "marks": [toks[i] for i in c["marks"] if i < len(toks)],
                           "label": "إذا فيه غلط، عدّل النص هني (ق حتى لو قالها گ. الأرقام خلها أرقام، أنا أحولها)."},
                  "questions": [{"key": "text_ok", "label": "النص؟", "options": [["yes", "صح"], ["fixed", "عدّلته"], ["unsure", "مو متأكد"]]},
                                {"key": "clip", "label": "المقطع؟", "options": [["ok", "سليم"], ["cut", "مقطوع"], ["noise", "فيه صوت ثاني أو موسيقى"]]}]})
page = (Path(__file__).parent / "listen-template.html").read_text()
page = page.replace("__TITLE__", f"مقاطع علي، دفعة {BATCH}").replace("__KEY__", f"tk-pilot-review-b{BATCH}").replace(
    "__LEDE__", f"دفعة {BATCH} (باقي {left} دفعات مع هذي): {len(cards)} مقاطع حقيقية من حلقات علي، ومعاها نص كتبته أنا. "
                f"اسمع، وإذا النص صح ضغطتين وخلصت: «صح» و«سليم». إذا فيه غلط عدّله بالمربع.")
(OUT / "index.html").write_text(page.replace("__CARDS__", json.dumps(cards, ensure_ascii=False)))
print(left, "batches left;", len(cards), "cards,", cards[-1]["part"] if cards else 0, "pages ->", OUT)
