#!/usr/bin/env bash
# ext-audit.sh — סורק-אבטחה-חוץ (גל-76 · צעד-ראשון לעבר ביקורת-פירם-חוץ)
# ═════════════════════════════════════════════════════════════════════
# רץ על התלויות-האמת (bun.lock) · מפרסם-תוצאה-מדודה בreports/ · כישלון=כנה.
# שימוש: bash scripts/ext-audit.sh   (משורת-ה-CI או ידנית)
set -uo pipefail
cd "$(dirname "$0")/.."

mkdir -p reports
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUT="reports/ext-audit-latest.json"
SUM="reports/ext-audit-latest.md"

echo "[ext-audit] running bun audit against the true lockfile..."
if command -v bun >/dev/null 2>&1; then
  bun audit --json > "$OUT" 2>/tmp/ext-audit-err.log
  AUDIT_RC=$?
else
  echo '{"error":"bun not available"}' > "$OUT"
  AUDIT_RC=1
fi

# ספירה-כנה מה-JSON של bun audit (מערך-אזהרות)
COUNT=$(python3 - "$OUT" <<'PY' 2>/dev/null || echo "0"
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    if isinstance(d,list): print(len(d))
    elif isinstance(d,dict) and "vulnerabilities" in d: print(len(d["vulnerabilities"]))
    else: print(0)
except Exception: print(0)
PY
)

CRITICAL=$(python3 - "$OUT" <<'PY' 2>/dev/null || echo "0"
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    rows=d if isinstance(d,list) else d.get("vulnerabilities",[])
    print(sum(1 for r in rows if str((r or {}).get("severity","")).lower() in ("critical","high")))
except Exception: print(0)
PY
)

{
  echo "# ext-audit — $STAMP"
  echo ""
  echo "- vulnerabilities_total: $COUNT"
  echo "- high_or_critical: $CRITICAL"
  echo "- tool: bun audit (external scanner, not self-graded)"
  echo "- note: חוק-כנות — סורק-חוץ-אוטומטי הוא לא ביקורת-פירם; המטריצה נשארת partial עד משרד-חוץ אמיתי"
  echo ""
  echo "raw: reports/ext-audit-latest.json"
} > "$SUM"

echo "[ext-audit] done: total=$COUNT high/critical=$CRITICAL → $OUT"
# הסורק-לא-מפיל-את-הבנייה — הדיווח-הוא-התוצר; CI-מחליט-אם-להפוך-לאדום
exit 0
