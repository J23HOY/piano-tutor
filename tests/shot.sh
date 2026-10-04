#!/bin/sh
# Dev helper: screenshot the app with seeded state, printing any console errors.
# usage: tests/shot.sh "<query for seed.html>" out-name [width] [height]
# needs a local server:  python -m http.server 8765 --bind 127.0.0.1   (from the repo root)
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
OUT="${SHOTS:-$(cygpath -m "$TMP")/piano-shots}"
mkdir -p "$OUT"
PROFILE="$OUT/profile-$$"
"$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
  --enable-logging=stderr --v=0 --virtual-time-budget=${BUDGET:-4000} \
  --window-size="${3:-1280},${4:-800}" --screenshot="$OUT/$2.png" \
  "http://127.0.0.1:8765/tests/seed.html?$1" 2>&1 \
  | grep -i "CONSOLE\|Uncaught" | head -20
rm -rf "$PROFILE"
