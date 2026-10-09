"""Inference-only probe of Genarabia-ai/Chatterbox_Kuwaiti (public checkpoint, no card, no licence; research only).
Same six sentences as the SILMA baseline, the checkpoint's own built-in voice (conds.pt): no private audio is used.
For a fair reference the stock Chatterbox Multilingual (local ResembleAI cache) speaks the same text with the same
built-in voice and settings. Output: voice-src/ck-kw-test/{kw,base}-<id>.wav. No training, nothing integrated.
A sentence that runs away (hits the 40 s cap) or crashes gets one retry with conservative sampling (exaggeration 0.4,
cfg 0.3, temperature 0.6), saved as -safe; the base model gets the same treatment.
Run: /root/tkvoice/bin/python video/brand/tk_ckkw_probe.py"""
import glob, json, sys, time
from pathlib import Path
import torch, torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / "voice-src/ck-kw-test"
ITEMS = json.loads((ROOT / "voice-src/silma-baseline/log.json").read_text())["items"]
torch.manual_seed(0)
kw = ChatterboxMultilingualTTS.from_local("/root/ck-kw", "cpu")
voice = kw.conds
base_dir = Path(glob.glob("/root/.cache/huggingface/hub/models--ResembleAI--chatterbox/snapshots/*/")[0])
for name, tts in (("kw", kw), ("base", None)):
    if tts is None:
        tts = ChatterboxMultilingualTTS.from_pretrained("cpu")
        tts.conds = Conditionals.load("/root/ck-kw/conds.pt", map_location="cpu").to("cpu")
    for it in ITEMS:
        for tag, kw_args in (("", dict(exaggeration=0.5, cfg_weight=0.5)), ("-safe", dict(exaggeration=0.4, cfg_weight=0.3, temperature=0.6))):
            if (OUT / f"{name}-{it['id']}.wav").exists() and tag == "":
                d = torchaudio.info(str(OUT / f"{name}-{it['id']}.wav"))
                if d.num_frames / d.sample_rate < 30:      # first pass already fine: no retry
                    break
                continue
            torch.manual_seed(0); t = time.time()
            try:
                wav = tts.generate(it["input"], language_id="ar", **kw_args)
            except Exception as e:                      # record a crash, keep going
                print(name, it["id"], tag or "default", "CRASH", type(e).__name__, flush=True)
                continue
            torchaudio.save(str(OUT / f"{name}-{it['id']}{tag}.wav"), wav, tts.sr)
            print(name, it["id"], tag or "default", f"{wav.shape[-1]/tts.sr:.2f}s", f"{time.time()-t:.0f}s", flush=True)
            if wav.shape[-1] / tts.sr < 30:
                break
    del tts
