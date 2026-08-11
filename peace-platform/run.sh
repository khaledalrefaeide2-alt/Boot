#!/usr/bin/env bash
# Convenience launcher for local development.
#   ./run.sh          start the server
#   ./run.sh seed     rebuild the demonstration dataset, then start
#   ./run.sh test     run the test suite
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Creating .env from .env.example with generated secrets…"
  cp .env.example .env
  python3 - <<'PY'
import pathlib, secrets
p = pathlib.Path(".env")
text = p.read_text()
text = text.replace(
    "SECRET_KEY=change-me-generate-a-long-random-value",
    f"SECRET_KEY={secrets.token_urlsafe(48)}")
text = text.replace(
    "IP_HASH_SALT=change-me-too", f"IP_HASH_SALT={secrets.token_urlsafe(32)}")
p.write_text(text)
print("  secrets generated")
PY
fi

case "${1:-serve}" in
  test)
    exec python3 -m pytest "${@:2}"
    ;;
  seed)
    python3 -m seed.demo_data --reset
    ;&                       # fall through to serve
  serve)
    echo "→ http://127.0.0.1:8000   (dashboard: /dash/login)"
    exec python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
    ;;
  *)
    echo "usage: $0 [serve|seed|test]" >&2
    exit 2
    ;;
esac
