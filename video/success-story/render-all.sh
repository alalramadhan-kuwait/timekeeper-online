#!/usr/bin/env bash
# Renders the three episodes. Usage: ./render-all.sh [draft|final]
#   draft  720x1280 with the scene-status overlay (for review)
#   final  1080x1920 clean; refuses to run while placeholders, unconfirmed scenes or accuracy errors remain
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-draft}"
R=../../.claude/skills/paper-motion/scripts/render.mjs
python3 build.py
for e in 1 2 3; do
  d=$(python3 -c "import json;print(sum(s['dur'] for s in json.load(open('ep$e.json'))['scenes']))")
  m=$(echo curious momentum scale | cut -d' ' -f$e); t=$([ "$e" = 3 ] && echo 12 || echo 7)
  [ -f "renders/ep${e}_score_temp.wav" ] || python3 ../../.claude/skills/paper-motion/scripts/make-score.py --mood "$m" --duration "$d" --tail "$t" -o "renders/ep${e}_score_temp.wav"
done
if [ "$MODE" = final ]; then
  node check-story.mjs --final
  for e in 1 2 3; do node $R ep$e.json -o renders/ep${e}_master_1080x1920.mp4 --scale 1.5 --final; done
else
  node check-story.mjs
  for e in 1 2 3; do node $R ep$e.json -o renders/ep${e}_draft_review.mp4 --review --crf 23; done
fi
