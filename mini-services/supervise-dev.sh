#!/bin/bash
# supervise-dev.sh v2 — משגיח-החייאה של שרת-ה-web (root-cure cycle-36):
# הפגם-ההיסטורי: pkill גלובלי של "next dev" הרג גם את :3010/:3002 והזריע עותקים
# במהלך קומפילציות ארוכות (כל 20ש׳). התיקון: סקופ-:3000-בלבד (kill-by-port),
# סבלנות-קומפילציה (3 כשלות רצופות × probe 45ש׳), single-flight flock. אפס-הדמיות.
DIR="/home/z/my-project"
LOG="$DIR/state/dev-supervisor.log"
mkdir -p "$DIR/state"
exec 9>"/tmp/supervise-dev.lock"
flock -n 9 || { echo "$(date -u +%FT%TZ) already-running (flock) — exit" >> "$LOG"; exit 0; }
DOWN=0
while true; do
  code=$(curl -s -m 45 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null)
  case "$code" in
    200|301|302|307|308|404) DOWN=0 ;;
    *) DOWN=$((DOWN+1)) ;;
  esac
  if [ "$DOWN" -ge 6 ]; then
    echo "$(date -u +%FT%TZ) DOWN x$DOWN (code=$code) — reviving next-dev (scoped :3000)" >> "$LOG"
    pid=$(ss -ltnp 2>/dev/null | sed -n 's/.*:3000 .*pid=\([0-9]*\).*/\1/p' | head -1)
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
    sleep 2
    cd "$DIR"
    setsid nohup bash -c './node_modules/.bin/next dev -p 3000 2>&1 | tee dev.log' > /dev/null 2>&1 < /dev/null &
    DOWN=0
    sleep 45
  fi
  sleep 20
done
