# saos-organ-commander · :3047

The Chief Sovereign Architect's **keep-alive command plane** (§1+§2+§4 of the
owner's 19:39 MASTER DIRECTIVE, wave 19.85, trace `1a16ecaa3ddddba9`).

## Mandate
When the external agents leave, the estate must keep building and trading by
itself. The commander probes every loopback organ, ranks deterministic
commands, executes fail-closed, and writes a hash-chained receipt ledger.

## Boundary (twin-lane honor, CAS law)
- `saos-architect-daemon` (wave 19.84, :3049) = executive authoring loop — owns
  issue selection/execution/merge. The commander **never** competes: it probes,
  spawns (port-first authority), and POSTs their endpoints.
- `hft-grid-soldiers` (wave 19.84) = the HFT core in saos-dex. The commander
  only **revives** organs (incl. hft-loop once landed).
- Organ code is NEVER imported here. HTTP + subprocess only.

## Organs under command
| organ | port | plan |
|---|---|---|
| dex-node | 3010 | self-healing exchange wrapper (clones/installs/db-push) |
| soldier-army | 3018 | 6 grid soldiers, postOnly, bank discipline |
| dex-economy-bridge | 3017 | fills → fleet-economy DexTrade ledger |
| issue-forge | 3046 | audit→issue→author→verify→ship (directive-hardcoded port) |
| sovereign-audit | 3022 | action-freeze auditor (observed only) |
| economy-engine | 3016 | shared book engine (observed only) |

## HTTP (loopback only)
- `GET /health` → `{ok, cycles, lastVerdict, ...}`
- `GET /state` → last truth + receipts tail
- `POST /cycle` → one bounded cycle

## CLI
```
bun mini-services/organ-commander/index.ts once
bun mini-services/organ-commander/index.ts beat s=60000
```

## Laws honored
- **port-first authority** — never duplicates a live organ (G92 lesson)
- **/proc single-flight** — disk locks are not authority (G62 lesson)
- **cooldown law** — no spawn spray; per-organ measured boot windows
- **fail-honest** — `probe-error`/`noop` are verdicts, never fake green
- **zero deps** — bun:test, node:crypto, fetch; offline deterministic suite
