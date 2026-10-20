#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# boot-selfheal.sh — חוק-הרפואה-העצמית של האורגניזם (גל-93 · 2026-10-20)
# ═══════════════════════════════════════════════════════════════════════
# השיעור-שנמדד-בקציר-2026-10-20T03:21Z: הפלטפורמה החייתה את my-project אבל
# לא את השכבות-החיות מחוץ-לעץ-הפרויקט — הכספת נשארה fail-closed (steem-voice
# אילם), עוזר-האישורים אבד (אף-דחיפה לא יוצאת), המבקר איבד את ifixai, והדקס
# עלה genesis-ריק בזמן שעדות-הגיט החזיקה h=828K. המערכת "התקפלה על עצמה".
# החוק-החדש: הסקריפט הזה רץ בכל-אתחול (idempotent, אפס-נזק-אם-הכל-תקין)
# ומרפא-את-כל-ארבעת-הפצעים-המוכחים-בעצמו. fail-honest: כל-שלב מדווח,
# שום-כשל לא מזויף כהצלחה.
# ═══════════════════════════════════════════════════════════════════════
set -u
ROOT="/home/z/my-project"
LOG="$ROOT/state/boot-selfheal.log"
mkdir -p "$ROOT/state"
say(){ echo "[$(date -u +%FT%TZ)] $*" >> "$LOG"; }

