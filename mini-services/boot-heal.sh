#!/bin/bash
# boot-heal.sh — sovereign-runner-kit · perpetual guardian loop (§4).
# Every HEAL_INTERVAL_S: single-flight run of heal-pass.sh (restore+revive+receipts).
set -u
HEAL_INTERVAL_S=${HEAL_INTERVAL_S:-300}
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "runner-armed $(date -u +%FT%TZ) interval=${HEAL_INTERVAL_S}s pid=$$" >> "$DIR/state/heal.jsonl"
while true; do
  flock -n /tmp/boot-heal.instance.lock bash "$DIR/heal-pass.sh" >> "$DIR/state/heal.jsonl" 2>&1 || true
  sleep "$HEAL_INTERVAL_S"
done
