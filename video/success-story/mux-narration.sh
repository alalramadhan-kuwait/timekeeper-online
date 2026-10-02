#!/usr/bin/env bash
# Lays the full narration track over the finished film without re-rendering it.
#   ./mux-narration.sh <narration.mp3> [video.mp4] [out.mp4]
# The track must already be timed to the film (time-keeper-narration.mp3 is: 95.5 s, line 1 at 1.4 s).
set -euo pipefail
cd "$(dirname "$0")"
NAR="$1"; VID="${2:-renders/time-keeper-story-v2.mp4}"; OUT="${3:-renders/time-keeper-story-final.mp4}"
FF="${FFMPEG:-ffmpeg}"
# music and paper sounds drop 6 dB under the voice, then the whole mix is levelled for phones
"$FF" -y -v error -i "$VID" -i "$NAR" -filter_complex \
  "[0:a]volume=-6dB[bed];[1:a]aresample=44100,volume=1dB[v];[bed][v]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
