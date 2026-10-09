"""TK narration in Ali Alyousifi's voice from a Kuwaiti read, in one command.

A Kuwaiti speaker reads the script in parts (3-4 sentences per recording, about a second of silence between
sentences); this tool turns the recordings into one clip per sentence in Ali's voice, ready for a film:

  1. clean   Demucs (htdemucs, vocals stem) lifts the voice out of room/street noise
  2. split   Whisper word timings, matched to the script, cut each part into its sentences. A sentence said
             twice (a retake) takes the later take. Weak matches are reported, never silently used.
  3. tighten pauses inside a sentence capped at --pause seconds, silence trimmed at both ends
  4. voice   Chatterbox VC (S3Gen, MIT) to Ali's timbre; target voice-src/ref.wav (the clip Ali picked)
  5. tone    pitch contour widened around its median by --range (Praat PSOLA). After VC on purpose: S3Gen makes
             its own pitch and flattens anything widened before it
  6. pace    x --tempo (rubberband, pitch kept), loudness -18 LUFS
Defaults come from 20 of Ali's own clips against the «اسأل محمد» read (2026-10-09): same pitch level, Ali about
13% faster with shorter pauses, his pitch range about 1.45x wider.

Project layout (one folder per film):
  <film>/narration.json    {"s01": "text", ...}; optional "_parts": [["s01","s02","s03"], ["s04", ...], ...].
                           Without "_parts" every recording is one sentence.
  <film>/voice-rec/        the recordings, any audio format, taken in name order (1, 2, ... 10 sort naturally)
Output:
  <film>/voice-vc/proc/sNN.wav   one clip per sentence (point the storyboard here)
  <film>/voice-vc/all.m4a        every sentence in order: send this to listen before the video is made
  <film>/voice-vc/report.txt     how each sentence was found, with its match score
Consent: video/brand/VOICE-CONSENT.md (Ali's voice); the reader consents by recording. Audio is never committed.

Run: /root/tkvoice/bin/python video/brand/tk_ali_voice.py <film> [--tempo 1.13] [--range 1.45] [--pause 0.15]
     add --split-only to stop after step 2 and check the cuts (voice-vc/split/sNN.wav)
"""
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "voice-src/ref.wav"
WHISPER = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
AUDIO = {".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg", ".opus", ".caf", ".mp4", ".mov"}
SR = 24000


def arg(name, default):
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def run(*cmd):
    subprocess.run([str(c) for c in cmd], check=True)


def natural(p):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", p.name)]


def norm(t):
    """Letters only, with the spellings Whisper and the script disagree on folded together."""
    t = re.sub(r"[ً-ْـ]", "", t)
    for a, b in (("أإآ", "ا"), ("ى", "ي"), ("ة", "ه"), ("گغق", "ق"), ("چ", "ك"), ("ؤ", "و"), ("ئ", "ي")):
        t = re.sub(f"[{a}]", b, t)
    return re.sub(r"[^ء-ي]", "", t)


def load(path, sr=SR):
    y = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True, check=True).stdout
    return np.frombuffer(y, np.float32).copy()


# ---------- 2. split ----------
def islands(y, sr=16000, gap=0.6):
    """Stretches of speech, split where the speaker pauses for at least `gap` seconds: the pause between sentences
    (about a second) splits, a breath inside a sentence («اسأله… عندنا») does not."""
    iv = librosa.effects.split(y, top_db=35, frame_length=1024, hop_length=160)
    out = []
    for a, b in iv:
        if out and a - out[-1][1] < gap * sr:
            out[-1][1] = b
        else:
            out.append([a, b])
    pad = int(0.1 * sr)
    return [(max(0, a - pad), min(len(y), b + pad)) for a, b in out]


