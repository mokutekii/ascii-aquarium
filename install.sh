#!/bin/sh
# macOS / Linux: run `sh install.sh` (or double-click it if your file manager allows).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "ASCII Aquarium needs Node.js (free). Install the LTS version from https://nodejs.org, then run this again."
  exit 1
fi
node install.cjs && node start.cjs
