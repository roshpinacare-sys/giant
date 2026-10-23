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
