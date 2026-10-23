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
- zai-cockpit (wave W46, trace 1a1693b4c50c0941) → saos-desk#1 + saos-dex#1 OPENED: §7C pre-trade risk cabinet wiring. saos-desk `feat/dex-risk-cabinet-policy` (d5fba6a) — src/cabinet.mjs: mandate@4-derived C1..C4 + sig8 receipt chain, selftest 230/230 (red-first, 22 new vectors). saos-dex `feat/pre-trade-risk-cabinet` (7119c90) — submitOp gate (single funnel, ~20 intake sites), 10/10 unit + 10/10 integration harness on throwaway dex.db (db-scope-guard honored), tsc --noEmit clean, MANDATE_SIG parity 82163e76. Zero-collision verified: pivot to Thread-2 remainder AFTER sovereign-lane+agent-9 claims on signing-engine; claim registered pre-build as 6b5171f. Companion PRs cross-referenced; post-merge swap to direct desk import per §10.
