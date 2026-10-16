#!/bin/bash
# diagnose-failures.sh · משיכת-תקצירי-כשל-מכל-הריפואים (T75-3)
TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep "^password=" | cut -d= -f2)
declare -A CASES=(
  ["Sandbox"]="compute-canary"
  ["roshpina"]="controls-audit"
  ["saos-dex"]="identity-guard"
  ["Adsmarket"]="claims-guard"
  ["anchor-baseline"]="baseline-integrity"
  ["Defi"]="canary"
)
for repo in "${!CASES[@]}"; do
  wf="${CASES[$repo]}"
  echo "════ $repo · $wf ════"
  RUN=$(curl -s "https://api.github.com/repos/roshpinacare-sys/$repo/actions/workflows/$wf.yml/runs?per_page=1" -H "Authorization: token $TOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('workflow_runs',[{}])[0]; print(r.get('id',''))" 2>/dev/null)
  [ -z "$RUN" ] && { echo "  no run id"; continue; }
  # הצעד-הנכשל מתוך-ה-jobs
  curl -s "https://api.github.com/repos/roshpinacare-sys/$repo/actions/runs/$RUN/jobs" -H "Authorization: token $TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for j in d.get('jobs', []):
    for s in j.get('steps', []):
        if s.get('conclusion') == 'failure':
            print(f\"  failed step: {s['name']}\")
" 2>/dev/null
  # תקציר-היומן (200-התווים-האחרונים-של-מה-שסביב-הכשל)
  curl -sL "https://api.github.com/repos/roshpinacare-sys/$repo/actions/runs/$RUN/logs" -H "Authorization: token $TOKEN" -o /tmp/$repo-logs.zip 2>/dev/null
  if [ -s /tmp/$repo-logs.zip ]; then
    unzip -p /tmp/$repo-logs.zip "*_*.txt" 2>/dev/null | grep -iE "error|fail|denied|missing|invalid|exit code" | head -4 | sed 's/^/  log: /' | cut -c1-180
  else
    echo "  (no log access)"
  fi
done
