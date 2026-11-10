#!/usr/bin/env bash
# Rebuilds demo/turn-the-page-demo.mp4 and .gif. Needs node + Playwright, python3 + numpy, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=../..; FRAMES=$(mktemp -d)
node make-book.cjs
(cd "$ROOT" && python3 -m http.server 8123 >/dev/null 2>&1) & SERVER=$!
trap 'kill $SERVER; rm -rf "$FRAMES"' EXIT
sleep 1
node record.cjs http://localhost:8123/ "$FRAMES"
python3 sound.py "$FRAMES/turns.json" "$FRAMES/turn.wav"
ffmpeg -loglevel error -y -framerate 30 -i "$FRAMES/f%04d.png" -i "$FRAMES/turn.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -shortest \
  "$ROOT/demo/turn-the-page-demo.mp4"
ffmpeg -loglevel error -y -i "$ROOT/demo/turn-the-page-demo.mp4" \
  -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  "$ROOT/demo/turn-the-page-demo.gif"
