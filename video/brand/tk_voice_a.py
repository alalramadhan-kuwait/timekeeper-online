"""TK Voice, phase A (VOICE-PLAN.md 4.1): zero-shot cloning, no training.

  transcribe  voice-src/<id>.<ext>  -> voice-src/<id>.segments.json (Whisper, word timings)
  ref         --start S --end E     -> voice-src/ref.wav (mono 24 kHz) + voice-src/ref.txt
  synth                             -> voice-src/phase-a/<key>.wav (Chatterbox Multilingual V3, CPU)

Run with the venv that has chatterbox-tts and faster-whisper (python -I).
Audio stays in voice-src/, which is git-ignored.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "voice-src"
CLIPS = ROOT / "video/royal-oak/voice-ar/clips.json"

# Five lines from the Royal Oak script: both hooks, the quartz scene, a Kuwaiti
# line (باچر), and numbers + brand names (p2-7 as revised in VOICE-TODO.md).
LINES = {
    "p1-h": None,
    "p2-h": None,
    "p2-q": None,
    "p2-2": None,
    "p2-7": "بازل، سنة اثنين وسبعين. الرويال أوك… بقطر تسعة وثلاثين ملم، ضخمة بمقاييس وقتها.",
}


def transcribe(audio: Path, model: str) -> None:
    import numpy as np
    from faster_whisper import WhisperModel

    # Decode with ffmpeg: faster-whisper's PyAV path breaks on av>=15.
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    m = WhisperModel(model, device="cpu", compute_type="int8")
    segs, info = m.transcribe(np.frombuffer(pcm, np.float32), language="ar", word_timestamps=True,
                              vad_filter=True, beam_size=5)
    out = []
    for s in segs:
        out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                    "no_speech": round(s.no_speech_prob, 3), "logprob": round(s.avg_logprob, 3),
                    "words": [[round(w.start, 2), round(w.end, 2), w.word] for w in s.words]})
        print(f"{s.start:7.2f}-{s.end:7.2f}  {s.text.strip()}", flush=True)
    dst = audio.with_suffix(".segments.json")
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("->", dst, f"({info.duration:.0f}s audio)")


def ref(audio: Path, start: float, end: float) -> None:
    segs = json.loads(audio.with_suffix(".segments.json").read_text())
    words = [w for s in segs for w in s["words"] if w[0] >= start - 0.05 and w[1] <= end + 0.05]
    text = "".join(w[2] for w in words).strip()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-to", str(end), "-i", str(audio),
                    "-ac", "1", "-ar", "24000", "-af", "loudnorm=I=-20:TP=-2:LRA=11",
                    "-c:a", "pcm_s16le", str(SRC / "ref.wav")], check=True)
    (SRC / "ref.txt").write_text(text + "\n")
    print(f"ref.wav {end - start:.1f}s\n{text}")


def synth(keys: list[str], exaggeration: float, cfg: float) -> None:
    import torch
    import torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    torch.set_num_threads(4)
    clips = json.loads(CLIPS.read_text())
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    out = SRC / "phase-a"
    out.mkdir(exist_ok=True)
    report = {}
    for k in keys:
        text = LINES.get(k) or clips[k]["text"]
        t0 = time.time()
        wav = tts.generate(text, language_id="ar", audio_prompt_path=str(SRC / "ref.wav"),
                           exaggeration=exaggeration, cfg_weight=cfg)
        torchaudio.save(str(out / f"{k}.wav"), wav, tts.sr)
        secs = wav.shape[-1] / tts.sr
        report[k] = {"file": f"phase-a/{k}.wav", "seconds": round(secs, 2), "text": text,
                     "cpu_seconds": round(time.time() - t0, 1)}
        print(k, report[k], flush=True)
    (out / "clips.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("transcribe"); t.add_argument("audio", type=Path); t.add_argument("--model", default="large-v3")
    r = sub.add_parser("ref"); r.add_argument("audio", type=Path)
    r.add_argument("--start", type=float, required=True); r.add_argument("--end", type=float, required=True)
    s = sub.add_parser("synth"); s.add_argument("keys", nargs="*", default=list(LINES))
    s.add_argument("--exaggeration", type=float, default=0.4); s.add_argument("--cfg", type=float, default=0.5)
    a = p.parse_args()
    if a.cmd == "transcribe":
        transcribe(a.audio, a.model)
    elif a.cmd == "ref":
        ref(a.audio, a.start, a.end)
    else:
        synth(a.keys, a.exaggeration, a.cfg)
    sys.exit(0)
