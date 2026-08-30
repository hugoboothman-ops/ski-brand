#!/bin/sh
# Regenerates the local preview copy of index.html: Google Fonts swapped for
# self-hosted files (the sandbox browser cannot reach fonts.googleapis.com) and
# the H.264 hero swapped for a VP9 copy (its Chromium has no H.264).
# Both substitutions exist only for verification; neither ships.
cd "$(dirname "$0")/.."
sed -e 's#<link rel="stylesheet" href="https://fonts.googleapis.com[^"]*">#<link rel="stylesheet" href="/tools/fonts/local.css">#' \
    -e 's#<source src="assets/video/hero.mp4" type="video/mp4">#<source src="assets/video/hero-verify.webm" type="video/webm">#' \
    index.html > index-fonttest.html
echo "index-fonttest.html rebuilt"