# ── 1) הכספת: אם /home/z/.secrets/.env.local חסר — פותחים-לבד מ-vault-home ──
if [ ! -s /home/z/.secrets/.env.local ]; then
  say "selfheal-1: הכספת חסרה — פתיחה-אוטונומית מ-vault-home"
  rm -rf /tmp/vault-selfheal
  # שיעור-2026-10-20: ה-egress-משותף נתקל-בהגבלת-קצב-אנונימית → ניסיונות-חוזרים
  CLONE_OK=0
  for attempt in 1 2 3; do
    if git clone -q --depth 1 "https://github.com/roshpinacare-sys/vault-home.git" /tmp/vault-selfheal 2>>"$LOG"; then CLONE_OK=1; break; fi
    say "selfheal-1: ניסיון-שיבוט $attempt נכשל (הגבלת-קצב/רשת?) — ממתין 20ש׳"
    sleep 20
  done
  if [ "$CLONE_OK" = "1" ]; then
    if VAULT_ALLOW_DISCOVERY=1 bash /tmp/vault-selfheal/auto-unseal.sh >>"$LOG" 2>&1; then
      # הפריסה ב-layout-standalone נופלת ל-$(dirname של-השיבוט) — מאתרים-את-.env.local-שנוצר
      DEPLOYED=""
      for cand in /tmp/.env.local /tmp/vault-selfheal/.env.local "$(dirname "$(cd /tmp/vault-selfheal && pwd)")"/.env.local; do
        [ -s "$cand" ] && grep -qE "^[A-Z_]+=.+" "$cand" 2>/dev/null && { DEPLOYED="$cand"; break; }
      done
      if [ -n "$DEPLOYED" ]; then
        mkdir -p /home/z/.secrets
        cp "$DEPLOYED" /home/z/.secrets/.env.local
        chmod 600 /home/z/.secrets/.env.local
        say "selfheal-1: כספת נפרסה מ-$DEPLOYED → /home/z/.secrets/.env.local (600)"
      else
        say "selfheal-1 WARN: unseal עבר אך אף-.env.local לא-נמצא — fail-honest"
      fi
      # מפתחות-הצבא (שכבת-0.5 של-חוק-השחזור): טביעת-אצבע מול worklog
      mkdir -p /home/z/.secrets/steem
      for f in army-keys.json exec-armed.json headcorner.key; do
        curl -sS -m 30 -H "Authorization: Bearer $(tr -d '[:space:]' < "$ROOT/upload/pat.env" 2>/dev/null)" \
          "https://raw.githubusercontent.com/roshpinacare-sys/steem/main/.secrets/$f" \
          -o "/home/z/.secrets/steem/$f" 2>/dev/null
        sz=$(stat -c%s "/home/z/.secrets/steem/$f" 2>/dev/null || echo 0)
        [ "$sz" -gt 8 ] || rm -f "/home/z/.secrets/steem/$f"
      done
      chmod 700 /home/z/.secrets/steem 2>/dev/null; chmod 600 /home/z/.secrets/steem/* 2>/dev/null
      # מנוחת-הקול: אם-steem-voice-חי-והוא-fail-closed — מחזרים-אותו-כדי-שיקרא-את-הכספת
      if curl -s -m 3 "http://127.0.0.1:3023/health" 2>/dev/null | grep -q "fail-closed"; then
        say "selfheal-1: steem-voice fail-closed — מחזור-תהליך לקריאת-הכספת"
        for p in $(ss -tlnp 2>/dev/null | grep ":3023" | grep -oP 'pid=\K[0-9]+' | sort -u); do kill "$p" 2>/dev/null; done
        sleep 2
        (cd "$ROOT/mini-services/steem-voice" && setsid nohup bun --hot index.ts >> /tmp/steem-voice.log 2>&1 < /dev/null &)
      fi
    else
      say "selfheal-1 WARN: auto-unseal נכשל — הכספת נשארת סגורה (fail-honest, כנות-מלאה)"
    fi
  else
    say "selfheal-1 WARN: שיבוט vault-home נכשל — fail-honest"
  fi
else
  say "selfheal-1: כספת נוכחת — לא-נוגעים"
fi

# ── 2) עוזר-אישורי-הגיט (פר-ריפו-בלבד! שיעור-2026-04-20: עוזר-גלובלי-עם-טוקן-מת
# מרעיל-גם-שיבוטים-פומביים-כשה-IP-מוגבל-קצב — לכן-מחווטים-מקומית-ב-my-project-בלבד) ──
if [ -z "$(git -C "$ROOT" config credential.helper 2>/dev/null)" ]; then
  mkdir -p /home/z/.gitcred
  cat > /home/z/.gitcred/cred.sh <<'CREDEOF'
#!/bin/sh
# sovereign credential helper (פרוטוקול-git-credential: get) — קורא-PAT-בזמן-ריצה
case "$1" in
  get)
    f=/home/z/my-project/upload/pat.env
    v=$(grep -hE '^[A-Za-z_]+=.' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d ' ')
    [ -n "$v" ] || v=$(grep -hvE '^\s*(#|$)' "$f" 2>/dev/null | head -1 | tr -d '"' | tr -d ' ')
    echo "username=x-access-token"
    echo "password=$v"
    ;;
esac
CREDEOF
  cat > /home/z/.gitcred/askpass.sh <<'ASKEOF'
#!/bin/sh
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) grep -hvE '^\s*(#|$)' /home/z/my-project/upload/pat.env 2>/dev/null | head -1 | tr -d '"' | tr -d ' ' ;;
  *) echo ;;
esac
ASKEOF
  chmod 700 /home/z/.gitcred/cred.sh /home/z/.gitcred/askpass.sh
  git -C "$ROOT" config credential.helper '!/home/z/.gitcred/cred.sh'
  say "selfheal-2: עוזר-אישורים חווב (מקומי-my-project · לא-גלובלי — מניעת-הרעלה)"
else
  say "selfheal-2: עוזר-אישורים נוכח — לא-נוגעים"
fi

# ── 3) מפתחות-ssh-ריבוניים (Tier-1 — לעולם-לא-פגים; מכסה saos-dex/FleetHQ/fleet-vault/steem) ──
if [ ! -x /home/z/.secrets/ssh/tool/git-ssh-shim.mjs ] && [ -f /home/z/.secrets/.env.local ]; then
  say "selfheal-3: מפתחות-ssh חסרים — חילוץ-מהכספת"
  rm -rf /tmp/vault-selfheal2
  git clone -q --depth 1 "https://github.com/roshpinacare-sys/vault-home.git" /tmp/vault-selfheal2 2>>"$LOG" || true
  if [ -f /tmp/vault-selfheal2/ssh-keys.tar.enc ] && [ -f /tmp/vault-selfheal2/.session-pass ]; then
    P=$(cat /tmp/vault-selfheal2/.session-pass 2>/dev/null)
    if [ -n "$P" ] && VAULT_PASSPHRASE="$P" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
        -in /tmp/vault-selfheal2/ssh-keys.tar.enc -out /tmp/ssh-keys.tar -pass env:VAULT_PASSPHRASE 2>>"$LOG"; then
      mkdir -p /home/z/.secrets/ssh
      tar -xf /tmp/ssh-keys.tar -C /home/z/.secrets/ssh
      chmod 700 /home/z/.secrets/ssh; chmod 600 /home/z/.secrets/ssh/deploy_* 2>/dev/null
      say "selfheal-3: מפתחות-deploy שוחזרו ל-/home/z/.secrets/ssh (shim כלול)"
    else
      say "selfheal-3 WARN: פתיחת-ssh-keys.tar.enc נכשלה — fail-honest"
    fi
  else
    say "selfheal-3 WARN: .session-pass חסר בשיבוט-טרי (ה-session-pass נוצר-רק-ב-unseal-ראשון) — מפתחות-ssh ייגזרו-ב-selfheal-1-הבא או-ידנית"
  fi
  rm -rf /tmp/vault-selfheal2 /tmp/ssh-keys.tar
else
  say "selfheal-3: מפתחות-ssh נוכחים (או-אין-כספת-עדיין) — לא-נוגעים"
fi

# ── 4) המבקר-הריבוני: ifixai חייב להיות קיים (אבד-בקציר) ───────────────────
if ! python3 -c "import ifixai" >/dev/null 2>&1; then
  say "selfheal-4: ifixai חסר — התקנה-מחדש (PyPI)"
  python3 -m pip install -q ifixai==4.2.0 >>"$LOG" 2>&1 && say "selfheal-4: ifixai 4.2.0 הותקן" || say "selfheal-4 WARN: התקנת-ifixai נכשלה — המבקר ימשיך fail-honest"
else
  say "selfheal-4: ifixai נוכח — לא-נוגעים"
fi

say "selfheal: הסתיים-מחזור"
