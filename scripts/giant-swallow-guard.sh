#!/usr/bin/env bash
# giant-swallow-guard.sh — לולאת-מגן-הבליעות הילידית של giant (§8 deadlock-break).
# ═════════════════════════════════════════════════════════════════════════════
# המחלקה-שנמדדה: ours-merge vault-sync בולע-קבצי-קנון מ-main (פעמיים-היום);
# "המטוס-המתוזמן-מת" — המגן-הזה הוא-הצופה-החי: מדידה כל-5 דק · שחזור-בליעות
# byte-identical-מ-blobs-מאומצים · דחיפת-FF-בלבד עם-אימות-חוזר · קבלות-hash-linked.
# חוקים: מופע-יחיד (flock+UNITY-GUARD) · אפס-כוח · SWARM_STATE לעולם-לא-נשחזר-
# בתוכן (רק-התראה) · ה-bash לא-מחליט — הליבה-הנבדקת (swallow-guard-cli.ts) מחליטה.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1
STATE_DIR="$REPO/state/swallow-guard"
LOG="$STATE_DIR/guard.jsonl"
RECEIPTS="$STATE_DIR/receipts.jsonl"
ADOPTED="$STATE_DIR/adopted.json"
CYCLE="${GSG_CYCLE:-300}"
mkdir -p "$STATE_DIR"

