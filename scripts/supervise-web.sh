#!/bin/bash
# supervise-web.sh — משגיח-החייאה של המערכת-החיה (Next.js :3000) · תורת fix-not-close
# אם-השרת-נפל — מקים-אותו-תוך-שניות, לנצח. כל-החייאה-נרשמת. אפס-הדמיות.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/state-supervisor-web.log"
while true; do
  if ! curl -s -m 4 http://127.0.0.1:3000/ > /dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) DOWN — reviving next:3000" >> "$LOG"
    # ניקוי-שאריות-מאזינים-גוועים (EADDRINUSE) לפני-העלייה
    for pid in $(pgrep -f "next dev -p 3000"); do kill -9 "$pid" 2>/dev/null; done
    sleep 1
    (cd "$DIR" && setsid nohup bun run dev > "$DIR/dev.log" 2>&1 < /dev/null &)
    sleep 12
    if curl -s -m 4 http://127.0.0.1:3000/ > /dev/null 2>&1; then
      echo "$(date -u +%FT%TZ) REVIVED ok" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE FAILED (will retry)" >> "$LOG"
    fi
  fi
  sleep 15
done
