#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

pnpm --filter @repo/db exec prisma migrate deploy

node apps/http-backend/dist/index.js &
http_pid=$!
node apps/ws-backend/dist/index.js &
ws_pid=$!
node apps/excalidraw-frontend/.next/standalone/apps/excalidraw-frontend/server.js &
frontend_pid=$!

trap 'kill "$http_pid" "$ws_pid" "$frontend_pid" 2>/dev/null || true; wait' INT TERM
wait -n "$http_pid" "$ws_pid" "$frontend_pid"
status=$?
kill "$http_pid" "$ws_pid" "$frontend_pid" 2>/dev/null || true
wait
exit "$status"
