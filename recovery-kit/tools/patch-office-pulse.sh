#!/usr/bin/env bash
# patch-office-pulse.sh — surgical fix for Domain/.github/workflows/office-pulse.yml
# Two defects, measured 2026-10-13 (office book stale since 11:26:15Z while the
# world beats every ~4min):
#   D1: publish push-retry budget 3×3s loses races against the worldbeat writers
#       (a commit lands on main every ~4min) → PUSH-FAILED → exit 1 → failure email
#       every 20min, and the office book stops landing (the "office collapse" the
#       owner saw on Pages).
#   D2: the self-relay step SLEEPS up to 30min INSIDE the run while HOLDING the
#       `domain-office-writers` concurrency lock — starving pulse-twin (10min
#       timeout) and the 2h writers queued on the same group → their timeouts →
#       more failure emails ("blockages every few minutes").
# Fix: D1 → 8 attempts with 8–18s jittered backoff + --autostash rebase; and a
# PUSH-FAILED that DEFERS (exit 0 with a named terminal) instead of storming,
# because the next cron flight re-lands the book (the book is the loud layer).
# D2 → dispatch the relay IMMEDIATELY (the cron keeps its own cadence; the relay
# is redundancy, not the clock) — the lock is released ~30min earlier each run.
set -euo pipefail
F="${1:-.github/workflows/office-pulse.yml}"
[ -f "$F" ] || { echo "ERR: $F not found (run from Domain checkout root)"; exit 2; }
cp "$F" "$F.pre-immune-system.bak"

python3 - "$F" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
orig = s

# D1: widen the publish retry loop
s = s.replace("sleep 3\n", "sleep $((8 + RANDOM % 10))\n")          # jittered backoff
s = s.replace("for i in 1 2 3", "for i in 1 2 3 4 5 6 7 8")          # 3 -> 8 attempts
s = s.replace("git pull --rebase -q origin main",
              "git pull --rebase --autostash -q origin main")
# D1b: PUSH-FAILED defers honestly instead of failing the run (next cron re-lands the book)
s = s.replace('if [ "$ok" != "1" ]; then echo "PUSH-FAILED"; exit 1; fi',
              'if [ "$ok" != "1" ]; then echo "named terminal: publish-deferred — book on disk, next :09/:29/:49 flight re-lands it"; exit 0; fi')

# D2: release the writers lock immediately — dispatch now, no in-run sleep
s = re.sub(r"next=\$\(\( \(now / 1800 \+ 1\) \* 1800 \)\)\n\s*wait=\$\(\( next - now \)\)\n\s*\[ \"\$wait\" -gt 0 \] \|\| wait=60",
           "wait=5", s)
s = s.replace('echo "relay: sleeping ${wait}s until next half-hour boundary"',
              'echo "relay: dispatching immediately (cron keeps cadence; relay is redundancy, not the clock) — lock released now"')

if s == orig:
    print("WARN: no bytes changed — patterns already patched or drifted; inspect manually")
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s)
print("patched: retry 8x jittered+autostash, PUSH-FAILED->defer, relay dispatches immediately")
PY

git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git diff --stat -- "$F" || true
