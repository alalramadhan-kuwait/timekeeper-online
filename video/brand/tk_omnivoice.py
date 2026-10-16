"""OmniVoice (k2-fsa/OmniVoice, the default engine of VoiceStudio; model CC-BY-NC, research only) on the two comparison
sentences of tk_compare_all.py, cloned from Ali's 7.5 s reference (voice-src/ref8.wav + ref8.txt), language Gulf
Arabic (afb). Local inference on CPU; nothing is uploaded. Weights in /root/omnivoice-w, venv /root/omni (reuses
tkvoice's torch through a .pth, its own transformers 5.20).
Output: voice-src/compare/omnivoice/<id>.wav.  Run: HF_HUB_OFFLINE=1 /root/omni/bin/python video/brand/tk_omnivoice.py [--full]   (--full: the 11 test sentences -> voice-src/compare/omni11/)"""
import sys
from pathlib import Path

import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
SENT = [("u06", "عيل خلنا نطلب شوي زيادة باجر قبل لا تخلص."), ("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
OUT = ROOT / "voice-src/compare/omnivoice"
if "--ali" in sys.argv:    # Ali's own verified sentences (real Kuwaiti text), to hear the model next to Ali saying the same words
    sys.path.insert(0, str(ROOT / "video/brand"))
    from tk_pilot0 import texts
    T = texts()
    SENT = [(k, T[k]) for k in ["1DL9LBbCuiY-u001", "TlGXbHWi-vU-u008", "JtVZPG9Jxqk-u025", "F1-HaUKtkkQ-u010", "TlGXbHWi-vU-u000"]]
    OUT = ROOT / "voice-src/compare/omni-ali"
if "--full" in sys.argv:   # the 11-sentence test set of pilot 0 (ckkw-unseen-10 + the user's sentence)
    import json
    SENT = [(it["id"], it["text"]) for it in json.loads((ROOT / "video/brand/voice-data/ckkw-unseen-10.json").read_text())["items"]] + \
           [("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]
    OUT = ROOT / "voice-src/compare/omni11"

if __name__ == "__main__":
    from omnivoice import OmniVoice
    torch.set_num_threads(4)
    OUT.mkdir(parents=True, exist_ok=True)
    m = OmniVoice.from_pretrained("/root/omnivoice-w", device_map="cpu", dtype=torch.float32)
    print("afb supported:", "afb" in m.supported_language_ids(), flush=True)
    ref, ref_text = str(ROOT / "voice-src/ref8.wav"), (ROOT / "voice-src/ref8.txt").read_text().strip()
    for k, text in SENT:
        torch.manual_seed(0)
        audio = m.generate(text=text, language="afb", ref_audio=ref, ref_text=ref_text)
        sf.write(OUT / f"{k}.wav", audio[0], 24000)
        print(k, round(len(audio[0]) / 24000, 1), "s", flush=True)
