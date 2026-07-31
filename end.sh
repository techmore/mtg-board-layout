#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PID_FILE=".mtg-board.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "MTG Board is not running."
  exit 0
fi

pid="$(cat "$PID_FILE")"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  echo "Invalid PID file; removing it." >&2
  rm -f "$PID_FILE"
  exit 1
fi

if kill -0 "$pid" 2>/dev/null; then
  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  echo "Stopped MTG Board (PID $pid)."
else
  echo "MTG Board process $pid was not running."
fi

rm -f "$PID_FILE"
