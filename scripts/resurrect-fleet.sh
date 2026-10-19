#!/bin/bash
# resurrect-fleet.sh — שרשרת-התאוששות-ריבונית על-עץ-הפלטפורמה (v3 · 2026-10-18)
# נזרק-detached מ-instrumentation.ts בכל-עליית-Next (:3000 = דלת-הבית שנולדה).
# חוק-סדר-עלייה (מלחמת-הפורטים 20261018): ה-DEX-next-dev-שנולד-ראשון חוטף-גם-:3000
# — לכן: קודם מאומתת-הקונסולה (אנחנו-בתוכה), אחר-כך הכלכלה (מנעול-מגן), אחר-כך
# הדקס-דרך-משגיחו (portAlive-guard), ורק-אז השאר. כל-הקמה = דפוס-אימוץ-יתום
# (setsid nohup </dev/null) → מתייתם-ל-init → חי-בקבוצת-הפלטפורמה.
LOG="/home/z/my-project/state/fleet-resurrect.log"
mkdir -p /home/z/my-project/state
log() { echo "$(date -u +%FT%TZ) $1" >> "$LOG"; }

probe() { curl -s -m 5 -o /dev/null "http://127.0.0.1:$1$2" && return 0; curl -s -m 5 -o /dev/null "http://127.0.0.1:$1/health" && return 0; return 1; }

spawn_dir() { # $1=dir $2=cmd $3=name
  ( cd "$1" && setsid nohup bash -c "$2" >/dev/null 2>&1 </dev/null & )
  log "SPAWN $3 ← $1"
}

log "═══ resurrect-fleet התחיל (ppid-tree=platform-via-Next) ═══"

# 0. הדלת שנולדה (אנחנו-בתוכה) — מאומתת לפני-הכל
for i in 1 2 3 4 5 6; do probe 3000 "" && break; sleep 5; done
if probe 3000 ""; then log "OK console:3000 חיה (אנחנו-בנה)"; else log "WARN console:3000 לא-מאומתת — ממשיכים-בזהירות"; fi

# 1. הלב — כלכלה :3016 (המנעול-מגן-מפני-כותב-כפול; מופע-שני-יוצא-בכנות)
if ! probe 3016 "/health"; then
  spawn_dir /home/z/my-project/mini-services/fleet-economy "bun index.ts >> economy.log 2>&1" "economy:3016"
  sleep 6
  probe 3016 "/health" && log "OK economy:3016 הוקמה" || log "FAIL economy:3016"
else log "OK economy:3016 חיה"; fi

# 2. הבורסה :3010 — תמיד-דרך-המשגיח (יש-לו portAlive-guard) ורק-אחרי-דלת-חיה
if ! probe 3010 "/saos-dex/api/dex/state"; then
  if probe 3000 ""; then
    spawn_dir /home/z/my-project/mini-services/saos-dex-node "bun index.ts >> proxy.log 2>&1" "dex-supervisor→:3010"
    sleep 20
    probe 3010 "/saos-dex/api/dex/state" && log "OK dex:3010 הוקם" || log "FAIL dex:3010"
  else log "SKIP dex:3010 — דלת-הבית-מתה (חוק-סדר-עלייה)"; fi
else log "OK dex:3010 חי"; fi

# 3. השאר — במקביל-לוגי, כל-אחד-עם-guard
declare -A SVC=(
  [bridge:3017]="/home/z/my-project/mini-services/dex-economy-bridge|bun index.ts >> bridge.log 2>&1"
  [army:3018]="/home/z/my-project/mini-services/soldier-army|bun run dev >> army.log 2>&1"
  [voice:3019]="/home/z/my-project/mini-services/sovereign-voice|bun run dev >> voice.log 2>&1"
  [audit:3022]="/home/z/my-project/mini-services/sovereign-audit|bun run dev >> audit.log 2>&1"
  [giant-intake:3024]="/home/z/my-project/mini-services/giant-intake|bun run dev >> giant.log 2>&1"
  [saosx:3025]="/home/z/my-project/mini-services/sovereign-token|bun run dev >> saosx.log 2>&1"
  [boot-verifier:3042]="/home/z/my-project/mini-services/boot-verifier|bun run dev >> node.log 2>&1"
)
# חוק-טיהור-פורט (2026-10-19): bun SO_REUSEPORT מאפשר זומבים-מקבילים שגונבים-חיבורים —
# לפני-כל-הקמה מטהרים כל-מאזין-ישן על-הפורט (הוכח-חי: 4 זומבי-steem-voice גרמו-לדילוג 000/200)
purge_port() {
  local port="$1"
  for pid in $(ss -tlnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2); do
    kill -9 "$pid" 2>/dev/null
  done
}
for key in bridge:3017 army:3018 voice:3019 audit:3022 giant-intake:3024 boot-verifier:3042 saosx:3025; do
  port="${key##*:}"; name="${key%%:*}"
  IFS='|' read -r dir cmd <<< "${SVC[$key]}"
  if ! probe "$port" "/health"; then
    purge_port "$port"; sleep 1
    spawn_dir "$dir" "$cmd" "$key"; sleep 6
    probe "$port" "/health" && log "OK $key הוקם" || log "FAIL $key"
  else log "OK $key חי"; fi
done

log "═══ resurrect-fleet הסתיים ═══"
