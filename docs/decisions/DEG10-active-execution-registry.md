# DEG10 — ACTIVE EXECUTION SURFACES · CANONICAL REGISTRY (DECISIONS #42/#43 completion)

> Lane **G78-e** (giant: execution-ledger live receipts + DECISIONS #43) · trace `1a17d4f7d0ecfe91` ·
> registered 2026-10-27T12:5xZ, AFTER the union renewal landed and the eviction was verified.
> Law: giant IS the single canonical trunk (#42); this registry is the aggregation home of every
> ACTIVE execution surface — where the truth lives, who renews it, what law guards it. A surface
> missing here is not canonical; a surface listed here may not be re-hosted elsewhere.

## The registry (measured 2026-10-27)

| # | surface | canonical home | renewer / writer | cadence | guarding law |
|---|---|---|---|---|---|
| 1 | SAOS-EXECUTION-LEDGER/1 — user-site root | `roshpinacare-sys.github.io` `/execution-state.json` | `mini-services/fleet-runner/scripts/execution-ledger-union-renew.ts` (t64) + predecessor renew (12h organ cadence) | 12h organ / per-wave lane | erasureGuard append-only · 48h staleness · lineage-preserving union |
| 2 | SAOS-EXECUTION-LEDGER/1 — Domain | `Domain` repo `/execution-state.json` (→ `/Domain/` pages) | same union renewer | same | same |
| 3 | SAOS-EXECUTION-LEDGER/1 — giant mirror | `giant` `state/execution/execution-state.json` | same union renewer | per-wave | same |
| 4 | GAP register / network state | `Pulse/state/network.json` (user-site + giant Pulse) | `pulse-network-renew.ts` (chained to the ledger cadence, organ-scoped facts) | 12h organ | evidence-pointer per status · no fabrication |
| 5 | verdicts chain | `giant` `state/swallow-guard/quality/verdicts.jsonl` | lane receipts (hash-linked SHA-256, `hash = sha256(JSON.stringify({prevHash, at, payload}))`) | per landing | prevHash chain · verify-before-append |
| 6 | quality receipts | `giant` `state/swallow-guard/quality/{trade-receipts,custody-gaps}/` | quality-gate lanes | per wave | swallow-guard canonical set |
| 7 | fleet hash-chain ledger | fleet-economy organ (`:3016` engine / `:3032` ledger) | fleet-economy organ + seal cadence | live | signed conservation receipts · vault custody |
| 8 | sovereign market / book | saos-dex kernel (`:3033`) | saos-dex organ (hyperGrid lanes) | live | AMM invariant 30bps · minOut fail-closed |
| 9 | HSM signing runtime | Saosmartwallet `packages/hsm-runtime` (+ systemd unit on runner-kit) | G77-d/t63/t64 cure chain | per landing | deny-by-default · SIGN-ONLY · no broadcast route · bounded shutdown |
| 10 | claim registry | `giant` `SWARM_STATE.md` | every worker (append-only rows) | per wave | §8 transparency law |
| 11 | worklog | `giant` `worklog.md` (+ copies law) | every worker | per wave | nothing dies with the sandbox |

## Convergence state (this wave)

- **#42 (single canonical trunk)**: ACTIVE — all ten surfaces above have exactly one canonical home; mirrors are byte-true (the t64 union renewal re-proved it: three divergent ledger contents collapsed to one lineage, sha-identical bytes).
- **#43 (legacy eviction)**: **EXECUTED** — 29 dead gitlinks + 2 stray files evicted (DEG9 §3 receipt), 0 gitlinks remain, 341/341 green. The tree no longer lies about its topology.
- **Renewer lineage**: `execution-ledger-union-renew.ts` (t64, pure core + selftest 7/7) joins `execution-ledger-renew.ts` (organ 12h) — the union law (merge, never replace) is now enforced in code AND test, not just in prose.

## Honest scope note

The registry lists ORGAN surfaces (7–8) whose live counters are organ-host-scoped; from a sandbox lane
they are named-absent (G7 gap row in the ledger), never invented. Aggregation means the CANONICAL
POINTERS and LAWS live here — not that every number is re-measured in every lane.
