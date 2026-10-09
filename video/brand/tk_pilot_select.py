"""Pilot dataset, step 1 (read-only): propose 20-30 min of Ali-only, whole-utterance clips from the audio we already
have (DATASET-PROPOSAL.md, staged plan). Nothing is cut, written to audio, trained or downloaded: the output is a list.

Per episode in voice-src/raw/ (the eval episodes of refcmp are excluded):
  utterances  sentence units built from Ali's own pauses on the Demucs vocal stem (voice-src/sep/), so boundaries come
              from silence, never from Whisper's drifting word times. He pauses >= 0.3 s about every 5.5 s but rarely
              for 0.6 s (6% of gaps), so pieces are split at >= 0.3 s and joined until a piece ends a sentence: its
              pitch over the last 0.6 s falls (statement) or rises (question). A unit that reaches 15 s without such
              an ending is dropped, never cut mid-thought. Units are 2-15 s with >= 3 words.
  speaker     similarity to voice-src/ref.wav (Chatterbox voice encoder)
  asr         Whisper segment log-probability and no-speech probability (raw/<id>.segments.json)
  noise       the episode's voice-to-background gap (music.txt)
  coverage    words from the pronunciation dictionary (kw-pron-dict.json) and the known Whisper misspellings
Tiers:
  A  likely reliable: speaker >= 0.80, ASR log-prob >= -0.35, no-speech < 0.2, a falling or rising ending, gap >= 28 dB.
     Text still needs the Kuwaiti spelling pass; a random sample is audited by ear.
  B  usable after review: speaker >= 0.75 and the rest weaker. Every B clip is listened to.
Selection: tier A first, words that cover known pronunciation problems first, at most 25% of the minutes from one
episode, until TARGET minutes.
Writes voice-src/pilot/candidates.json (every utterance with its scores) and voice-src/pilot/selection.json.
Run: /root/tkvoice/bin/python video/brand/tk_pilot_select.py [--minutes 25]
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "voice-src"
OUT = SRC / "pilot"
TARGET = float(sys.argv[sys.argv.index("--minutes") + 1]) if "--minutes" in sys.argv else 25.0
SR = 16000
EVAL_EPISODES = {l["id"].rsplit("-", 1)[0] for l in json.loads((SRC / "refcmp/lines.json").read_text())}
DICT = json.loads((ROOT / "video/brand/voice-data/kw-pron-dict.json").read_text())
WHISPER_SLIPS = {"الأرغام", "أرغام", "تغريبا", "تغديم", "الرغمية", "نغدر", "يغدمونها", "غرروا", "غدموه", "مغاومة", "غصدي", "غليل", "شون"}
AR = re.compile(r"[ء-ي]+")


def islands(y, gap=0.6):
    iv = librosa.effects.split(y, top_db=35, frame_length=1024, hop_length=160)
    out = []
    for a, b in iv:
        if out and a - out[-1][1] < gap * SR:
            out[-1][1] = b
        else:
            out.append([a, b])
    return out


def ending(y):
    tail = y[-int(0.6 * SR):]
    f, v, _ = librosa.pyin(tail, fmin=60, fmax=350, sr=SR, frame_length=1024)
    f = f[v]
    if len(f) < 6:
        return "level", 0.0
    slope = float(np.polyfit(np.arange(len(f)), 12 * np.log2(f / f[0]), 1)[0] * len(f))   # semitones over the tail
    return ("fall" if slope < -1.5 else "rise" if slope > 1.5 else "level"), round(slope, 2)


def main():
    import torch
    from chatterbox.models.voice_encoder import VoiceEncoder
    from huggingface_hub import hf_hub_download
    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(hf_hub_download("ResembleAI/chatterbox", "ve.pt"), map_location="cpu"))
    ve.eval()
    ref = ve.embeds_from_wavs([librosa.load(str(SRC / "ref.wav"), sr=SR)[0]], sample_rate=SR, as_spk=True)
    music = {l.split()[0]: float(l.split()[-1]) for l in (SRC / "music.txt").read_text().splitlines() if re.search(r"gap -?[0-9.]+$", l)}
    dict_words = {k: v["status"] for k, v in DICT["words"].items()}

    cands = []
    for seg_file in sorted((SRC / "raw").glob("*.segments.json")):
        vid = seg_file.name.split(".")[0]
        if vid in EVAL_EPISODES:
            continue
        y = librosa.load(str(SRC / "sep/htdemucs" / vid / "vocals.wav"), sr=SR)[0]
        segs = json.loads(seg_file.read_text())
        words = [(w[0], w[1], w[2].strip(), s["logprob"], s["no_speech"]) for s in segs for w in s["words"]]
        pieces = islands(y, gap=0.3)
        ends = [ending(y[a:b])[0] if b - a > 0.3 * SR else "level" for a, b in pieces]
        units, cur = [], []
        for (a, b), e in zip(pieces, ends):
            cur.append((a, b))
            dur = (cur[-1][1] - cur[0][0]) / SR
            if dur > 15.0:
                cur = []
            elif e in ("fall", "rise") and dur >= 2.0:
                units.append((cur[0][0], cur[-1][1]))
                cur = []
        for n, (a, b) in enumerate(units):
            t0, t1 = a / SR, b / SR
            ws = [w for w in words if t0 <= (w[0] + w[1]) / 2 <= t1]
            if len(ws) < 3:
                continue
            seg = y[max(0, a - int(0.15 * SR)):min(len(y), b + int(0.2 * SR))]
            end, slope = ending(y[a:b])
            text = " ".join(w[2] for w in ws)
            toks = AR.findall(text)
            hits = sorted({t for t in toks for k in (t, t[2:] if t.startswith("ال") else t) if k in dict_words or k in WHISPER_SLIPS})
            cands.append({"id": f"{vid}-u{n:03d}", "video": vid, "start": round(t0, 2), "end": round(t1, 2), "dur": round(t1 - t0, 2),
                          "text_whisper": text, "lp": round(float(np.mean([w[3] for w in ws])), 3),
                          "no_speech": round(float(np.max([w[4] for w in ws])), 3), "ending": end, "slope": slope,
                          "gap_db": music.get(vid), "hits": hits,
                          "sim": round(float(np.dot(ve.embeds_from_wavs([seg], sample_rate=SR, as_spk=True), ref)), 3)})
        print(vid, sum(c["video"] == vid for c in cands), flush=True)

    for c in cands:
        good_end = c["ending"] in ("fall", "rise")
        if c["sim"] >= 0.80 and c["lp"] >= -0.35 and c["no_speech"] < 0.2 and good_end and (c["gap_db"] or 0) >= 28:
            c["tier"] = "A"
        elif c["sim"] >= 0.75:
            c["tier"] = "B"
        else:
            c["tier"] = "out"

    # selection: tier A, problem words first, no episode above 25% of the minutes
    pick, mins, per_vid, covered = [], 0.0, Counter(), Counter()
    cap = 0.25 * TARGET * 60
    pool = [c for c in cands if c["tier"] == "A"]
    pool.sort(key=lambda c: (-len(set(c["hits"]) - set(covered)), -c["sim"]))
    while pool and mins < TARGET * 60:
        pool.sort(key=lambda c: (-len([h for h in c["hits"] if covered[h] < 3]), -c["sim"]))
        c = pool.pop(0)
        if per_vid[c["video"]] + c["dur"] > cap:
            continue
        pick.append(c)
        mins += c["dur"]
        per_vid[c["video"]] += c["dur"]
        covered.update(set(c["hits"]))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "candidates.json").write_text(json.dumps(cands, ensure_ascii=False, indent=1))
    tiers = defaultdict(float)
    for c in cands:
        tiers[c["tier"]] += c["dur"]
    summary = {"utterances": len(cands), "minutes_by_tier": {k: round(v / 60, 1) for k, v in tiers.items()},
               "selected": len(pick), "selected_minutes": round(mins / 60, 1), "episodes": len(per_vid),
               "endings": Counter(c["ending"] for c in pick), "problem_words_covered": len(covered),
               "problem_words_3plus": sum(1 for v in covered.values() if v >= 3),
               "verified_dict_words_covered": sorted(w for w in covered if dict_words.get(w) == "VERIFIED"),
               "excluded_eval_episodes": sorted(EVAL_EPISODES)}
    (OUT / "selection.json").write_text(json.dumps({"summary": summary, "clips": pick}, ensure_ascii=False, indent=1))
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
