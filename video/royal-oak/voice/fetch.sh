#!/usr/bin/env bash
# Downloads the narration clips listed in manifest.json into this folder.
cd "$(dirname "$0")"
python3 -c "import json;[print(l['url'],l['file']) for l in json.load(open('manifest.json'))['lines']]" | while read u f; do curl -sSfL -o "$f" "$u" && echo "ok $f" || echo "FAILED $f"; done
