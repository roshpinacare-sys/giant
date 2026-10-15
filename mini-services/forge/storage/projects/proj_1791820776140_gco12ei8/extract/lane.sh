#!/usr/bin/env bash
# estate-lane-probe — measured probe on the sovereign device (zero GitHub minutes)
set -e
echo "[lane] device: $(uname -srm)"
echo "[lane] time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[lane] probing 2 estate feeds with real fetches…"
FE1=$(curl -s -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/data.json)
FE2=$(curl -s -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json)
echo "[lane] Domain/office/data.json => HTTP $FE1"
echo "[lane] FleetHQ/office/state/office-state.json => HTTP $FE2"
if [ "$FE1" = "200" ] && [ "$FE2" = "200" ]; then echo "[lane] RESULT: PASS — feeds reachable from device"; else echo "[lane] RESULT: FAIL — honest red"; exit 1; fi
