"""Ali Alyousifi's automatic Kuwaiti voice (Time Keeper): OmniVoice + Ali's LoRA adapter, Gulf Arabic, Ali's reference.
Text goes through the Kuwaiti lexicon and the spelling map (words the owner chose by ear) before the model reads it.
Usage:  python say.py "النص" out.wav            (one line)
        python say.py --file script.txt out.wav  (one sentence per line, joined with short pauses)
Options: --speed 1.0 (1.1-1.2 is a little faster)
         --voice me (default: the owner's own voice) | ali (Ali Alyousifi)
         --no-adapter (plain OmniVoice, without the training on Ali's Kuwaiti speech)
Licence: OmniVoice weights are CC-BY-NC (non-commercial) until the owner settles it."""
import json
import re
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent
WORD = re.compile(r"[ء-يٱ-ۓچگڤً-ْ]+")
PREFIXES = ("وال", "بال", "فال", "ال", "و", "ف", "ب", "ل")


def tables():
    lex = json.loads((KIT / "kuwaiti-lexicon.json").read_text())
    choice = {o: n for n, e in lex["words"].items() if e.get("status") == "confirmed" for o in e.get("instead_of", [])}
    m = json.loads((KIT / "omni-spelling-map.json").read_text())["words"]
    return choice, {w: e["write"] for w, e in m.items() if e.get("status") == "chosen" and e.get("write")}


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


def main():
    import numpy as np
    import soundfile as sf
    import torch
    from omnivoice import OmniVoice
    from omnivoice.utils.lora import load_lora_adapter
    args = sys.argv[1:]
    speed, voice, adapter = 1.0, "me", True
    if "--speed" in args:
        i = args.index("--speed"); speed = float(args[i + 1]); del args[i:i + 2]
    if "--voice" in args:
        i = args.index("--voice"); voice = args[i + 1]; del args[i:i + 2]
    if "--no-adapter" in args:
        args.remove("--no-adapter"); adapter = False
    if args[0] == "--file":
        lines = [l.strip() for l in Path(args[1]).read_text().splitlines() if l.strip()]; out = args[2]
    else:
        lines, out = [args[0]], args[1]
    torch.set_num_threads(4)
    weights = str(KIT / "weights") if (KIT / "weights" / "model.safetensors").exists() else "k2-fsa/OmniVoice"
    m = OmniVoice.from_pretrained(weights, device_map="cuda" if torch.cuda.is_available() else "cpu", dtype=torch.float32)
    if adapter:
        m = load_lora_adapter(m, str(KIT / "adapter"))
    ref, ref_text = str(KIT / "voices" / voice / "ref.wav"), (KIT / "voices" / voice / "ref.txt").read_text().strip()
    gap, parts = np.zeros(int(0.35 * 24000), dtype=np.float32), []
    for i, line in enumerate(lines):
        t = prepare(line)
        torch.manual_seed(i)
        parts += [m.generate(text=t, language="afb", ref_audio=ref, ref_text=ref_text, speed=speed)[0].astype(np.float32), gap]
        print(f"{i + 1}/{len(lines)}", t, flush=True)
    sf.write(out, np.concatenate(parts[:-1]), 24000)
    print("->", out)


if __name__ == "__main__":
    main()
