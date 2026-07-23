#!/usr/bin/env bash
# ============================================================
#  FB Intel — one-click launcher (Linux / macOS)
#  Stops any old server on ports 3000/4000, installs deps,
#  seeds the database on first run, then starts backend + web.
# ============================================================
set -e
cd "$(dirname "$0")"

echo ""
echo "==== FB Intel launcher ===="
echo ""

# --- 1) Stop anything already listening on 4000 (API) and 3000 (web) ---
echo "Stopping old servers on ports 4000 and 3000..."
for port in 4000 3000; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi
done

# --- 2) Backend: install deps + env + seed on first run ---
if [ ! -d server/node_modules ]; then
  echo "Installing backend dependencies..."
  (cd server && npm install)
fi
[ -f server/.env ] || cp server/.env.example server/.env
if [ ! -f server/data/fbintel.db ]; then
  echo "Seeding local database..."
  (cd server && npm run seed)
fi

# --- 3) Frontend: install deps + env ---
if [ ! -d web/node_modules ]; then
  echo "Installing frontend dependencies..."
  (cd web && npm install)
fi
[ -f web/.env ] || cp web/.env.example web/.env

# --- 4) Launch both; stop them together on Ctrl+C ---
echo "Starting backend on http://localhost:4000 ..."
(cd server && npm run dev) &
SERVER_PID=$!

echo "Starting frontend on http://localhost:3000 ..."
(cd web && npm run dev) &
WEB_PID=$!

cleanup() {
  echo ""
  echo "Stopping FB Intel..."
  kill "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo ""
echo "Running. Open http://localhost:3000"
echo "Login: admin@fbintel.local  /  Admin123!"
echo "Press Ctrl+C to stop both."
wait
