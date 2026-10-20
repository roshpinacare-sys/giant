#!/bin/bash
# push-waiter.sh — משגיח-הדחיפה (Task 21 · 2026-10-20): הפאט פג-תוקף והדחיפה-ל-giant
# חסומה. ברגע-שהבעלים מפיל פאט-חדש ל-upload/pat.env — הקומיטים-הממתינים זורמים
# לבד, עם-מדידה-כנה. אפס-סודות-בלוג. יוצא-0-כשנדחף-הכל.
ROOT=/home/z/my-project
LOG=$ROOT/state/push-waiter.log
say(){ echo "[$(date -u +%FT%TZ)] $*" >> "$LOG"; }
while true; do
  cd "$ROOT" || exit 1
  AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo "?")
  if [ "$AHEAD" = "0" ]; then say "מסונכרן — אין-מה-לדחוף. יוצא."; exit 0; fi
  if GIT_TERMINAL_PROMPT=0 git push origin main >>"$LOG" 2>&1; then
    say "נדחף בהצלחה ($AHEAD קומיטים). יוצא."
    exit 0
  fi
  say "דחיפה נכשלה ($AHEAD קומיטים ממתינים) — ניסיון חוזר בעוד 15דק׳ (כנות: הפאט עדיין לא חודש?)"
  sleep 900
done
