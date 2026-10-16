#!/bin/bash
# guard-snapshot — סנטינל-מדינה (גל-79 · שורש: תפר-git-על-ספר-חי קרע-את-השרשרת 4-פעמים):
# כל-פעולת-git-מסוכנת (rebase/merge) מצלמת-את-הספר-החי-לנקודת-שחזור לפני-שעוברים-יד-על-הספר.
# אפס-שחזור-אוטומטי-כאן: המנוע-עצמו (runtime-heal/boot-heal) הוא-המרפא — כאן-רק-נקודות-שחזור-כנות.
S="mini-services/fleet-economy/state"
[ -f "$S/ledger.jsonl" ] || exit 0
B="$S/backups/$(date -u +%Y%m%dT%H%M%S)-$(basename "$0")"
mkdir -p "$B"
cp -p "$S/ledger.jsonl" "$B/" 2>/dev/null
cp -p "$S/snapshot.json" "$B/" 2>/dev/null
cp -p "$S/seal-log.jsonl" "$B/" 2>/dev/null
echo "$(date -u +%FT%TZ) hook=$(basename "$0") hookarg=$1 backup=$B" >> "$S/backups/guard.log"
exit 0
