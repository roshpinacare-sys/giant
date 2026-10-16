# AIR-GAP KIT — the sovereign offline tier (honest state)

Goal: keep the office's core loop alive when the outside network is gone.
The gateway already has the slot — it arms the `local-llm` brain the moment
`LOCAL_LLM_URL` exists in the environment (see `../.env.example`). This kit
prepares that local brain **tuned to the measured host**, not to a fantasy.

## Files

| file | role |
|---|---|
| `probe-host.sh` | measures CPU/RAM/disk/GPU the cgroup-honest way → `host-capabilities.json` |
| `llama-host-config.sh` | picks the GGUF tier that FITS the measurement → `llama-host.env` |
| `prepare-airgap.sh` | probe → config → HEAD-verify → (resumable) download → exact arming steps |
| `start-local-llm.sh` | boots `llama-server` on `:8080` with the tuned flags |

## Tier law (Q4_K_M ≈ 0.6 GB per B params + ~0.5–0.8 GB runtime)

| available RAM | tier | ctx |
|---|---|---|
| < 3.5 GB | Qwen2.5-3B-Instruct | 4096 |
| < 6.5 GB | Qwen2.5-Coder-7B | 8192 |
| < 14 GB | Qwen2.5-Coder-14B | 8192 |
| else | Qwen2.5-Coder-32B | 8192 |

GPU present → `AIRGAP_GPU_LAYERS=999` (full offload) automatically.

## Measured on THIS sandbox (2026-10-08, see host-capabilities.json)

- 2 vCPU (cgroup), 4041 MB RAM total, **2518 MB available**, 6.7 GB disk, **no GPU**
- → tier chosen: **Qwen2.5-3B-Instruct Q4_K_M**, threads=2, ctx=4096

## HONEST LIMITATION (why the slot is not armed here today)

1. **RAM headroom**: the office (Next :3000 + gateway :3011 + foreman :3010)
   lives in the same 4 GB. A 3B Q4 runtime needs ≈ 2.2–2.5 GB; arming it here
   gambles the whole office on one memory spike. Sovereignty means the office
   survives — we do not bet it for a demo.
2. **llama-server binary**: not installable from this network today
   (GitHub API rate-limited; the release-assets path did not verify). On any
   real machine: `apt`/`pacman`/official releases — then `start-local-llm.sh`.
3. The 3B model GGUF download was started (resumable); check
   `download-status.txt` / `models/`. On failure, rerun `prepare-airgap.sh`.

## Arming (any machine, one chain)

```bash
source airgap/llama-host.env
airgap/start-local-llm.sh                      # :8080
export LOCAL_LLM_URL=http://127.0.0.1:8080/v1  # persists via vault merge-deploy
export LOCAL_LLM_MODELS=$AIRGAP_MODEL_NAME
curl -s http://127.0.0.1:3011/health | rg local-llm   # slot live
```

No TLS spoofing, no geo games, no ToS bending — the air-gap tier is the
*legal* form of the manifest's "unrestricted inference" wish: the brain is
ours, the hardware is ours, the law is intact.
