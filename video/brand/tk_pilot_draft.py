"""Pilot dataset, step 2 (DATASET-PROPOSAL.md, Stage 1 assisted verification): cut the 160 proposed clips (pool A plus
B-music) from the Demucs vocal stem, write a Kuwaiti draft transcript for each, mark what a person should check, and
pick which clips the user listens to. Nothing is trained and nothing leaves this machine.

Per clip:
  audio     voice-src/pilot/clips/<id>.wav, mono 44.1 kHz, from voice-src/sep/htdemucs/<video>/vocals.wav with 0.15 s
            before and 0.2 s after (the same window the speaker score used). Pitch, pace and pauses are untouched.
  draft     a second Whisper pass (large-v3-turbo, beam 5, a prompt with Ali's vocabulary), then whole-word fixes:
            the known Whisper slips (غ for Ali's g, شون for شلون) and any غ-word whose ق form is in the pronunciation
            dictionary. Transcript convention for Chatterbox_Kuwaiti: plain ق for Ali's g (ckkw-spelling-map.json).
  marks     words with Whisper probability < 0.6, words the fixes changed, and words where the first and second
            Whisper pass disagree.
  flags     ends on a connective (not a full sentence), digits or Latin letters (to be written as spoken), 3+ marked
            words, or pool B-music (always listened to).
Review set: every flagged clip, every B-music clip and a seeded random 20% of the unflagged A clips.
Writes voice-src/pilot/drafts.json.  Run: /root/tkvoice/bin/python video/brand/tk_pilot_draft.py"""
import difflib
import json
import random
import re
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "voice-src"
OUT = SRC / "pilot"
DICT = json.loads((ROOT / "video/brand/voice-data/kw-pron-dict.json").read_text())["words"]
SLIPS = {"الأرغام": "الأرقام", "أرغام": "أرقام", "تغريبا": "تقريبا", "تغريباً": "تقريباً", "تغديم": "تقديم", "الرغمية": "الرقمية",
         "نغدر": "نقدر", "يغدمونها": "يقدمونها", "غرروا": "قرروا", "غدموه": "قدموه", "مغاومة": "مقاومة", "غصدي": "قصدي",
         "غليل": "قليل", "شون": "شلون"}
CONNECTIVES = {"و", "لكن", "إنه", "انه", "اللي", "عشان", "بس", "يعني", "لأن", "لان", "لأنه", "لانه", "ف", "إن", "ان", "في", "من", "على", "مع", "عن", "إلى", "الى", "هو", "هي"}
PROMPT = ("هلا والله، معاكم علي اليوسفي. اليوم بنتكلم عن الساعات: رولكس، أوميغا، باتيك فيليب، أوديمار بيغيه، جيجر لوكولتر، "
          "تيودور، كارتييه. شلون، شنو، وايد، الحين، قاعد، نقدر، تقريباً، الوقت، قبل، حق.")
AR = re.compile(r"[ء-ي]+")


def fix(word):
    bare = word.strip("،.؟!,?")
    if bare in SLIPS:
        return word.replace(bare, SLIPS[bare])
    if "غ" in bare:
        q = bare.replace("غ", "ق")
        for k in (q, q[2:] if q.startswith("ال") else None):
            if k and k in DICT:
                return word.replace(bare, q)
    return word


def main():
    from faster_whisper import WhisperModel
    m = WhisperModel("mobiuslabsgmbh/faster-whisper-large-v3-turbo", device="cpu", compute_type="int8")
    cands = json.loads((OUT / "candidates.json").read_text())
    pool = [c for c in cands if c["tier"] == "A" or (c["tier"] == "B" and c["sim"] >= 0.80 and c["lp"] >= -0.35
                                                     and c["no_speech"] < 0.2 and c["ending"] in ("fall", "rise"))]
    (OUT / "clips").mkdir(parents=True, exist_ok=True)
    stems, out = {}, []
    for c in pool:
        if c["video"] not in stems:
            stems = {c["video"]: librosa.load(str(SRC / "sep/htdemucs" / c["video"] / "vocals.wav"), sr=None, mono=True)}
        y, sr = stems[c["video"]]
        seg = y[max(0, int((c["start"] - 0.15) * sr)):min(len(y), int((c["end"] + 0.2) * sr))]
        sf.write(OUT / "clips" / f"{c['id']}.wav", seg, sr, subtype="PCM_16")
        segs, _ = m.transcribe(librosa.resample(seg, orig_sr=sr, target_sr=16000), language="ar", beam_size=5,
                               initial_prompt=PROMPT, word_timestamps=True, condition_on_previous_text=False)
        words = [w for s in segs for w in s.words]
        toks, marks = [], []
        for i, w in enumerate(words):
            t = w.word.strip()
            f = fix(t)
            toks.append(f)
            if w.probability < 0.6 or f != t:
                marks.append(i)
        old = c["text_whisper"].split()
        sm = difflib.SequenceMatcher(a=[o.strip("،.؟!,?") for o in old], b=[t.strip("،.؟!,?") for t in toks])
        for op, a0, a1, b0, b1 in sm.get_opcodes():
            if op != "equal":
                marks += list(range(b0, b1))
        draft = " ".join(toks)
        flags = []
        if toks and toks[-1].strip("،.؟!,?") in CONNECTIVES:
            flags.append("ends on a connective")
        if re.search(r"[0-9A-Za-z]", draft):
            flags.append("digits or Latin")
        if len(set(marks)) >= 3:
            flags.append("3+ marked words")
        if c["tier"] == "B":
            flags.append("B-music")
        out.append({"id": c["id"], "video": c["video"], "tier": c["tier"], "dur": c["dur"], "sim": c["sim"], "ending": c["ending"],
                    "draft": draft, "whisper_first": c["text_whisper"], "marks": sorted(set(marks)), "flags": flags,
                    "agree": round(sm.ratio(), 3)})
        print(c["id"], len(out), "/", len(pool), flags, flush=True)
    unflagged = [o["id"] for o in out if not o["flags"]]
    audit = set(random.Random(2026).sample(unflagged, max(1, round(0.2 * len(unflagged))))) if unflagged else set()
    for o in out:
        o["review"] = bool(o["flags"]) or o["id"] in audit
        o["why"] = o["flags"] or (["random 20% audit"] if o["id"] in audit else [])
    summary = {"clips": len(out), "minutes": round(sum(o["dur"] for o in out) / 60, 1), "flagged": sum(bool(o["flags"]) for o in out),
               "audit": len(audit), "to_review": sum(o["review"] for o in out),
               "review_minutes": round(sum(o["dur"] for o in out if o["review"]) / 60, 1),
               "mean_pass_agreement": round(float(np.mean([o["agree"] for o in out])), 3)}
    (OUT / "drafts.json").write_text(json.dumps({"summary": summary, "clips": out}, ensure_ascii=False, indent=1))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
