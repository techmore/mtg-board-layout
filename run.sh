#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PID_FILE=".mtg-board.pid"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if kill -0 "$existing_pid" 2>/dev/null; then
    echo "MTG Board is already running (PID $existing_pid)." >&2
    exit 1
  fi
  rm -f "$PID_FILE"
fi

cleanup() {
  rm -f "$PID_FILE"
}

stop() {
  cleanup
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}

trap stop INT TERM
trap cleanup EXIT

npm run dev -- "$@" &
server_pid=$!
echo "$server_pid" > "$PID_FILE"

wait "$server_pid"
