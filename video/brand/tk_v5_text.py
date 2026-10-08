"""Dataset V5 (2026-10-08): the v4 clips, audio, features and split, with corrected text supervision only.

  1. Whisper wrote some of Ali's g as غ: those words get their real spelling (الأرغام -> الأرقام ...).
  2. Whisper wrote «شلون» as «شون» (all 10 instances mean "how"; Ali flagged it).
  3. The 9 comparison sentences (final split) take the text Ali corrected by ear.
  4. Ali's pronunciation dictionary (voice-data/kw-pron-dict.json) is applied, VERIFIED entries only.
Writes voice-src/dataset-v5/ (metadata.csv + feats.pt via retext, fixes.json NOT re-applied) and changes.json.
Run with /root/tkvoice/bin/python.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import AR, SRC, kw_convention, retext  # noqa: E402

GH_FOR_G = {  # Whisper's غ for Ali's g; the real word (its ق is then up to the dictionary)
    "الأرغام": "الأرقام", "أرغام": "أرقام", "تغريبا": "تقريبا", "تغديم": "تقديم", "الرغمية": "الرقمية",
    "نغدر": "نقدر", "يغدمونها": "يقدمونها", "غرروا": "قرروا", "غدموه": "قدموه", "مغاومة": "مقاومة",
    "غصدي": "قصدي", "غليل": "قليل",
}
WORDS = {**GH_FOR_G, "شون": "شلون"}


def fix_words(text):
    def one(m):
        w = m.group(0)
        bare = re.sub(rf"[^{AR}]", "", w)
        return w.replace(bare, WORDS[bare]) if bare in WORDS else w
    return re.sub(rf"[{AR}ً-ْ]+", one, text)


def main():
    rows = [l.split("|") for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l]
    by_ear = {l["id"]: l["text"] for l in json.loads((SRC / "refcmp/lines.json").read_text()) if "orig" in l}
    out, changes = [], []
    for cid, text, split in rows:
        new = by_ear.get(cid, text)
        new = kw_convention(fix_words(new))
        if new != text:
            changes.append({"clip": cid, "split": split, "old": text, "new": new})
        out.append(f"{cid}|{new}|{split}")
    d = SRC / "dataset-v5"
    d.mkdir(exist_ok=True)
    (d / "metadata-src.csv").write_text("\n".join(out) + "\n")
    (d / "changes.json").write_text(json.dumps(changes, ensure_ascii=False, indent=1))
    retext("dataset-v4", "../dataset-v5/metadata-src.csv", "dataset-v5", fixes_on=False)
    print(len(changes), "clips changed;", sum(c["split"] == "train" for c in changes), "in train")


if __name__ == "__main__":
    main()
