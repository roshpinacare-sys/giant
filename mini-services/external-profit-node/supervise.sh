#!/bin/bash
# supervise.sh — משגיח-חי של external-profit-node (:3024) · fix-not-close
DIR="/home/z/my-project/mini-services/external-profit-node"
LOG="$DIR/service.log"
while true; do
  if ! curl -s -m 5 -o /dev/null http://127.0.0.1:3024/health; then
    echo "$(date -u +%FT%TZ) DOWN — reviving" >> "$LOG"
    pkill -f "external-profit-node/index.ts" 2>/dev/null
    sleep 1
    cd "$DIR"
    setsid nohup bun run index.ts >> "$LOG" 2>&1 < /dev/null &
    sleep 6
  fi
  sleep 30
done
