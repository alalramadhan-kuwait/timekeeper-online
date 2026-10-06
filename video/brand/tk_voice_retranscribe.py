"""Re-transcribe dataset clips with a Kuwaiti prompt so Whisper spells the way Ali speaks
(وايد، شلون، چذي، يبي) instead of drifting to MSA (بدنا نتحدث، شيء، يأخذ). Writes <dataset>/metadata-kw.csv."""
import subprocess
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

PROMPT = ("مساكم الله بالخير. اليوم بنتكلم عن ساعة وايد حلوة. شلون؟ خلني أقول لكم شنو صار. "
          "چذي كانت البداية، وباچر نكمل السالفة. هالساعة ستيل، والكاليبر أوتوماتيك، والكرونوغراف ممتاز. "
          "رولكس، تودور، أوديمار بيغيه، باتيك فيليب، أوميغا، كارتييه. ما أبي أطول عليكم، يعطيكم العافية.")

data = Path(sys.argv[1])
model = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "large-v3-turbo", device="cpu", compute_type="int8")
rows = [r.split("|") for r in (data / "metadata.csv").read_text().splitlines() if r]
done = {}
out_path = data / "metadata-kw.csv"
if out_path.exists():
    done = {r.split("|")[0]: r for r in out_path.read_text().splitlines() if r}
with out_path.open("a") as out:
    for i, (cid, old, split) in enumerate(rows):
        if cid in done:
            continue
        wav = data / "wavs" / f"{cid}.wav"
        if not wav.exists():                           # Tudor clips live in the first dataset
            wav = data.parent / "dataset" / "wavs" / f"{cid}.wav"
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
        segs, _ = model.transcribe(np.frombuffer(pcm, np.float32), language="ar", beam_size=5,
                                   initial_prompt=PROMPT, condition_on_previous_text=False)
        new = " ".join(s.text.strip() for s in segs).strip() or old
        out.write(f"{cid}|{new}|{split}\n"); out.flush()
        if i % 25 == 0:
            print(i, cid, "\n  old:", old[:90], "\n  new:", new[:90], flush=True)
print("done", out_path)
