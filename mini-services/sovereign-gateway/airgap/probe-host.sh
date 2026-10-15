#!/usr/bin/env bash
# ============================================================================
# AIR-GAP PROBE — measure THIS host the honest way (cgroup-aware).
# Sandboxes lie: nproc can report the host's cores while the cgroup allows 2.
# The cgroup limit wins whenever it is smaller. Writes host-capabilities.json
# next to this script. No network, no secrets, no content — numbers only.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cpu_cores() {
  # cgroup v2: "<quota> <period>" → cores = quota/period
  if [[ -r /sys/fs/cgroup/cpu.max ]]; then
    local q t
    read -r q t < /sys/fs/cgroup/cpu.max
    if [[ "$q" != "max" && "${t:-0}" -gt 0 ]]; then
      echo $(( q / t ))
      return
    fi
  fi
  nproc
}

mem_total_mb() {
  local total
  total=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [[ -r /sys/fs/cgroup/memory.max ]]; then
    local lim
    lim=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo max)
    if [[ "$lim" != "max" ]]; then
      lim=$(( lim / 1024 / 1024 ))
      (( lim > 0 && lim < total )) && total=$lim
    fi
  fi
  echo "$total"
}

mem_avail_mb() { awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo; }
disk_free_mb() { df -Pm "$HERE" | awk 'NR==2 {print $4}'; }
has_gpu() { compgen -G '/dev/nvidia*' > /dev/null && echo true || echo false; }

cat > "$HERE/host-capabilities.json" <<EOF
{
  "probed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cpu_cores": $(cpu_cores),
  "mem_total_mb": $(mem_total_mb),
  "mem_available_mb": $(mem_avail_mb),
  "disk_free_mb": $(disk_free_mb),
  "gpu": $(has_gpu)
}
EOF
cat "$HERE/host-capabilities.json"
