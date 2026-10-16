#!/bin/bash
# supervise-dev.sh — משגיח-החייאה של שרת-ה-web (תורת fix-not-close · גל-85):
# אם next-dev נפל (OOM/קריסה/חיתוך-סשן) — מקים אותו תוך שניות, לנצח. אפס-הדמיות.
DIR="/home/z/my-project"
LOG="$DIR/state/dev-supervisor.log"
mkdir -p "$DIR/state"
while true; do
  if ! curl -s -m 5 -o /dev/null http://127.0.0.1:3000/; then
    echo "$(date -u +%FT%TZ) DOWN — reviving next-dev" >> "$LOG"
    pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
    sleep 2
    cd "$DIR"
    setsid nohup bash -c './node_modules/.bin/next dev -p 3000 2>&1 | tee dev.log' > /dev/null 2>&1 < /dev/null &
    sleep 20
    if curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ | grep -q "200\|307\|302"; then
      echo "$(date -u +%FT%TZ) REVIVED ok" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE retry-pending (first-hit compile may be slow)" >> "$LOG"
    fi
  fi
  sleep 20
done
