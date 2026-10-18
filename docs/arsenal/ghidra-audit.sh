#!/usr/bin/env bash
# ghidra-audit.sh — מסילת-ביקורת-בינארית ריבונית (Ghidra-headless · גל-93 · STAGED)
# שימוש: ghidra-audit.sh <binary> [out-dir]
# חוק-אמת-אספקה: לא-סומכים על-מה-שהבינארי טוען — בודקים מה-הוא עושה.
# כנות: דורש JDK 21+ ורשת-להורדה-ראשונה (~400MB). הצהרת-מצב מודפסת-כן.
set -euo pipefail

BIN="${1:?שימוש: ghidra-audit.sh <binary> [out-dir]}"
OUT="${2:-/home/z/my-project/receipts/ghidra}"
GH_DIR="/home/z/my-project/tools/ghidra"
GH_ZIP="$GH_DIR/ghidra_11.3.2_PUBLIC.zip"
GH_URL="https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.3.2_build/ghidra_11.3.2_PUBLIC_20250410.zip"
GH_HOME="$GH_DIR/ghidra_11.3.2_PUBLIC"

mkdir -p "$GH_DIR" "$OUT"

if [ ! -x "$GH_HOME/support/analyzeHeadless" ]; then
  echo "[ghidra-audit] STAGED: אין-התקנה-מקומית — מוריד (פעם-אחת, ~400MB)..."
  curl -L --fail -o "$GH_ZIP" "$GH_URL"
  unzip -q -o "$GH_ZIP" -d "$GH_DIR"
fi

echo "[ghidra-audit] מנתח: $BIN"
"$GH_HOME/support/analyzeHeadless" \
  "$GH_DIR/saos-audit-project" saos-audit \
  -import "$BIN" \
  -scriptPath "$GH_DIR/scripts" \
  -postScript ghidra-summary.py \
  -deleteProject \
  2>&1 | tee "$OUT/$(basename "$BIN").headless.log"

echo "[ghidra-audit] הדוח: $OUT/$(basename "$BIN").md"
