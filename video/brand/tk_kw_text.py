"""Turn script text into what a model should read, in two separate layers:
  1. general Kuwaiti word choice (voice-data/kuwaiti-lexicon.json): confirmed entries only, e.g. امبارح -> أمس.
  2. the model's own spelling map (e.g. voice-data/ckkw-spelling-map.json): entries with status chosen or closest,
     e.g. كم -> چم for Genarabia Chatterbox_Kuwaiti. Another model gets its own map; the lexicon stays the same.
Whole words only; a word also matches after the prefixes و ف ب ل ال وال بال فال. Nothing else is touched.
Run: python3 tk_kw_text.py ckkw-spelling-map "نص"   (prints the changed text and each change)"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent / "voice-data"
PREFIXES = ("وال", "بال", "فال", "ال", "و", "ف", "ب", "ل")
WORD = re.compile(r"[ء-ي٠-٩ٱ-ۓچگڤ]+")


def tables(model_map):
    lex = json.loads((DATA / "kuwaiti-lexicon.json").read_text())
    choice = {old: new for new, e in lex["words"].items() if e.get("status") == "confirmed" for old in e.get("instead_of", [])}
    m = json.loads((DATA / f"{model_map}.json").read_text())
    spell = {}
    for w, e in m["words"].items():
        if e.get("status") in ("chosen", "closest") and e.get("write") and e["write"] != w:
            for form, to in [(w, e["write"])] + list(e.get("forms", {}).items()):
                spell[form] = to
    return choice, spell


def swap(word, table):
    if word in table:
        return table[word]
    for p in PREFIXES:
        if word.startswith(p) and word[len(p):] in table:
            return p + table[word[len(p):]]
    return word


def process(text, model_map="ckkw-spelling-map"):
    choice, spell = tables(model_map)
    changes = []

    def one(mt):
        w = mt.group(0)
        a = swap(w, choice)
        b = swap(a, spell)
        if b != w:
            changes.append((w, b))
        return b
    return WORD.sub(one, text), changes


if __name__ == "__main__":
    out, ch = process(sys.argv[2], sys.argv[1])
    print(out)
    for a, b in ch:
        print(f"  {a} -> {b}")
