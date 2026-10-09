"""Does the training set keep Ali's prosodic variety, or did the cleanliness filters select flat speech?

For every screened clip (voice-src/screen.json): pitch range, F0 spread, phrase-final slope, pauses, energy
spread, speaking rate, plus text cues (question words, ؟). Groups: train (dataset-v4), held-out (val/final),
dropped by the filters. Writes voice-src/prosody/audit.json and prints a summary.
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC  # noqa: E402
from tk_prosody import features  # noqa: E402

QWORDS = re.compile(r"(^|\s)(شنو|ليش|شلون|منو|وين|متى|كم|هل|شكثر|ليه)(\s|$)|[؟?]")
screen = json.loads((SRC / "screen.json").read_text())
split = {l.split("|")[0]: l.split("|")[2] for l in (SRC / "dataset-v4/metadata.csv").read_text().splitlines() if l}
tmp = Path(tempfile.mkdtemp())
rows = []
for r in screen:
    group = {"train": "train", "val": "heldout", "final": "heldout"}.get(split.get(r["id"]), "dropped")
    wav = tmp / "c.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(r["start"]), "-to", str(r["end"]), "-i", str(SRC / r["src"]),
                    "-ac", "1", "-ar", "16000", str(wav)], check=True)
    try:
        f = features(wav, r["text"])
    except Exception:
        continue
    f.update({"id": r["id"], "group": group, "question_cue": bool(QWORDS.search(r["text"])), "sim": r["sim"]})
    rows.append(f)
(SRC / "prosody").mkdir(exist_ok=True)
(SRC / "prosody/audit.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))

keys = ["range_st", "f0_sd_st", "final_slope_st_s", "pauses", "energy_sd_db", "rate_chars_s"]
print(f"{'group':8s} {'n':>4s} " + " ".join(f"{k:>16s}" for k in keys) + "  rising_final%  question_cue%")
for g in ("train", "heldout", "dropped"):
    G = [r for r in rows if r["group"] == g]
    if not G:
        continue
    med = [np.nanmedian([r[k] for r in G]) for k in keys]
    p90 = [np.nanpercentile([r[k] for r in G], 90) for k in keys]
    rising = 100 * np.mean([r["final_slope_st_s"] > 4 for r in G if not np.isnan(r["final_slope_st_s"])])
    q = 100 * np.mean([r["question_cue"] for r in G])
    print(f"{g:8s} {len(G):4d} " + " ".join(f"{m:7.2f} (p90 {p:5.1f})" for m, p in zip(med, p90)) + f"  {rising:12.1f}  {q:12.1f}")
