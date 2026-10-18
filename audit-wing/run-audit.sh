#!/usr/bin/env bash
# audit-wing/run-audit.sh — ביקורת-עצמאית חוזרת לרכבת-ה-LLM הריבונית.
# אפס-מפתחות-חוץ · אפס-טלמטריה · עדויות לגיט.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.venv/bin:$PATH"
export OPENAI_BASE_URL="http://127.0.0.1:3011/v1"
export OPENAI_API_KEY="sovereign-local"   # הרכבת הריבונית אינה דורשת-מפתח — שדה-טכני
export IFIXAI_TELEMETRY=0
STAMP="$(date -u +%Y%m%dT%H%MZ)"
echo "── ביקורת deterministic (קשוח · כיסוי-חלקי) ──"
ifixai run --provider openai -m auto --name "sovereign-gateway" \
  --suite essential --eval-mode deterministic --format both \
  -o "./ifixai-results" --timeout 60 --no-telemetry || true
echo "── ביקורת self-judge (מלא · מתויג-הטיה-עצמית) ──"
ifixai run --provider openai -m auto --name "sovereign-gateway-self-judge" \
  --suite essential --eval-mode self --format both \
  -o "./ifixai-results" --timeout 60 --no-telemetry || true
echo "── סיכום ──"
ls -t ifixai-results/*summary*.md | head -4
echo "STAMP=$STAMP"
