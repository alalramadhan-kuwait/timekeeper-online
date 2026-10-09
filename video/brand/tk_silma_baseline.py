"""Run: HF_HUB_OFFLINE=1 /root/habibi/bin/python video/brand/tk_silma_baseline.py '[{"id":..,"text":..}]'   (weights in /root/silma-check)
SILMA TTS v1 feasibility check (inference only, no training). Pretrained weights, Ali's 7.5 s reference
(voice-src/ref8.wav, cut from ref.wav at a pause; original untouched) with its verified text.
NeMo normalisation and CATT diacritisation are bypassed: their modules are stubbed so they cannot run, the API's
switches are off, and the text reaching the model is logged and compared with the input."""
import json, sys, types, time
from pathlib import Path
# stub the two text processors so they can never run (fails loudly if anything calls them)
def _boom(*a, **k): raise RuntimeError("text processor called")
n = types.ModuleType("nemo_text_processing"); tn = types.ModuleType("nemo_text_processing.text_normalization")
tnn = types.ModuleType("nemo_text_processing.text_normalization.normalize"); tnn.Normalizer = _boom
sys.modules.update({"nemo_text_processing": n, "nemo_text_processing.text_normalization": tn,
                    "nemo_text_processing.text_normalization.normalize": tnn})
c = types.ModuleType("catt_tashkeel"); c.CATTEncoderOnly = _boom; sys.modules["catt_tashkeel"] = c
sys.path.insert(0, "/root/silma-check/repo/src")
import soundfile as sf
from omegaconf import OmegaConf
from hydra.utils import get_class
import silma_tts.model.cfm as cfm
from silma_tts.infer import utils_infer as U
seen = []
_orig = cfm.list_str_to_idx
def logged(text, vocab):
    seen.extend(text); return _orig(text, vocab)
cfm.list_str_to_idx = logged
ROOT = Path("/home/user/timekeeper-online"); OUT = ROOT / "voice-src/silma-baseline"
cfg = OmegaConf.load("/root/silma-check/config.yaml")
model = U.load_model(get_class(f"silma_tts.model.{cfg.model.backbone}"), cfg.model.arch, "/root/silma-check/model.pt",
                     "vocos", "/root/silma-check/vocab.txt", "euler", False, "cpu")
voc = U.load_vocoder("vocos", False, None, "cpu")
ref_audio, ref_text = U.preprocess_ref_audio_text(str(ROOT / "voice-src/ref8.wav"), (ROOT / "voice-src/ref8.txt").read_text())
assert "فتودور" in ref_text, ref_text      # our text kept, not re-transcribed
items = json.loads(sys.argv[1])
log = []
for it in items:
    seen.clear(); t = time.time()
    wav, sr, _ = U.infer_process(ref_audio, ref_text, it["text"], model, voc, "vocos", nfe_step=32, speed=1.0,
                                 device="cpu", force_tashkeel=False)
    sf.write(OUT / f"{it['id']}.wav", wav, sr)
    sent = seen[0] if seen else ""
    log.append({"id": it["id"], "input": it["text"], "model_text": sent, "secs": round(time.time() - t, 1),
                "dur": round(len(wav) / sr, 2), "gen_part_unchanged": it["text"].strip() in sent})
    print(json.dumps(log[-1], ensure_ascii=False), flush=True)
(OUT / "log.json").write_text(json.dumps({"ref_text": ref_text, "items": log}, ensure_ascii=False, indent=1))
