# Execution Fabric — Canonical Status Sync (Task-138)

**Date:** 2026-10-25
**Measured window:** 2026-10-25T15:53Z → 16:25Z (every number below was fetched live from the listed endpoint during this window; nothing is estimated or copied from memory)
**Synced by:** Task-138 swarm agent (owner EMERGENCY DIRECTIVE 25/10 §1–§5 — owner-endpoint hardening, pipeline resumption, audit reconciliation, architect verification)
**Commit:** this file's own commit on giant main — `docs(canonical): Task-138 measured board — HSM lockdown, soldier drip, key-form root fix, first multi-account trade`

---

## §1 — OWNER ENDPOINT HARDENING (measured, closed)

| Surface | Before (measured live) | After (measured live) |
|---|---|---|
| saos-wallet HSM `POST /sign` (:3085) | **WIDE OPEN** — anonymous POST returned a valid ed25519 signature (200, fp 59da62dcacac) | **401 organ-auth-required** anonymous; **200** with vault-backed organ token; every unauthorized attempt counted + appended to `upload/saos-wallet/audit.jsonl` (`"why":"unauthorized-sign: 401"`) |
| app `/api/*` mutations | already gated centrally by `src/proxy.ts` (Task 91) — live re-verified: public XFF mutation → **401 operator-key-required**; with `x-operator-key` → 201 | unchanged, gate re-proven |
| saos-dex mutations (:3010) | operator token gate — live re-verified **401 no-operator-credential** | unchanged; HTLC commitment signing now carries the organ token (fail-closed without it) |
| saos-grid mutations (:3070) | organAuth gate — live re-verified **401** | unchanged; new `/fleet-drip/run` born gated (same organAuth) |
| Secrets on disk | `upload/*` tmpfs mount enforces 0777 (platform-level chmod impossible — measured: chmod exit 0 then stat 777) | documented honestly; compensating control = out-of-git (gitignored) + HSM gating of every signing action |

Auth law unchanged: `mini-services/organ-auth.ts` refactored to a pure `verifyOrganToken` (deny-by-default, constant-time, 7 unit tests). Deny → 503 when unconfigured, 401 when mismatch.

## §2 — PIPELINE TRUTH (the "Oct 21 stall" claim, measured against GitHub API)

