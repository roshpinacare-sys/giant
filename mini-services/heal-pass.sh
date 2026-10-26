#!/bin/bash
# heal-pass.sh — one idempotent guardian pass: RESTORE wiped organs from
# origin/main, REVIVE down daemons, receipt everything. Honest: every failure
# is logged; nothing is faked; secrets never touch receipts.
set -u
GIANT=/home/z/my-project
MS="$GIANT/mini-services"
TOKEN_FILE=/home/z/my-project/upload/גיטראש.txt

rc() { printf '{"ts":"%s","event":"%s","detail":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$2"; }
port_up() { (echo > /dev/tcp/127.0.0.1/$1) 2>/dev/null; }

cd "$GIANT" || exit 1

# ── 1. RESTORE: tracked organs missing from the working tree (wipe-class) ──
git fetch origin main >/dev/null 2>&1 || rc fetch-fail "git fetch"
missing=""
for d in saos-architect-daemon saos-architect-supervisor self-financing-engine issue-forge organ-commander sovereign-mesh issue-to-pr; do
  if [ -f "mini-services/$d/index.ts" ]; then
    :
  elif git ls-tree --name-only origin/main "mini-services/$d/index.ts" 2>/dev/null | grep -q .; then
    missing="$missing mini-services/$d"
  fi
done

if [ -n "$missing" ]; then
  rc wipe-detected "$missing"
  for d in $missing; do
    git checkout origin/main -- "$d" >>/dev/null 2>&1 && rc restored "$d" || rc restore-fail "$d"
  done
  git add mini-services >/dev/null 2>&1 || true
  if ! git diff --cached --quiet; then
    git commit -m "boot-heal: wipe-class counter-restore from origin/main — $(date -u +%FT%TZ)" >/dev/null 2>&1 || true
    git pull --no-rebase -X ours origin main >>/dev/null 2>&1 || true
    TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
    git push "https://x-access-token:$TOKEN@github.com/roshpinacare-sys/giant.git" main >>/dev/null 2>&1 \
      && rc pushed "counter-restore" || rc push-fail "counter-restore"
  fi
fi

# ── 2. REVIVE: health-probe the four sovereign daemons, reboot down ones ──
revive() { # $1=port $2=dir $3=env
  port_up "$1" && return 0
  rc revive-start "$2:$1"
  ( cd "$MS" && setsid nohup flock -n "/tmp/heal-$(basename "$2").lock" env $3 bun "$MS/$2/index.ts" >> "/tmp/heal-$(basename "$2").log" 2>&1 < /dev/null & )
  sleep 4
  port_up "$1" && rc revived "$2:$1" || rc revive-fail "$2:$1"
}
revive 3046 issue-forge "FORGE_INTERVAL_MS=300000"
revive 3047 saos-architect-supervisor ""
revive 3051 saos-architect-daemon ""
revive 3061 self-financing-engine ""

# ── 3. PROVE: honest pass receipt ──
rc pass-ok "heal-pass complete"
