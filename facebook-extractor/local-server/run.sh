#!/usr/bin/env bash
# FB Extractor — local database server (macOS / Linux)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Get it from https://nodejs.org then run this again."
  exit 1
fi
node server.js
