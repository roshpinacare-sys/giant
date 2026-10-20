#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# sovereign-loops.sh — חוק-הפעילות-המתמדת (גל-94 · 2026-10-20)
# ═══════════════════════════════════════════════════════════════════════
# השיעור-שנמדד: resurrect-fleet מקים-שירותים אך לא את הלופים-הריבוניים —
# אטימת-הכספת, מרשם-הטענות, סדולת-הדיבידנד ופעימת-הגיט מתו-בשקט אחרי-כל
# קציר ("התקפלות-עצמית"). החוק-החדש: הלופים-חלק-מהרפואה-העצמית — עולים
# בכל-אתחול, אידמפוטנטיים (מי-שחי-לא-נוגעים-בו), fail-honest בלוג.
# ═══════════════════════════════════════════════════════════════════════
set -u
ROOT="/home/z/my-project"
DEX="/home/z/work/saos-dex"
LOOPDIR="$ROOT/state/loops"
mkdir -p "$LOOPDIR"
say(){ echo "[$(date -u +%FT%TZ)] $*" >> "$LOOPDIR/sovereign-loops.log"; }

spawn_loop(){ # $1=name $2=pgrep-pattern $3=cmd  (כל-הפלט→לוג-משלו)
  if pgrep -f "$2" >/dev/null 2>&1; then say "ALIVE $1 (לא-נוגעים)"; return 0; fi
  setsid nohup bash -c "$3" </dev/null >> "$LOOPDIR/$1.log" 2>&1 &
  say "SPAWN $1 (pid=$!) ← $3"
}

# 1) מרשם-הטענות (Proof-of-Honesty) — כל-15-דק: truthScore חי, אפס-טענות-בלי-ראיה
spawn_loop "claims-audit" "claims-audit.mjs --loop" \
  "cd $ROOT && node scripts/claims-audit.mjs --loop 15"

# 2) סדולת-הדיבידנד — כל-30-דק: רווח-נמדד→owner-dividend (קוראת-עולם-חי)
spawn_loop "dividend-sweep" "dividend-sweep.mjs --loop" \
  "cd $DEX && node grids/dividend-sweep.mjs --loop"

# 3) פעימת-הגיט (dex-beat) — שעתית ב-:53 · keeper-קנוני FF-only · flock-נגד-ערימה
spawn_loop "dex-beat" "sovereign-loops.*dex-beat|dex-beat-clock" \
  "flock -n /tmp/dex-beat.lock -c 'while true; do
     now=\$(date +%s); m=\$(date -u +%M); s=\$(date -u +%S)
     w=\$(( (53*60 - (10#\$m*60 + 10#\$s)) % 3600 )); [ \$w -le 0 ] && w=\$((w+3600))
     sleep \$w
     cd $DEX && bash deploy/dex-beat-keeper.sh
   done'"

say "sovereign-loops: מחזור-הושלם (3-לופים-נאכפים)"
