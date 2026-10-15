#!/usr/bin/env bash
# ============================================================================
# AIR-GAP PREPARE — one honest path from "no local brain" to "slot armed".
#   1. probe the host (cgroup-truth)
#   2. compute the llama.cpp tier that FITS it
#   3. HEAD-verify the model URL on Hugging Face (honest reachability check)
#   4. download the GGUF unless --no-download (resumable, curl -C -)
#   5. print exactly how to arm the gateway's local-llm slot (:8080)
# The llama-server binary itself is NOT downloaded here — install llama.cpp
# once (official releases or package manager) and point LLAMA_SERVER_BIN at
# it, or put `llama-server` on PATH. No spoofing, no mirror games.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NO_DOWNLOAD=0
[[ "${1:-}" == "--no-download" ]] && NO_DOWNLOAD=1

bash "$HERE/llama-host-config.sh"
# shellcheck disable=SC1091
source "$HERE/llama-host.env"

url="https://huggingface.co/${AIRGAP_MODEL_REPO}/resolve/main/${AIRGAP_MODEL_FILE}"
echo "[airgap] HEAD $url"
code=$(curl -sIL -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)
if [[ "$code" != "200" && "$code" != "302" ]]; then
  echo "[airgap] HONEST: model URL unreachable from this network (HTTP $code)."
  echo "[airgap] The config stays armed; download manually on any connected machine:"
  echo "[airgap]   curl -L -C - -o '$HERE/models/${AIRGAP_MODEL_FILE}' '$url'"
  exit 2
fi
echo "[airgap] URL reachable (HTTP $code)"

if (( NO_DOWNLOAD )); then
  echo "[airgap] --no-download: stopping after verification (as ordered)."
  exit 0
fi

mkdir -p "$HERE/models"
echo "[airgap] downloading ${AIRGAP_MODEL_FILE} (resumable)…"
curl -L -C - --max-time 3600 -o "$HERE/models/${AIRGAP_MODEL_FILE}" "$url"
ls -lh "$HERE/models/${AIRGAP_MODEL_FILE}"

cat <<EOF

[airgap] NEXT STEPS (the only honest way to arm :8080):
  1. install llama.cpp (CPU build is enough for this tier):
       https://github.com/ggml-org/llama.cpp/releases  (or: cargo/pacman/apt per distro)
  2. source the tuned env and start the server:
       source "$HERE/llama-host.env"
       "$HERE/start-local-llm.sh"
  3. arm the sovereign gateway (it reads these at boot):
       export LOCAL_LLM_URL=http://127.0.0.1:8080/v1
       export LOCAL_LLM_MODELS=${AIRGAP_MODEL_NAME}
     (vault merge-deploy can persist both lines into .env.local)
  4. verify: curl -s http://127.0.0.1:3011/health | grep local-llm
EOF
