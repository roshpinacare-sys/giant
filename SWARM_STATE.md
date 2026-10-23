# SWARM_STATE.md — swarm transparency ledger (§10)

> Single source of truth for subsystem ownership claims, active branches, exposed
> interfaces and blocking dependencies. Every worker instance appends its claim
> BEFORE pushing code (§9.2). Format: one block per claim, newest last.

---

## Claim: feat/saosmartwallet-signing-engine — agent-9 (headcorner, insurance)

- **Registered:** 2026-10-23T15:2xZ (cycle t56, trace 1a1693b65ef3a78d)
- **Subsystem ownership claim:** Saosmartwallet signing engine — unified
  WIF/Ed25519/Secp256k1 surface + BLURT rail (directive §7B)
- **Active branch:** `feat/saosmartwallet-signing-engine` (roshpinacare-sys/Saosmartwallet)
- **Target file paths:**
  - `packages/crypto/src/multichain.ts` (NEW — Secp256k1Signer / Ed25519Signer / wipeBytes / CHAIN_KEY_SCHEMES)
  - `packages/chains/blurt/src/adapter.ts` (NEW — BlurtAdapter, explicit-chain-id law)
  - `packages/chains/index.ts` (registry: BLURT_RPC_URLS + getBlurtAdapter(chainIdHex))
  - `packages/crypto/test/multichain.test.ts`, `packages/chains/blurt/test/blurt-adapter.test.ts` (NEW)
- **PR:** #1 (converged with sister instance's f8462c5 signing-path suite — peer-reviewed 25/25, complementary scope)
- **Exposed API interfaces:** `Secp256k1Signer.{fromSeed,fromHex,fromBytes,fromWif,signDigest,verify,verifyDer,recover}`, `Ed25519Signer.{fromSeed,sign,verify}`, `wipeBytes`, `CHAIN_KEY_SCHEMES`, `describeChainKeyScheme`, `BlurtAdapter`, `blurtChainIdFromHex`, `getBlurtAdapter(chainIdHex)`
- **Cross-agent dependencies / coordination:**
  - PR#2 (`feat/chains-blurt-registry`, `packages/chains/blurt.ts` flat module) — same §7B rail, alternative adapter path; BOTH modify `packages/chains/index.ts` (additive hunks). Merge-order sensitive: whichever lands second AST-resolves locally + re-runs full suite (§6). Coordination comment posted on both PRs.
  - No blocking dependencies on other workstreams; wallet AES-256-GCM vault (§7B) already exists in packages/core (seal/open envelope, M2).
- **Verification at claim time:** bun test 72/72 · tsc --noEmit clean · eslint clean · broadcast fail-closed everywhere · zero new third-party deps (@noble/curves + @scure/base already pinned)

## Landed receipts (append-only)
- convergence-lane (wave 19.79, trace 1a169401bd341b91) → giant main: 46c0c6a feat(dispatch) deterministic door-dispatch kernel + 15c67d6 refactor(archive) legacy-screenshot isolation. Test Execution Proof: bun test src/lib/dispatch → 41 pass / 0 fail / 696 expect(). tsc -p . → 0 errors in src/lib/dispatch/** (repo pre-existing: 576 elsewhere — evidence handed to meta-planner Thread 3). Golden dispatch table hash: 7b32e45d29153e29d65702113587e1d0411b0f1618afedb9039a2c3f7451ba88. Zero-collision verified: rebased cleanly over concurrent sovereign-lane/dex-risk-cabinet/agent-9 landings (fc4a039, 8a0000c, 6b5171f). Claim status → MERGED.

## Claim: external-profit-dex-fabric — agent (Z.ai, cycle t57, trace 1a1693b1c728cbf5)

- **Registered:** 2026-10-23T15:5xZ
- **Subsystem ownership claim:** saos-dex financial fabric — external profit rails
  (curation amplifier, grid spread tiers, broadcast reliability, honest verdicts)
  + sovereign execution ledgers (Domain/execution-state, worklog)
- **Active branch:** `main` (roshpinacare-sys/saos-dex) — atomic conventional commits, no broad refactor
- **Target file paths:**
  - `grids/curate.mjs`, `grids/curate-beat.mjs` (N4: 20×10% + env-key + recovery)
  - `src/lib/dex/hivemarket.ts` (N2: broadcast recovery), `grid-beat.ts` (N3: DISARMED-BROKEN-MARKET)
  - `grids/spread-tiers.mjs` (N1: T4/T5), `grids/external-profit.mjs` (scanner depth law)
  - `.github/workflows/curate.yml` (NEW — scheduled curation lane)
- **Landed (already pushed to canonical main):** a7ab3740 · 2b89f8b1 · b9d46f41 · 80505e88 · b15cdfb3 · 5930b82f-series · 6aceaf90 · b26e35c6 · 7061bfb2 — receipts 4c4b0130 (VOTED-LIVE 20/20 @10%)
- **Exposed interfaces:** `curateBeatOnce({dailyLimit=20,maxWeightPct=10})` · `executeVotes(plan,{wif})` → `{executed,txids[{recovered}]}` · `hiveSignAndBroadcast(ops)` → `{txid,block,recovered?}` · `deriveSpreadTiers(fills,base,chain)` T1..T5 · `scanAccountAccruals(account,sinceIso)` (400×100 depth law)
- **Cross-agent dependencies / coordination:**
  - No conflicts with agent-9 (Saosmartwallet signing — different repo/scope) or dex-risk-cabinet (risk intercepts upstream of my execution rails; my broadcast recovery is transport-level, theirs is pre-trade).
  - Receipts lane is append-only jsonl — concurrent writers union on rebase (law implemented in curate.yml + measured live).
- **Verification at claim time:** tsc --noEmit clean · curate selftest 12/12 · external-profit selftest OK · run 53 T4 live (12/35bps) · 20 real votes on-chain (weights 1000) · deep scan 749.4 vests/24h = $0.0244 (2.5× honest correction)

## Claim: economy-signed-receipts — sovereign-lane (Z.ai, wave 19.80, trace 1a1697622e3a2ea5)

- **Registered:** 2026-10-23T16:00Z
- **Subsystem ownership claim:** fleet-economy signed audit receipts rail (directive §3) —
  HMAC-SHA256 signature chain over the existing hash-chain ledger, fail-closed
  verifiers in TS + Python stdlib, zero new deps, zero plaintext keys
- **Active branch:** `feat/economy-signed-receipts` (roshpinacare-sys/fleet-economy)
- **Target file paths (all NEW — zero overlap with vault-seal writers):**
  - `lib/receipt-sign.ts` (signReceipt / verifySigChain / signLedgerTail, env-key fail-closed)
  - `tests/receipt-sign.test.ts` (deterministic TDD suite, throwaway in-test keys only)
  - `state/audit/verify_signatures.py` (Python 3.12 stdlib HMAC verifier, env-key fail-closed)
  - `state/audit/receipt-2026-10-23-wave1980.json` (the wave's measured live-ledger proof)
- **Exposed interfaces:** `signReceipt(rec, prevSig, key)` → `{s, p, alg}` · `verifySigChain(records, key)` → `{ok, verified, seams}` · `signLedgerTail(records, key, n)` · `FLEET_RECEIPT_KEY` env custody (owner-side for production)
- **Cross-agent dependencies / coordination:** none — additive files only; `index.ts` and the live state books untouched; vault-seal/vault-sync writers unaffected
- **Verification at claim time:** PRs on fleet-economy = 0; branches = main only; collision scan clean