def match(words, sentences):
    """Best ordered, non-overlapping word spans for the sentences (dynamic programming on difflib ratio).
    Ties go to the later span, so a retake beats the take it replaces. Returns [(a, b, score)]."""
    n, k = len(words), len(sentences)
    wn = [norm(w.word) for w in words]
    targets = [norm(s) for s in sentences]
    # best[i][j]: best total for the first i sentences using words[:j]; back[i][j]: (a, b, score) of sentence i-1
    best = [[-1e9] * (n + 1) for _ in range(k + 1)]
    back = [[None] * (n + 1) for _ in range(k + 1)]
    best[0] = [0.0] * (n + 1)
    for i in range(1, k + 1):
        tgt = targets[i - 1]
        for b in range(1, n + 1):
            if best[i][b - 1] > best[i][b]:                     # sentence i ends before word b-1: carry
                best[i][b], back[i][b] = best[i][b - 1], back[i][b - 1]
            text = ""
            for a in range(b - 1, -1, -1):
                text = wn[a] + text
                if len(text) > 2 * len(tgt) + 10:
                    break
                prev = best[i - 1][a]
                if prev < -1e8:
                    continue
                sc = difflib.SequenceMatcher(None, text, tgt).ratio()
                total = prev + sc + 1e-4 * a                    # the small term prefers the later take
                if total > best[i][b] + 1e-9:
                    best[i][b], back[i][b] = total, (a, b, sc)
    spans, j = [], n
    for i in range(k, 0, -1):
        a, b, sc = back[i][j]
        spans.append((a, b, sc))
        j = a
    return spans[::-1]


def split(film, parts, text, model, out):
    out.mkdir(parents=True, exist_ok=True)
    report = []
    for p, (rec, keys) in enumerate(parts, 1):
        y = load(rec, 16000)
        words = []
        isl = islands(y)
        for n, (a, b) in enumerate(isl):                       # each stretch of speech on its own: its word times
            segs, _ = model.transcribe(np.concatenate([np.zeros(4000, np.float32), y[a:b]]), language="ar",
                                       beam_size=5, word_timestamps=True)   # stay inside it
            t0, t1 = a / 16000, b / 16000
            for w in (w for s in segs for w in s.words):
                w.start = min(t1, max(t0, t0 + w.start - 0.25))
                w.end = min(t1, max(w.start, t0 + w.end - 0.25))
                w.isl = n
                words.append(w)
        heard = " ".join(w.word.strip() for w in words)
        if len(words) < len(keys):
            report.append(f"part {p} ({rec.name}): heard too little to split: «{heard}»")
            continue
        spans = match(words, [text[k] for k in keys])
        # words in the same stretch of speech as a sentence but left unmatched are that sentence, misheard
        # («اسأله» came back as «مثلا»): pull them in. A retake sits behind a real pause, in another stretch.
        for i, (a, b, sc) in enumerate(spans):
            lo_lim = spans[i - 1][1] if i else 0
            hi_lim = spans[i + 1][0] if i + 1 < len(spans) else len(words)
            while a > lo_lim and words[a - 1].isl == words[a].isl:
                a -= 1
            while b < hi_lim and words[b].isl == words[b - 1].isl:
                b += 1
            spans[i] = (a, b, sc)
        full = load(rec)
        hop = int(0.01 * SR)                                    # 10 ms energy frames, to cut in the quietest spot
        e = np.sqrt(np.convolve(full ** 2, np.ones(2 * hop) / (2 * hop), "same")[::hop])

        def quiet(t0, t1):
            i0, i1 = max(0, int(t0 * 100)), min(len(e), int(t1 * 100))
            return (i0 + int(np.argmin(e[i0:i1]))) / 100 if i1 > i0 else t0

        dur = len(full) / SR
        for key, (a, b, sc) in zip(keys, spans):
            before = words[a - 1].end if a else 0.0           # any word, kept or not (a retake's last word too)
            after = words[b].start if b < len(words) else dur
            # a sentence that starts (ends) its stretch of speech is cut at the stretch's edge, never inside it: Whisper
            # can miss a short first word («اسأله»), and the pause after it must not become the cut
            if a == 0 or words[a - 1].isl != words[a].isl:
                lo = isl[words[a].isl][0] / 16000
            else:
                lo = quiet(max(before, words[a].start - 0.6), words[a].start)
            if b == len(words) or words[b].isl != words[b - 1].isl:
                hi = isl[words[b - 1].isl][1] / 16000
            else:
                hi = quiet(words[b - 1].end, min(after, words[b - 1].end + 0.6))
            sf.write(out / f"{key}.wav", full[int(lo * SR):int(hi * SR)], SR)
            said = " ".join(w.word.strip() for w in words[a:b])
            flag = "" if sc >= 0.6 else "   <-- check this one"
            report.append(f"{key}  part {p}  {lo:6.2f}-{hi:6.2f}s  match {sc:.2f}  heard «{said}»{flag}")
        if spans[0][0] > 0 or spans[-1][1] < len(words) or any(spans[i + 1][0] > spans[i][1] for i in range(len(spans) - 1)):
            dropped = [words[j].word.strip() for j in range(len(words)) if not any(a <= j < b for a, b, _ in spans)]
            report.append(f"part {p}: left out (retake or extra words): «{' '.join(dropped)}»")
    return report


