#!/bin/bash
# supervise-web.sh — משגיח-החייאה של המערכת-החיה (Next.js :3000) · תורת fix-not-close
# גל-84 · מודע-הקפאות: אם מרקר-הקפאה-טרי קיים (אטימת-מנוע-הכלכלה משהה-את-השרת-בכוונה) —
# המפקח לא מפעיל החייאה (מניעת-סערת-EADDRINUSE). אם באמת מת — מקים אחרי-ניקוי-נוקשה.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/state-supervisor-web.log"
FLAG="$DIR/state/web-freeze.flag"

is_frozen_planned() {
  [ -f "$FLAG" ] || return 1
  local age_ms=$(( $(date +%s%3N) - $(cat "$FLAG" 2>/dev/null || echo 0) ))
  [ "$age_ms" -lt 600000 ]  # מרקר-טרי עד 10 דק'
}

while true; do
  if ! curl -s -m 4 http://127.0.0.1:3000/ > /dev/null 2>&1; then
    if is_frozen_planned; then
      echo "$(date -u +%FT%TZ) freeze-hold (אטימה מתוכננת — לא מתערב)" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) DOWN — reviving next:3000" >> "$LOG"
      # ניקוי-נוקשה: כל-מחזיקי-הפורט (כולל-תהליכים-מושהים-SIGSTOP) לפני-העלייה
      pkill -9 -f "next-server" 2>/dev/null
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
  fi
  sleep 15
done
