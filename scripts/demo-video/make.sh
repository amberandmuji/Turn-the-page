#!/usr/bin/env bash
# Rebuilds demo/turn-the-page-demo.mp4 and .gif from two screen recordings of
# the camera window: one with swipes and a fist, one with pinch-and-drag.
# Usage: scripts/demo-video/make.sh swipes.mov pinch.mov
# Needs node + Playwright, python3 + numpy + Pillow, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"; HERE=$PWD; ROOT=$(cd ../.. && pwd)
export WORK=$(mktemp -d)
mkdir -p "$WORK/site"
ln -s "$ROOT/vendor" "$WORK/site/vendor"; ln -s "$ROOT/models" "$WORK/site/models"; cp extract.html "$WORK/site/"
for pair in "swipes:$1" "pinch:$2"; do
  name=${pair%%:*}; mkdir -p "$WORK/site/clip-$name"
  ffmpeg -loglevel error -i "${pair#*:}" -vf fps=30 "$WORK/site/clip-$name/f%04d.png"
done
node make-book.cjs
(cd "$ROOT" && exec python3 -m http.server 8123 >/dev/null 2>&1) & S1=$!
(cd "$WORK/site" && exec python3 -m http.server 8124 >/dev/null 2>&1) & S2=$!
trap 'kill $S1 $S2; rm -rf "$WORK"' EXIT
sleep 1
node extract.cjs
node record.cjs
python3 compose.py "$WORK/frames" "$WORK/comp" "$WORK/log.json"
python3 -c "import json,sys; json.dump(json.load(open(sys.argv[1]))['turns'], open(sys.argv[2],'w'))" "$WORK/log.json" "$WORK/turns.json"
python3 sound.py "$WORK/turns.json" "$WORK/turn.wav" 18
ffmpeg -loglevel error -y -framerate 30 -i "$WORK/comp/f%04d.png" -i "$WORK/turn.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -shortest \
  "$ROOT/demo/turn-the-page-demo.mp4"
ffmpeg -loglevel error -y -i "$ROOT/demo/turn-the-page-demo.mp4" \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  "$ROOT/demo/turn-the-page-demo.gif"
