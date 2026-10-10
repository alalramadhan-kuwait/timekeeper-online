"""Zero-training test (research only, user-approved 2026-10-10): Kuwaiti pronunciation from Genarabia-ai/Chatterbox_Kuwaiti
+ Ali's identity. Everything runs locally; Ali's reference never leaves this machine.
  clone  the checkpoint itself cloned from voice-src/ref.wav (Ali's verified reference)
  vc     the checkpoint's own built-in voice (voice-src/ck-kw-test/kw-*.wav) converted to Ali with Chatterbox VC
Plus a spelling test in the clone route: the same sentence written three ways (ق/گ/ج, ك/چ/تش, plain/diacritised),
to see which spelling the checkpoint reads as Kuwaiti.
The checkpoint often fails to stop: generation is capped at about 4 speech tokens per letter and trailing silence is
trimmed. Output: voice-src/ck-kw-ali/ (not in git).  Run: /root/tkvoice/bin/python video/brand/tk_ckkw_ali.py"""
import json, re, subprocess, time
from pathlib import Path
import torch, torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / "voice-src/ck-kw-ali"; REF = ROOT / "voice-src/ref.wav"
BASE = [(it["id"], it["input"]) for it in json.loads((ROOT / "voice-src/silma-baseline/log.json").read_text())["items"]]
SPELL = [("sp1-q", "الوكيل قال لي إن الطلب يتأخر شوي."), ("sp1-g", "الوكيل گال لي إن الطلب يتأخر شوي."),
         ("sp1-j", "الوكيل جال لي إن الطلب يتأخر شوي."),
         ("sp2-k", "كم ساعة عندك بالمحل؟"), ("sp2-ch", "چم ساعة عندك بالمحل؟"), ("sp2-tsh", "تشم ساعة عندك بالمحل؟"),
         ("sp3-q", "قاعد أدور على ساعة رياضية."), ("sp3-g", "گاعد أدور على ساعة رياضية."),
         ("sp3-gd", "گاعد أدُوْر على ساعة رياضيّة.")]


def trim(src, dst):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af",
                    "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse", str(dst)], check=True)


def main():
    tts = ChatterboxMultilingualTTS.from_local("/root/ck-kw", "cpu")
    orig = tts.t3.inference
    cap = {"n": 1000}
    def capped(*a, **k):
        k["max_new_tokens"] = cap["n"]; return orig(*a, **k)
    tts.t3.inference = capped
    tts.prepare_conditionals(str(REF), exaggeration=0.5)
    for sid, text in BASE + SPELL:
        cap["n"] = min(1000, 4 * len(re.sub(r"\s", "", text)) + 40)
        torch.manual_seed(0); t = time.time()
        try:
            wav = tts.generate(text, language_id="ar", exaggeration=0.5, cfg_weight=0.5)
        except Exception as e:
            print("clone", sid, "CRASH", type(e).__name__, flush=True); continue
        torchaudio.save(str(OUT / f"raw-clone-{sid}.wav"), wav, tts.sr)
        trim(OUT / f"raw-clone-{sid}.wav", OUT / f"clone-{sid}.wav")
        print("clone", sid, f"{time.time()-t:.0f}s", flush=True)
    del tts
    from chatterbox.vc import ChatterboxVC
    vc = ChatterboxVC.from_pretrained("cpu"); vc.set_target_voice(str(REF))
    for sid, _ in BASE:
        src = ROOT / f"voice-src/ck-kw-test/kw-{sid}.wav"
        if not src.exists():
            print("vc", sid, "no source (crashed earlier)", flush=True); continue
        trim(src, OUT / f"src-{sid}.wav")
        torchaudio.save(str(OUT / f"vc-{sid}.wav"), vc.generate(str(OUT / f"src-{sid}.wav")), vc.sr)
        print("vc", sid, flush=True)


if __name__ == "__main__":
    main()