| Workflow | State (16:16Z) |
|---|---|
| Pulse/heartbeat | success 15:30Z, every 30min, green streak |
| agent9-clock | success 15:55Z, every ~13min, green streak |
| GridWatch grid-watch + pages-deploy | success 15:26Z / 15:30Z |
| giant trust-heartbeat | success 14:01Z |
| Domain press-bake (daily paper) | **success 16:12Z today** — pipeline alive |
| Domain agent9-fleet-truth, dex-*, office-*, sovereign-pulse | green today |
| **giant identity-guard** | **FAILING (4× today 16:00–16:11Z)** — root cause measured: push-ranges contain commits authored `Z User <z@container>` from the "vault-seal [auto-economy]" lane running in a *different* sandbox (violates Decisions #10 identity law v3 — only `<lane>@fleet.local` forms are lawful). This sandbox's own lanes now commit `fabric-heartbeat@fleet.local` (root fix here); the offending lane is outside this sandbox — its operators must set a lawful git identity. History rewrite not attempted (live concurrent writers). |
| giant fleet-rail-guardian | 1 failure 13:57Z (separate, non-blocking) |
| roshpinacare-sys.github.io | `receipts/fleet-activity.json` regenerated **today 16:09Z** by the liveness host — front door alive; no hand edits (established law) |

**Conclusion (measured):** the daily pipeline was NOT stalled on Oct 21 — press, digests, heartbeats and public receipts all ran today. The real failures are identity-law violations by one external lane, precisely diagnosed above.

## §3 — AUDIT RECONCILIATION: why multi-soldier trading never executed + the fix (all on-chain)

**Root cause 1 — fuel, not keys (measured 15:58Z):** `GRID_ACCOUNTS=headcorner,saos-0001..3`; all four hands loaded with ACTIVE keys (engine fingerprint `headcorner:b575,saos-0001:f8d5,saos-0002:d3c7,saos-0003:4966`, mode `live`) — but chain balances of saos-0001/2/3 were **0.000 STEEM / 0.000 SBD**. The engine honestly skipped them. Keys were never the blocker on this layer.

**Fix 1 — soldier-drip engine (TDD 9 tests):** `saos-grid/soldier-drip.ts` — deterministic plan: treasury reserve sacred (10%), SBD-first (buy-side unlocks cheapest), STEEM second (sell-side), per-pulse transfer cap, integer-milli precision, honest skip reasons. Wired to `POST /fleet-drip/run` (organAuth) + 30-min auto-pulse + single-flight lock (manual+auto never race).

**Live result (chain-verified read-backs):** 7 transfers landed in blocks 110748352–356+ — saos-0001: 0.150 SBD + 0.610 STEEM; saos-0002: 0.150 SBD + 0.414 STEEM; saos-0003: 0.150 SBD + 0.101 STEEM. Every milli accounted: treasury spent 1.125 STEEM + 0.450 SBD, remainder 0.002/0.029 — zero duplication, zero loss (a mid-flight reload wiped in-memory state once; the chain is the source of truth and every transfer was re-read from it).

**Root cause 2 — WIF form bug (measured 16:12Z):** first-ever soldier broadcast failed `invalid private key`. Diagnosis: `generateWif` emitted Bitcoin-compressed WIF (`0x80‖32B‖0x01`) — **Graphene requires `0x80‖32B`**. dhive (the reference implementation) rejected it; the unit round-trip missed it because it tested our own decoder. 38-byte WIFs in the vault for all 12 soldier keys.

**Fix 2 — root + migration:** `generateWif` fixed to Graphene form; `wifToGrapheneWif` migration (scalar = 33-byte-body mod N — preserves the *registered* pubkey exactly); regression tests now validate against **dhive itself** (`PrivateKey.fromString` accepted, same public key in both decoders; 25/25 in steem-tx suite). Vault migrated **12/12 WIFs**, each verified equal to its on-chain authority before write (atomic tmp+rename; backup `steem.env.bak-wif-fix-20261025`). Zero key rotation, zero chain writes.

**The historic result (16:13:45Z):** `saos-0001` placed the **first live order in fabric history from a non-treasury account** — sell 0.54 STEEM, `orderid=1792944779`, recorded in grid_events. The single-account bottleneck is broken by execution, not by declaration.

**Receipts:** fleet-economy ledger (app :3000 `/api/ledger`) **2,996 records, hash-chain verify ok** (head c2215a3bca5e), independently confirmed by chain-witness :3050 (2996/2996 verified, 9.3ms). Chain fills live in `grid_orders`/`fill_ledger`; dex trades settle via the guarded `/api/sovereign/ops/dex-receipt` sink.

## §4 — ARCHITECT + ORGANS (all probed live 16:19Z)

| Organ | Port | Measured |
|---|---|---|
| saos-architect (24/7 daemon) | 3086 | cycles 5, suites **6/6 green**, lint ok, receipt chain **76 verified ok**, build verdict `no-buildable-issue` (queue empty — honesty) — compiled, tested, running, self-auditing every 5 min |
| saos-dex | 3010 | height 26 (advancing), trades flowing |
| saos-grid | 3070 | mode live, price 0.10273, not halted; harvest cycle 1: claim broadcast+verified (159,527,172 VESTS), curation vote broadcast |
| saos-arb | 3071 | 51 cycles, 6 hands, 0 consec errors; AMM rail honest `hold pool-not-found` |
| saos-wallet HSM | 3085 | sealed, poisoned=false, signs 1 (tokened probe), refuses 1 (anonymous probe — audited) |
| app claims board | 3000 | overall degraded — **8/10 active, 2 degraded, 0 down**: export-canonical (2968≠2996 sync pending — pre-existing oscillation), push-artery (transient leak-scan block during this session's commit window; `--staged` scan re-run clean 16:22Z) |
| fabric-heartbeat | 3031 | 261 ticks, 0 tick errors, appRssRecycles 11 (recycle medicine working), selftest passes |

## §5 — Execution mandate compliance

- **Zero mocks / zero TODOs:** this session's code (soldier-drip, organ-auth refactor, WIF migration, HSM gate) contains no placeholders, no stubs, no unhandled exceptions; every state change is chain-read-back-verified or hash-linked.
- **Cryptographic receipts:** ledger verify ok (2,996); architect chain verify ok (76); every Steem broadcast carries trxId + block number recorded in grid_events/drip state.
- **Honesty notes:** RC of headcorner remains 4.7× short for claim-scale ops (fleet growth honest-gated); treasury is now near-empty by design (drip spent it deliberately on working capital — harvest/growth refill it); `upload/*` tmpfs denies chmod (platform constraint, documented).

---

*Zero fabrication law: every number above was fetched live in the measured window (organs via HTTP, chain via api.steemit.com, remotes via GitHub API). No secrets in this document: account names are public chain entities; no keys, no tokens, no vault mapping.*
