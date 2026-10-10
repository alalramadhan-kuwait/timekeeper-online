"""Zero-training test (research only, user-approved 2026-10-10): Kuwaiti pronunciation from Genarabia-ai/Chatterbox_Kuwaiti
+ Ali's identity. Everything runs locally; Ali's reference never leaves this machine.
  clone  the checkpoint itself cloned from voice-src/ref.wav (Ali's verified reference)
  vc     the checkpoint's own built-in voice (voice-src/ck-kw-test/kw-*.wav) converted to Ali with Chatterbox VC
Plus a spelling test in the clone route: the same sentence written three ways (ق/گ/ج, ك/چ/تش, plain/diacritised),
to see which spelling the checkpoint reads as Kuwaiti.
The checkpoint often fails to stop: generation is capped at about 4 speech tokens per letter and trailing silence is
trimmed. Output: voice-src/ck-kw-ali/ (not in git).  Run: /root/tkvoice/bin/python video/brand/tk_ckkw_ali.py [--spelling <spec>]   (a spelling test only, e.g. ckkw-spelling-34)"""
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
    import sys
    if "--spelling" in sys.argv:          # a spelling test only: --spelling <spec name, e.g. ckkw-spelling-34>
        name = sys.argv[sys.argv.index("--spelling") + 1] if len(sys.argv) > sys.argv.index("--spelling") + 1 else "ckkw-spelling-12"
        spec = json.loads((ROOT / f"video/brand/voice-data/{name}.json").read_text())
        items = [(f"{g['id']}-{tag}", text) for g in spec["groups"] for tag, text in g["variants"]]
        return clone(items, OUT / ("spell12" if name == "ckkw-spelling-12" else name), vc_too=False)
    if "--unseen" in sys.argv:            # dictionary check: each new sentence as written (raw) and after tk_kw_text.py (dict)
        from tk_kw_text import process
        spec = json.loads((ROOT / "video/brand/voice-data/ckkw-unseen-10.json").read_text())
        items, texts = [], {}
        for it in spec["items"]:
            fixed, changes = process(it["text"], "ckkw-spelling-map")
            items += [(f"{it['id']}-raw", it["text"])] + ([(f"{it['id']}-dict", fixed)] if fixed != it["text"] else [])
            texts[it["id"]] = {"raw": it["text"], "dict": fixed, "changes": changes}
        (OUT / "unseen").mkdir(parents=True, exist_ok=True)
        (OUT / "unseen/texts.json").write_text(json.dumps(texts, ensure_ascii=False, indent=1))
        return clone(items, OUT / "unseen", vc_too=False)
    clone(BASE + SPELL, OUT, vc_too=True)


def clone(items, out, vc_too, lora=None):
    out.mkdir(parents=True, exist_ok=True)
    tts = ChatterboxMultilingualTTS.from_local("/root/ck-kw", "cpu")
    if lora:   # a pilot fine-tune (tk_pilot0.py): LoRA weights on top of the checkpoint's T3
        from tk_voice_train import add_lora
        add_lora(tts.t3, 32)
        res = tts.t3.load_state_dict(torch.load(lora, map_location="cpu"), strict=False)
        assert not res.unexpected_keys, res.unexpected_keys
        tts.t3.eval()
    orig = tts.t3.inference
    cap = {"n": 1000}
    def capped(*a, **k):
        k["max_new_tokens"] = cap["n"]; return orig(*a, **k)
    tts.t3.inference = capped
    tts.prepare_conditionals(str(REF), exaggeration=0.5)
    for sid, text in items:
        cap["n"] = min(1000, 4 * len(re.sub(r"\s", "", text)) + 40)
        torch.manual_seed(0); t = time.time()
        try:
            wav = tts.generate(text, language_id="ar", exaggeration=0.5, cfg_weight=0.5)
        except Exception as e:
            print("clone", sid, "CRASH", type(e).__name__, flush=True); continue
        torchaudio.save(str(out / f"raw-clone-{sid}.wav"), wav, tts.sr)
        trim(out / f"raw-clone-{sid}.wav", out / f"clone-{sid}.wav")
        print("clone", sid, f"{time.time()-t:.0f}s", flush=True)
    del tts
    if not vc_too:
        return
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
