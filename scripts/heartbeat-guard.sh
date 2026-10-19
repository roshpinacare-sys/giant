#!/bin/bash
# heartbeat-guard.sh — שומר-הדופק-הריבוני (ESC-14 · 2026-10-19)
# ═════════════════════════════════════════════════════════════════════
# הפער-שנמדד-חי (16:21Z): pid-2539 היה תקוע — מאזין-על-:3000 ו-:3010
# בלי-להגיב — resurrect-fleet לא הופעל (Next לא עלה = אין-instrumentation)
# והמשגיחים ראו "פורט-חי" ולא-הקימו כלום. תוצאה: הספר-החי קפא 8 שעות
# והאתר הציבורי הציג "מושהה".
#
# החוק-החדש: בדיקת-HTTP אמיתית (לא-רק-פורט). שני-סקרים-רצופים-ללא-מענה
# → הרגת-התוקע-המחזיק-את-הפורט → המשגיחים-הקיימים מקימים (חוק-סדר-עלייה).
# כתוב-כנה ללוג; אפס-ירוק-מזויף. דמון-לולאה יתום (setsid) — עצמאי לגמרי מ-Next.
# ═════════════════════════════════════════════════════════════════════
# ═════════════════════════════════════════════════════════════════════
# ריצה: bash heartbeat-guard.sh        → מחזור-בודד (בדיקה-אחת ויציאה)
#       bash heartbeat-guard.sh --loop → דמון-לולאה (כל-60ש׳ · יתום-ל-init)
# ═════════════════════════════════════════════════════════════════════
set -u
LOG="/home/z/my-project/state/heartbeat-guard.log"
STATE="/home/z/my-project/state/heartbeat-guard.state"
PIDF="/home/z/my-project/state/heartbeat-guard.pid"
mkdir -p /home/z/my-project/state
log() { echo "$(date -u +%FT%TZ) $1" >> "$LOG"; }

if [ "${1:-}" = "--loop" ]; then
  echo $$ > "$PIDF"
  log "LOOP התחיל (pid=$$) — סקר-כל-60ש׳"
  trap 'rm -f "$PIDF"; log "LOOP נעצר (pid=$$)"; exit 0' TERM INT
  while true; do
    bash "$0" >/dev/null 2>&1 || log "WARN מחזור-נכשל (exit=$?)"
    sleep 60
  done
fi

# שמירת-נפח-לוג (5MB)
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 5000000 ] && tail -c 1000000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

# ── 0) כספת: אם-.env.local נמחק (קציר) וה-PAT קיים — unseal עצמאי ──
if [ ! -s /home/z/.secrets/.env.local ] && [ -s /home/z/my-project/upload/pat.env ]; then
  log "VAULT חסר — מריץ auto-unseal מהגיט"
  if [ ! -d /tmp/vault-home/.git ]; then
    PAT=$(tr -d '[:space:]' < /home/z/my-project/upload/pat.env)
    git clone -q "https://x-access-token:${PAT}@github.com/roshpinacare-sys/vault-home.git" /tmp/vault-home 2>/dev/null \
      || log "WARN clone-כספת-נכשל"
  fi
  [ -d /tmp/vault-home/.git ] && (cd /tmp/vault-home && VAULT_ALLOW_DISCOVERY=1 bash auto-unseal.sh >> "$LOG" 2>&1 \
    && cp /tmp/.env.local /home/z/.secrets/.env.local 2>/dev/null && chmod 600 /home/z/.secrets/.env.local 2>/dev/null \
    && log "VAULT נפרס → /home/z/.secrets/.env.local")
fi

# ── 1) סקר-HTTP אמיתי לעורקים הקריטיים ──
check() { # $1=port $2=path $3=name
  curl -s -o /dev/null -m 6 -w '%{http_code}' "http://127.0.0.1:$1$2" 2>/dev/null
}
declare -A ARTERY=( [3000]="/|console" [3010]="/saos-dex/api/dex/state|dex" [3016]="/health|economy" )

for port in 3000 3010 3016; do
  IFS='|' read -r path name <<< "${ARTERY[$port]}"
  code=$(check "$port" "$path" "$name")
  alive="no"; case "$code" in 200|301|302|404) alive="yes";; esac
  prev=$(grep "^${port}=" "$STATE" 2>/dev/null | cut -d= -f2- || echo "ok")
  if [ "$alive" = "yes" ]; then
    [ "$prev" != "ok" ] && log "RECOVER $name:$port חזר (code=$code) — סוגר-פרק"
    grep -v "^${port}=" "$STATE" 2>/dev/null > "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; echo "${port}=ok" >> "$STATE"
  else
    failn=1; [ "$prev" = "fail1" ] && failn=2
    grep -v "^${port}=" "$STATE" 2>/dev/null > "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; echo "${port}=fail${failn}" >> "$STATE"
    if [ "$failn" = "2" ]; then
      # שני-סקרים-כושלים-רצופים → הרגת-המחזיק-את-הפורט
      holder=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1)
      if [ -n "$holder" ]; then
        log "KILL $name:$port לא-מגיב-2-סקרים (code=$code) — הורג pid=$holder (המשגיח-יקים)"
        kill "$holder" 2>/dev/null; sleep 2; kill -9 "$holder" 2>/dev/null
      else
        log "WARN $name:$port לא-מגיב-ואין-מחזיק-מאזין — המשגיח-יקים-לבד"
      fi
    else
      log "FAIL1 $name:$port לא-מגיב (code=$code) — סקר-שני-יכריע"
    fi
  fi
done
exit 0
