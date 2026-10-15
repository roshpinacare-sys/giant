#!/usr/bin/env bash
# ============================================================================
# AIR-GAP START — boot llama-server on :8080 with the host-tuned flags.
# The sovereign gateway auto-arms its local-llm slot the moment
# LOCAL_LLM_URL exists (it reads .env.local / environment at boot).
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HERE/llama-host.env" ]] || bash "$HERE/llama-host-config.sh" > /dev/null
# shellcheck disable=SC1091
source "$HERE/llama-host.env"

BIN="${LLAMA_SERVER_BIN:-llama-server}"
if ! command -v "$BIN" > /dev/null 2>&1; then
  echo "[airgap] HONEST: '$BIN' not found. Install llama.cpp first (see prepare-airgap.sh step 1),"
  echo "[airgap] or set LLAMA_SERVER_BIN=/path/to/llama-server"
  exit 1
fi

MODEL="$HERE/models/${AIRGAP_MODEL_FILE}"
[[ -f "$MODEL" ]] || { echo "[airgap] model missing: $MODEL — run prepare-airgap.sh" >&2; exit 1; }

flags=(--model "$MODEL" --host 127.0.0.1 --port 8080 --threads "$AIRGAP_THREADS" --ctx-size "$AIRGAP_CTX" --batch-size 512)
if (( AIRGAP_GPU_LAYERS > 0 )); then
  flags+=(--n-gpu-layers "$AIRGAP_GPU_LAYERS")
fi

echo "[airgap] starting llama-server on :8080 (${AIRGAP_MODEL_NAME}, threads=$AIRGAP_THREADS ctx=$AIRGAP_CTX)"
exec "$BIN" "${flags[@]}"
