"""The production automatic voice (2026-10-17): OmniVoice + the pilot O1 adapter (step 300), Gulf Arabic (afb), Ali's
ref8.wav. Text goes through the general Kuwaiti lexicon (confirmed word choices) and the OmniVoice spelling map
(voice-data/omni-spelling-map.json, entries the user chose by ear) before the model reads it. Research licence
(CC-BY-NC weights) until the licence question is settled.
Usage:
  HF_HUB_OFFLINE=1 /root/omni/bin/python video/brand/tk_omni_say.py <items.json> <out_dir>
  items.json = [{"id": "...", "text": "...", "raw": false}]   (raw: true skips the dictionary, for spelling variants)
Writes <out_dir>/<id>.wav and <out_dir>/texts.json (the text the model actually read)."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VD = ROOT / "video/brand/voice-data"
ADAPTER = ROOT / "voice-src/pilotO1/exp/checkpoint-300"
WORD = re.compile(r"[ء-يٱ-ۓچگڤً-ْ]+")
PREFIXES = ("وال", "بال", "فال", "ال", "و", "ف", "ب", "ل")


def tables():
    lex = json.loads((VD / "kuwaiti-lexicon.json").read_text())
    choice = {old: new for new, e in lex["words"].items() if e.get("status") == "confirmed" for old in e.get("instead_of", [])}
    m = json.loads((VD / "omni-spelling-map.json").read_text())["words"]
    spell = {w: e["write"] for w, e in m.items() if e.get("status") == "chosen" and e.get("write")}
    return choice, spell


def swap(w, t):
    if w in t:
        return t[w]
    for p in PREFIXES:
        if w.startswith(p) and len(w) - len(p) >= 3 and w[len(p):] in t:
            return p + t[w[len(p):]]
    return w


def prepare(text):
    choice, spell = tables()
    m = json.loads((KIT / "omni-spelling-map.json").read_text()) if "KIT" in globals() else json.loads((VD / "omni-spelling-map.json").read_text())
    for a, e in m.get("phrases", {}).items():   # multi-word entries first (a word that is ambiguous alone, e.g. هم)
        if e.get("status") == "chosen":
            text = text.replace(a, e["write"])
    return WORD.sub(lambda m: swap(swap(m.group(0), choice), spell), text)


if __name__ == "__main__":
    import soundfile as sf
    import torch
    from omnivoice import OmniVoice
    from omnivoice.utils.lora import load_lora_adapter
    torch.set_num_threads(4)
    items, out = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    m = load_lora_adapter(OmniVoice.from_pretrained("/root/omnivoice-w", device_map="cpu", dtype=torch.float32), str(ADAPTER))
    ref, ref_text = str(ROOT / "voice-src/ref8.wav"), (ROOT / "voice-src/ref8.txt").read_text().strip()
    read = {}
    for it in items:
        t = it["text"] if it.get("raw") else prepare(it["text"])
        torch.manual_seed(0)
        sf.write(out / f"{it['id']}.wav", m.generate(text=t, language="afb", ref_audio=ref, ref_text=ref_text)[0], 24000)
        read[it["id"]] = t
        print(it["id"], t, flush=True)
    (out / "texts.json").write_text(json.dumps(read, ensure_ascii=False, indent=1))
