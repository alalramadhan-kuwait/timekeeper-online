"""Every automatic Kuwaiti/Arabic voice we have, on the same two sentences, for one blind listening page
(the user asked 2026-10-11: "create a test for them all, use two sentences"). Research only; all local except Fahed,
which is Microsoft's online voice reading our text (no Ali audio leaves the machine; VC runs here).
  ckkw         Genarabia Chatterbox_Kuwaiti cloned from Ali's ref.wav, no training
  ckkw_p0      the same + pilot 0 LoRA (step 300)
  ckkw_own     Chatterbox_Kuwaiti in its own built-in voice (not Ali: dialect reference)
  v5           Chatterbox Multilingual + our V5 LoRA (step 1800), the production text pipeline of that model
  silma        SILMA TTS v1 cloned from ref8.wav
  fahed_vc     Microsoft ar-KW Fahed, converted to Ali with Chatterbox VC (raw VC, nothing else)
Recorded Mode is not in the test: it needs a person to record each sentence.
Output: voice-src/compare/<model>/<id>.wav.  Run: HF_HUB_OFFLINE=1 /root/tkvoice/bin/python video/brand/tk_compare_all.py"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import torch
import torchaudio

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
SRC = ROOT / "voice-src"
OUT = SRC / "compare"
REF = SRC / "ref.wav"
SENT = [("u06", "عيل خلنا نطلب شوي زيادة باجر قبل لا تخلص."), ("t01", "جاسم راح البقالة وشرا عصير بطاط وطماط. شلونك شخبارك؟")]


def done(model):
    return all((OUT / model / f"{k}.wav").exists() for k, _ in SENT)


def main():
    from tk_ckkw_ali import trim
    for model, tag in (("ckkw", "base"), ("ckkw_p0", "step300")):      # already generated for pilot 0, same seed and text
        (OUT / model).mkdir(parents=True, exist_ok=True)
        for k, _ in SENT:
            shutil.copy(SRC / "pilot0/gen" / tag / f"clone-{k}.wav", OUT / model / f"{k}.wav")

    if not done("ckkw_own"):
        import re
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        (OUT / "ckkw_own").mkdir(parents=True, exist_ok=True)
        tts = ChatterboxMultilingualTTS.from_local("/root/ck-kw", "cpu")      # its own conds.pt: no reference given
        orig = tts.t3.inference
        for k, text in SENT:
            n = min(1000, 4 * len(re.sub(r"\s", "", text)) + 40)
            tts.t3.inference = lambda *a, n=n, **kw: orig(*a, **{**kw, "max_new_tokens": n})
            torch.manual_seed(0)
            wav = tts.generate(text, language_id="ar", exaggeration=0.5, cfg_weight=0.5)
            torchaudio.save(str(OUT / "ckkw_own" / f"raw-{k}.wav"), wav, tts.sr)
            trim(OUT / "ckkw_own" / f"raw-{k}.wav", OUT / "ckkw_own" / f"{k}.wav")
        del tts
        print("ckkw_own done", flush=True)

    if not done("v5"):
        from tk_voice_train import load_tts, apply_lexicon
        (OUT / "v5").mkdir(parents=True, exist_ok=True)
        os.environ.pop("TK_T3_BASE", None)
        tts = load_tts("cpu", str(SRC / "ckpt/v5/step01800.pt"))
        for k, text in SENT:
            torch.manual_seed(0)
            wav = tts.generate(apply_lexicon(text), language_id="ar", audio_prompt_path=str(REF), exaggeration=0.4, cfg_weight=0.5)
            torchaudio.save(str(OUT / "v5" / f"{k}.wav"), wav, tts.sr)
        del tts
        print("v5 done", flush=True)

    if not done("silma"):
        (OUT / "silma").mkdir(parents=True, exist_ok=True)
        subprocess.run(["/root/habibi/bin/python", str(Path(__file__).parent / "tk_silma_baseline.py"),
                        json.dumps([{"id": k, "text": t} for k, t in SENT], ensure_ascii=False)],
                       env={**os.environ, "TK_OUT": str(OUT / "silma"), "HF_HUB_OFFLINE": "1"}, check=True)
        print("silma done", flush=True)

    if not done("fahed_vc"):
        from tk_fahed_poc import TTS
        from chatterbox.vc import ChatterboxVC
        (OUT / "fahed_vc/tts").mkdir(parents=True, exist_ok=True)
        subprocess.run(["/root/habibi/bin/python", "-c", TTS, json.dumps([{"id": k, "text": t} for k, t in SENT]), str(OUT / "fahed_vc/tts")], check=True)
        vc = ChatterboxVC.from_pretrained("cpu")
        vc.set_target_voice(str(REF))
        for k, _ in SENT:
            torchaudio.save(str(OUT / "fahed_vc" / f"{k}.wav"), vc.generate(str(OUT / "fahed_vc/tts" / f"{k}.wav")), vc.sr)
        print("fahed_vc done", flush=True)


if __name__ == "__main__":
    torch.set_num_threads(4)
    main()