say() { printf '{"t":"%s","loop":"giant-swallow-guard","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG"; }

# ── שער-הסמכות: flock קודם (אטום-מירוצים) — המחזור-החי-מתוקן-חי: UNITY-לפני-flock
# יצר-מירוץ-הדדי (שני-מופעים-ראו-אחד-את-השני-ושניהם-יצאו, 16:06:18Z).
# הסדר-הנכון: flock-קודם = שער-סמכות; UNITY-אחריו = אבחון-בלבד (לעולם-לא-יציאה). ──
exec 9>"$STATE_DIR/.guard.lock" || exit 1
if ! flock -n 9; then
  say "LOCK: held — checking who holds it:"
  for pid in $(pgrep -f "bash .*giant-swallow-guard.sh" 2>/dev/null); do
    [ "$pid" != "$$" ] && say "  live guard found: pid $pid — exiting cleanly"
  done
  exit 0
fi
# אבחון-בלבד: אם-חיים-אחרים-בזמן-שאני-מחזיק-במנעול — הם-לא-מחזיקים-בו (רישום-כנה)
for pid in $(pgrep -f "bash .*giant-swallow-guard.sh" 2>/dev/null); do
  [ "$pid" != "$$" ] && say "UNITY-DIAG: foreign guard process $pid alive WITHOUT the lock (harmless, recorded)"
done
echo $$ > "$STATE_DIR/guard.pid"
say "guard armed (pid $$, cycle ${CYCLE}s, canonical-set=12, flock-authority=yes)"

# adopted.json — המקורות-המאומצים {path: blobSha, tip, at}
if [ ! -f "$ADOPTED" ]; then
  echo '{}' > "$ADOPTED"
  say "baseline empty — first cycle adopts the first all-present tip"
fi

receipt_chain_prev() { tail -1 "$RECEIPTS" 2>/dev/null | python3 -c "import json,sys
try: print(json.load(sys.stdin)['hash'])
except Exception: print('null')"; }

append_receipt() { # $1 = payload-json-string
  local at prev out
  at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  prev="$(receipt_chain_prev)"
  out="$(printf '{"mode":"receipt","at":"%s","prevHash":%s,"payload":%s}' "$at" "$prev" "$1" | bun "$REPO/scripts/swallow-guard-cli.ts")" || { say "receipt-cli-failed"; return 1; }
  printf '%s\n' "$out" >> "$RECEIPTS"
  printf '%s' "$out" | python3 -c "import json,sys; print(json.load(sys.stdin)['hash'])" 2>/dev/null
}

measure_tip() { # פלט: JSON {path: blobSha|""} — "" = נעדר
  python3 - "$@" << 'PYEOF'
import json, subprocess, sys
paths = sys.argv[1:]
tree = {}
for p in paths:
    r = subprocess.run(["git", "rev-parse", "--verify", "-q", f"origin/main:{p}"],
                       capture_output=True, text=True)
    tree[p] = r.stdout.strip() if r.returncode == 0 else ""
print(json.dumps(tree))
PYEOF
}

CYCLE_N=0
while true; do
  CYCLE_N=$((CYCLE_N+1))
  git fetch origin main --quiet 2>>"$LOG" || { say "fetch-failed (network) — honest skip"; sleep "$CYCLE"; continue; }
  TIP="$(git rev-parse origin/main)"
  # הרשימה-נשאבת-מהליבה-עצמה (מקור-אמת-יחיד):
  PATHS="$(bun -e "import {CANONICAL_SET} from '$REPO/src/lib/sovereign/swallow-guard.ts'; console.log(CANONICAL_SET.join(' '))")"
  TREE="$(measure_tip $PATHS)"
  ADOPTED_MAP="$(python3 -c "import json; d=json.load(open('$ADOPTED')); d.pop('tip',None); d.pop('at',None); print(json.dumps(d))")"
  OUT="$(printf '{"mode":"measure","tree":%s,"baseline":%s,"adopted":%s}' "$TREE" "$ADOPTED_MAP" "$ADOPTED_MAP" | bun "$REPO/scripts/swallow-guard-cli.ts")" || { say "measure-cli-failed"; sleep "$CYCLE"; continue; }
  NSWALLOW="$(printf '%s' "$OUT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['swallows']))")"
  NALERT="$(printf '%s' "$OUT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['alerts']))")"

  if [ "$NSWALLOW" = "0" ]; then
    # אימוץ-baseline רק-מ-tip-שלם (כל-הקנון-נוכח): האבולוציה-הלגיטימית-הופכת-המאומץ-החדש
    ALLPRESENT="$(printf '%s' "$TREE" | python3 -c "import json,sys; t=json.load(sys.stdin); print(1 if all(v for v in t.values()) else 0)")"
    if [ "$ALLPRESENT" = "1" ]; then
      printf '%s\n' "$TREE" | python3 -c "import json,sys; d=json.load(sys.stdin); d['tip']='$TIP'; d['at']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'; json.dump(d, open('$ADOPTED','w'))"
    fi
    if [ "$NALERT" != "0" ]; then
      say "cycle $CYCLE_N: tip ${TIP:0:9} — 0 swallows · $NALERT content-drift ALERTS (logged, never fought)"
    else
      say "cycle $CYCLE_N: tip ${TIP:0:9} — canonical intact (0 swallows, 0 alerts)"
    fi
    sleep "$CYCLE"; continue
  fi

  # ── בליעות-זוהו: ביצוע-תוכנית-השחזור-מהליבה ──
  PLANERR="$(printf '%s' "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['planError'] or '')")"
  if [ -n "$PLANERR" ]; then
    say "cycle $CYCLE_N: $NSWALLOW swallows but rescue REFUSED: $PLANERR (fail-closed — no invented content)"
    append_receipt "{\"cycle\":$CYCLE_N,\"tip\":\"$TIP\",\"verdict\":\"RESCUE-REFUSED\",\"planError\":\"$PLANERR\"}" >/dev/null
    sleep "$CYCLE"; continue
  fi
  say "cycle $CYCLE_N: SWALLOW STORM — $NSWALLOW canonical paths absent at ${TIP:0:9}: executing tested rescue plan"
  WORKTREE="/tmp/gsg-rescue-$$"
  git worktree add --detach "$WORKTREE" origin/main --quiet 2>>"$LOG" || { say "worktree-add-failed"; sleep "$CYCLE"; continue; }
  RESCUED=""
  OK_ALL=1
  while IFS=$'\t' read -r path from; do
    [ -z "$path" ] && continue
    BLOB="${from#blob:}"
    if git cat-file -e "$BLOB" 2>/dev/null; then
      mkdir -p "$WORKTREE/$(dirname "$path")"
      git cat-file blob "$BLOB" > "$WORKTREE/$path" && RESCUED="$RESCUED $path"
    else
      say "adopted blob $BLOB missing for $path — refusing partial rescue"; OK_ALL=0
    fi
  done < <(printf '%s' "$OUT" | python3 -c "import json,sys
for a in json.load(sys.stdin)['plan']: print(a['path']+'\t'+a['from'])")
  if [ "$OK_ALL" != "1" ] || [ -z "$RESCUED" ]; then
    say "rescue aborted (nothing restored or missing source) — honest skip"; git worktree remove --force "$WORKTREE" 2>>"$LOG"; sleep "$CYCLE"; continue
  fi
  ( cd "$WORKTREE" && git add -A && git commit -q -m "fix(guard): rescue$RESCUED — byte-identical reland from adopted blobs (swallow-census cycle $CYCLE_N)

- ours-merge wipe class measured again: canonical paths absent at tip
- rescue plan emitted by the tested core (src/lib/sovereign/swallow-guard.ts)
- byte-identical blobs from adopted baseline; zero invented content
- receipt: state/swallow-guard/receipts.jsonl (hash-linked)" ) || { say "commit-failed"; git worktree remove --force "$WORKTREE" 2>>"$LOG"; sleep "$CYCLE"; continue; }
  # דחיפת-FF-בלבד (אפס-כוח): push רגיל נדחה אוטומטית אם origin התקדם → מדידה כנה במחזור הבא
  if git -C "$WORKTREE" push origin HEAD:main 2>>"$LOG"; then
    H="$(append_receipt "{\"cycle\":$CYCLE_N,\"tip\":\"$TIP\",\"verdict\":\"RESCUED\",\"paths\":\"$RESCUED\"}")"
    say "RESCUED$RESCUED — pushed FF, receipt ${H:0:12}"
  else
    say "push-failed (race) — will re-measure next cycle (honest skip, no force)"
  fi
  git worktree remove --force "$WORKTREE" 2>>"$LOG" || true
  sleep "$CYCLE"
done
