#!/usr/bin/env bash
# RUN-KIT.sh — one-shot immune-system installation for the sovereign network.
# Run this from ANY machine that has: git + gh (or a PAT) + write access to the
# org repos. Idempotent; parallel-agent-safe (rebase-before-push, agent-scoped
# paths, defers on race-loss instead of failing).
#
# Usage:
#   ESTATE_ROOT=/path/to/clones bash RUN-KIT.sh
#   (ESTATE_ROOT defaults to ./estate; creates missing shallow clones itself)
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
ESTATE_ROOT="${ESTATE_ROOT:-$KIT_DIR/estate}"
OWNER="roshpinacare-sys"
REPOS=(FleetHQ Domain)   # FleetHQ: new files; Domain: office-pulse surgery
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TRACE="1a1374da43d52c39"

echo "== immune-system kit @ $STAMP (trace $TRACE) =="
mkdir -p "$ESTATE_ROOT"

sync_repo() { # name -> shallow clone or fast-forward
  local r="$1" d="$ESTATE_ROOT/$r"
  if [ ! -d "$d/.git" ]; then
    if git clone --depth 3 "https://github.com/$OWNER/$r.git" "$d" 2>/dev/null; then echo "  $r: cloned"
    else echo "  $r: CLONE FAILED (auth/network) — aborting kit"; exit 3; fi
  else
    git -C "$d" pull --rebase --autostash -q origin main 2>/dev/null || { echo "  $r: pull race — retrying once"; sleep 10; git -C "$d" pull --rebase --autostash -q origin main; }
  fi
}

push_repo() { # name msg -> push with race-tolerant retries
  local r="$1" msg="$2" d="$ESTATE_ROOT/$r"
  git -C "$d" add -A
  if git -C "$d" diff --cached --quiet; then echo "  $r: nothing to commit (already installed)"; return 0; fi
  git -C "$d" commit -q -m "$msg [trace $TRACE]"
  local ok=0
  for i in 1 2 3 4 5 6 7 8; do
    if git -C "$d" pull --rebase --autostash -q origin main && git -C "$d" push -q origin main 2>/dev/null; then ok=1; echo "  $r: PUSHED (attempt $i)"; break; fi
    echo "  $r: push race attempt $i — rebase retry"; sleep $((8 + RANDOM % 10))
  done
  [ "$ok" = "1" ] || { echo "  $r: named terminal: push-deferred — committed locally, next kit run re-lands"; }
}

# ---- 1. FleetHQ: the immune system (selfscan + triage + law + assets) ----
echo "== [1/2] FleetHQ: installing sovereign selfscan + claims triage =="
sync_repo FleetHQ
FH="$ESTATE_ROOT/FleetHQ"
mkdir -p "$FH/.github/workflows" "$FH/assets/sovereign" "$FH/GOVERNANCE"
cp "$KIT_DIR/sovereign-selfscan.yml"   "$FH/.github/workflows/sovereign-selfscan.yml"
cp "$KIT_DIR/claims-triage.yml"        "$FH/.github/workflows/claims-triage.yml"
cp "$KIT_DIR/assets/sovereign/selfscan.mjs" "$FH/assets/sovereign/selfscan.mjs"
cp "$KIT_DIR/assets/sovereign/triage.mjs"   "$FH/assets/sovereign/triage.mjs"
cp "$KIT_DIR/anti-storm-law.md"        "$FH/GOVERNANCE/anti-storm-law.md"
push_repo FleetHQ "immune-system: sovereign-selfscan + claims-triage + anti-storm law (keyless, deduped escalation, quarantine powers)"

# ---- 2. Domain: office-pulse surgery (unlock + race-proof publish) ----
echo "== [2/2] Domain: office-pulse surgery =="
sync_repo Domain
DM="$ESTATE_ROOT/Domain"
mkdir -p "$DM/tools"
cp "$KIT_DIR/tools/patch-office-pulse.sh" "$DM/tools/patch-office-pulse.sh"
chmod +x "$DM/tools/patch-office-pulse.sh"
( cd "$DM" && bash tools/patch-office-pulse.sh .github/workflows/office-pulse.yml )
push_repo Domain "office-pulse surgery: race-proof publish (8x jittered retries, defer-not-fail) + release writers lock (dispatch-now relay) — fixes stale book + blockage-email storm [trace $TRACE]"

echo "== verification =="
if command -v gh >/dev/null 2>&1; then
  ( cd "$FH" && gh workflow run sovereign-selfscan.yml --ref main && echo "  selfscan dispatch: OK" ) || echo "  selfscan dispatch failed — run it manually from the Actions tab"
  echo "  watch: $(gh run list -R $OWNER/FleetHQ --workflow sovereign-selfscan.yml --limit 1 2>/dev/null || echo 'Actions tab')"
else
  echo "  gh not found — trigger 'sovereign-selfscan' manually from the FleetHQ Actions tab (Run workflow)."
fi
echo "== done. The network now: scans itself hourly, claims every red, decides autonomously, escalates ONE issue per new signature. =="
