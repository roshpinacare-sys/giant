#!/bin/bash
# supervise-liquidity.sh — משגיח-החייאה של מנוע-הנזילות (חוק fix-not-close):
# אם-נפל (OOM/קריסה) — מקים-תוך-שניות, לנצח. כל-החייאה-נרשמת.
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/state/supervisor.log"
mkdir -p "$DIR/state"
while true; do
  if ! curl -s -m 3 http://127.0.0.1:3043/health > /dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) DOWN — reviving liquidity-engine" >> "$LOG"
    cd "$DIR"
    setsid nohup bun --hot index.ts >> "$DIR/state/engine.log" 2>&1 < /dev/null &
    sleep 5
    if curl -s -m 3 http://127.0.0.1:3043/health > /dev/null 2>&1; then
      echo "$(date -u +%FT%TZ) REVIVED ok" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE FAILED (will retry)" >> "$LOG"
    fi
  fi
  sleep 20
done
