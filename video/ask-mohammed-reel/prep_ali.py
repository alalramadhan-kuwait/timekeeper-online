"""Ali's own recordings of the «اسأل محمد» narration (2026-10-09, phone, m4a) -> voice-ali/proc/sNN.wav.
The phone picked up room/street noise (floor about -35 dB, 17-21 dB under the voice), so the voice is first lifted
out with Demucs (htdemucs, vocals stem: floor drops to about -60 dB). Then: mono, 80 Hz high-pass, leading/trailing
silence trimmed (keeps 60 ms), every line at the same loudness. No pitch or pace change: it is his real voice.
Input: voice-ali/raw/s01..s10.m4a (his files Street_1_3..Street_1_12, in order).
Run: /root/tkvoice/bin/demucs --two-stems=vocals -n htdemucs -o voice-ali/demucs voice-ali/raw/*.m4a && python3 prep_ali.py
"""
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW, SEP, OUT = HERE / "voice-ali/raw", HERE / "voice-ali/demucs/htdemucs", HERE / "voice-ali/proc"
OUT.mkdir(parents=True, exist_ok=True)
TRIM = "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.06"
AF = ",".join(["highpass=f=80", TRIM, "areverse", TRIM, "areverse",
               "loudnorm=I=-18:TP=-2:LRA=11", "aresample=48000"])
for f in sorted(RAW.glob("s*.m4a")):
    out = OUT / f"{f.stem}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SEP / f.stem / "vocals.wav"), "-ac", "1", "-af", AF, "-c:a", "pcm_s16le", str(out)], check=True)
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                       capture_output=True, text=True).stdout.strip()
    print(f.stem, f"{float(d):.2f}s")