# ---------- 3-6. tighten, voice, tone, pace ----------
def tighten(y, pause):
    iv = librosa.effects.split(y, top_db=35, frame_length=1024, hop_length=160)
    fade = int(0.01 * SR)
    ramp = np.linspace(0, 1, fade, dtype=y.dtype)
    parts = []
    for i, (a, b) in enumerate(iv):
        if i:
            parts.append(np.zeros(min(a - iv[i - 1][1], int(pause * SR)), y.dtype))
        seg = y[max(0, a - fade):b + fade].copy()
        seg[:fade] *= ramp
        seg[-fade:] *= ramp[::-1]
        parts.append(seg)
    return np.concatenate(parts)


def widen(path_in, path_out, k):
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(str(path_in))
    man = call(snd, "To Manipulation", 0.01, 60, 350)
    tier = call(man, "Extract pitch tier")
    med = call(snd.to_pitch(), "Get quantile", 0, 0, 0.5, "Hertz")
    for i in range(1, call(tier, "Get number of points") + 1):
        t, f = call(tier, "Get time from index", i), call(tier, "Get value at index", i)
        call(tier, "Remove point", i)
        call(tier, "Add point", t, med * (f / med) ** k)
    call([tier, man], "Replace pitch tier")
    call(man, "Get resynthesis (overlap-add)").save(str(path_out), "WAV")


def main():
    film = Path(sys.argv[1]).resolve()
    tempo, rng, pause = arg("--tempo", 1.13), arg("--range", 1.45), arg("--pause", 0.15)
    nar = json.loads((film / "narration.json").read_text())
    text = {k: v for k, v in nar.items() if not k.startswith("_")}
    recs = sorted((p for p in (film / "voice-rec").iterdir() if p.suffix.lower() in AUDIO), key=natural)
    layout = nar.get("_parts") or [[k] for k in text]
    if len(recs) != len(layout):
        sys.exit(f"{len(recs)} recordings in voice-rec/ but the script has {len(layout)} parts")
    vc_dir = film / "voice-vc"
    clean, cut, work, out = (vc_dir / d for d in ("clean", "split", "work", "proc"))
    for d in (clean, cut, work, out):
        d.mkdir(parents=True, exist_ok=True)

    # 1. clean
    run(sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", clean, *recs)
    cleaned = [clean / "htdemucs" / r.stem / "vocals.wav" for r in recs]

    # 2. split
    from faster_whisper import WhisperModel
    report = split(film, list(zip(cleaned, layout)), text, WhisperModel(WHISPER, device="cpu", compute_type="int8"), cut)
    (vc_dir / "report.txt").write_text("\n".join(report) + "\n")
    print("\n".join(report))
    missing = [k for k in text if not (cut / f"{k}.wav").exists()]
    if missing:
        sys.exit(f"not found in the recordings: {missing}; see voice-vc/report.txt")
    if "--split-only" in sys.argv:
        return

    # 3-6
    import torchaudio
    from chatterbox.vc import ChatterboxVC
    vc = ChatterboxVC.from_pretrained("cpu")
    vc.set_target_voice(str(REF))
    for k in text:
        sf.write(work / f"{k}-1tight.wav", tighten(load(cut / f"{k}.wav"), pause), SR)
        torchaudio.save(str(work / f"{k}-2vc.wav"), vc.generate(str(work / f"{k}-1tight.wav")), vc.sr)
        widen(work / f"{k}-2vc.wav", work / f"{k}-3wide.wav", rng)
        run("ffmpeg", "-v", "error", "-y", "-i", work / f"{k}-3wide.wav", "-af",
            f"rubberband=tempo={tempo}:pitchq=quality,loudnorm=I=-18:TP=-2:LRA=11",
            "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", out / f"{k}.wav")
        print(k, f"{librosa.get_duration(path=str(out / f'{k}.wav')):.2f}s", flush=True)

    gap = ["-f", "lavfi", "-t", "0.35", "-i", "anullsrc=r=48000:cl=mono"]
    ins = sum([["-i", str(out / f"{k}.wav")] + gap for k in text], [])
    n = 2 * len(text)
    run("ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", "".join(f"[{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1",
        "-b:a", "128k", vc_dir / "all.m4a")
    print("listen:", vc_dir / "all.m4a")


if __name__ == "__main__":
    main()
