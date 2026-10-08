"""«اسأل محمد» narration in ar-KW-FahedNeural (Kuwaiti male) through edge-tts: Microsoft Edge's read-aloud voices,
no key needed. Unofficial use of the Edge service; fine for drafts and personal use (Ali, 2026-10-08); for anything
official use the Azure Speech free tier with a key instead (video/royal-oak/tts_azure.py, same voice).
Writes voice-fahed/<key>.mp3 + .wav (24 kHz mono).  Run: /root/habibi/bin/python tts_fahed_ask.py [--rate +5%]
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

import ssl

import edge_tts
import edge_tts.communicate

CA = Path("/root/.ccr/ca-bundle.crt")   # this cloud machine's outbound proxy; harmless elsewhere
if CA.exists():
    edge_tts.communicate._SSL_CTX = ssl.create_default_context(cafile=str(CA))

HERE = Path(__file__).resolve().parent
VOICE = "ar-KW-FahedNeural"
RATE = sys.argv[sys.argv.index("--rate") + 1] if "--rate" in sys.argv else "+0%"
lines = {k: t for k, t in json.loads((HERE / "narration.json").read_text()).items() if not k.startswith("_")}
out = HERE / "voice-fahed"
out.mkdir(exist_ok=True)


async def main():
    for k, t in lines.items():
        await edge_tts.Communicate(t.replace("…", "،"), VOICE, rate=RATE)   # «…» makes Fahed pause too long.save(str(out / f"{k}.mp3"))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out / f"{k}.mp3"), "-ac", "1", "-ar", "24000", str(out / f"{k}.wav")], check=True)
        print(k, t, flush=True)

asyncio.run(main())
