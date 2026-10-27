# wallet-hsm — Saosmartwallet PRODUCTION HSM signing runtime

**Status (2026-10-26, task 36-d): ACTIVE — deployed on sovereign-runner-kit, port
3062, bound to 127.0.0.1 ONLY.** This is the transition of the Saosmartwallet
signing layer from prototype to a live fail-closed signing organ.

## Laws (each pinned by `bun test`)

| Law | Enforcement |
|---|---|
| Loopback only | `Bun.serve({ hostname: "127.0.0.1" })` — necessary but NOT sufficient (the sandbox gateway reverse-proxies any local port), hence the next law |
| Deny-by-default | EVERY route except `GET /health` requires the vault token: `x-vault-token` or `Authorization: Bearer`, constant-time compared (sha256 + `timingSafeEqual`) — semantics mirrored from giant `mini-services/lib/vault-auth.ts` (commit 69144ce), applied stricter (all routes, all origins) |
| No token ⇒ sealed | Without a configured token the service boots SEALED and `/sign` returns 503 forever. It never self-mints, never opens |
| Kill switch | `WALLET_HSM_SEALED=1` forces sealed mode regardless of token/keys |
| No keys ⇒ sealed | Zero loaded WIFs ⇒ sealed (honest: nothing to sign with) |
| Key custody | WIFs are sealed at boot into the `@saos/vault` AES-256-GCM envelope store (per-key random IV, verify-block master-key gate, 0600 files). `/sign` unseals via `withKey` — the material buffer is ZERO-FILLED after the callback settles. Material is never returned, logged, or echoed |
| Owner key never hot | `STEEM_OWNER_WIF_A/B` are deliberately NOT in the roster (Saosmartwallet doctrine: owner key is never hot) — surfaced in `/pubkeys.ownerKeysNeverHot` |
| Honesty about soldiers | Soldier WIF env names (`STEEM_SOLDIER_*`) are ABSENT from the owner secrets file (names-only scan, cycle 36) — `/pubkeys.soldierWifs` reports `provisioned: false` instead of fabricating |
| Zero secrets in logs/responses | Pinned by canary-scanning tests over health/pubkeys bodies AND captured log lines |

## Endpoints

- `GET /health` — the ONLY token-free route. `{ status: armed|sealed, statusReason, uptimeSeconds, signEnabled, keysLoaded, tokenFingerprint, … }` — zero secrets.
- `GET /pubkeys` (token) — per roster entry: `{ account, chain, authority, envName, loaded, fingerprint }`. Fingerprints are `sha256(compressed pubkey)` first 16 hex chars — public data only. Missing soldier envs are reported `loaded: false` honestly.
- `POST /sign` (token) — body `{ account, txDigestHex, authority?, chain? }`. Signs the 32-byte tx digest with that account's WIF **in memory via `vault.withKey`**, returns the 65-byte compact signature (`[31+recid ‖ r ‖ s]` — the Steem header convention verified against real chain bytes in Saosmartwallet M0) plus `r/s/recid` and the public fingerprint. Errors: 400 bad-digest/account/chain · 403 no/wrong token · 404 unknown-account · 503 sealed / key-not-loaded. The HSM is chain-agnostic by design: it signs raw digests; tx serialization stays with the callers.

## Token provisioning (owner)

Resolution order: `VAULT_TOKEN` in `/home/z/.secrets/.env.local` → process env
`VAULT_TOKEN` → this service's local 0600 token file
`mini-services/wallet-hsm/state/operator-token` (gitignored; fleet
operator-token law mirrored from giant vault-auth 69144ce). The owner rotates
by provisioning the secrets-file/env value, which always wins. No local file
and no env ⇒ the service stays SEALED — fail-closed, never open.

## Crypto core

`src/secp256k1.ts` is zero-dependency (fleet mini-service law: node:crypto
only) ECDSA over secp256k1: Jacobian point arithmetic, deterministic RFC6979
nonces (HMAC-SHA256, no RNG failure mode at signing time), low-s
normalization, compact 65-byte form, verify + pubkey recovery. Correctness is
pinned by public vectors (compressed pubkeys d=1/2/3; RFC6979 nonce and
(r,s) for d=1, sha256("Satoshi Nakamoto") from the python-ecdsa/trezor
suites; recid proven by pubkey recovery to the canonical G vector) AND
independently cross-checked with OpenSSL (`openssl dgst -sha256 -verify` →
"Verified OK", 2026-10-26). Trade-off documented honestly: hand-rolled-but-
vector-pinned math chosen over adding an unaudited dependency tree to the HSM.

## Vault dependency

`@saos/vault` is consumed via `"file:/home/z/work/Saosmartwallet/packages/vault"`
(bun resolves it as a symlink; verified by `bun -e 'import { openVault } from
"@saos/vault"'` and by the whole suite). The package manifest added for this
lives in Saosmartwallet `packages/vault/package.json`. If the absolute path is
ever unavailable, the documented fallback is a relative filesystem import —
not needed today.

## Vault master key

With `SAOS_VAULT_MASTER_KEY` (64 hex) provided via env/secrets file, the
envelope store persists across boots (armed-with-persistence). Without one,
an ephemeral per-boot master is held in memory only and the scratch store is
wiped and re-sealed every boot — keys are sealed from live env at every boot
either way.

## Tests

`bun test` → 32 pass / 0 fail (93 expects, 2 stable runs): envelope roundtrip +
withKey zeroize + at-rest redaction · RFC6979/signature vectors · sign-verify
HTTP roundtrip with a throwaway WIF via `WALLET_HSM_TEST_WIF` · 403 no token ·
403 wrong token · sealed 503 (kill switch AND no-token variants) · canary
redaction over bodies and logs.

## Ops

```bash
cd /home/z/my-project/mini-services/wallet-hsm
bun install
bun test
nohup bun --hot index.ts > hsm.log 2>&1 &   # sovereign-runner-kit start
curl -s http://127.0.0.1:3062/health
```
