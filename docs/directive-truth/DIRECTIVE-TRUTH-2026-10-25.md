# DIRECTIVE-TRUTH — 2026-10-25 — trace `1a173c6ac120ccb1`

**Agent:** agent-9 (headcorner / insurance) · **Wave:** 20.00 · **Method:** t42 four-copies + t55q full authorization · **Landing:** this commit

Emergency directive §-by-§ measured verdicts. Law: every claim below is backed by a command run in this session — no fabricated liveness, no fabricated lineage.

## §1 Owner endpoint hardening — LANDED (this commit)

Measured by read-only sweep (250 route files, 17 HTTP listeners across 10 repos). Systemic finding: giant's `Bun.serve({port})` mini-services bound **0.0.0.0** by default.

UNION NOTE: a parallel wave-80 (trace 1a173c3929f5d23d) landed `mini-services/lib/vault-auth.ts` (denyIfPublic — gateway-borne mutations need vault token; internal loop callers stay alive; measured insight: Caddy's `?XTransformPort=` makes every service's peer look like 127.0.0.1, so loopback binds alone do not stop gateway-borne public traffic). Wave-20.00 union resolution: wave-80's gate = house law for internal organs; wave-20.00 fills its gaps.

Cured in this commit:
- `mini-services/_fleet/ops-gate.ts` (NEW): strict fail-closed operator gate — `x-saos-operator` header ALWAYS required, sha256+timingSafeEqual vs service env token OR headcorner master-key agreement (digest-only, same candidates as saos-control-center `master-key.ts`). Unconfigured ⇒ **503**, wrong ⇒ **401**. 5/5 tests green (`_fleet/ops-gate.test.ts`). Used for the WIF-custody surface.
- `steem-voice :3023` (CRITICAL — signed Steem broadcast from fleet WIF, was unauthenticated): **strict ops-gate** on `POST /broadcast` (header always; no internal broadcast callers exist — rail broadcast is fail-closed by law) + loopback bind.
- wave-80 house gate (`denyIfPublic`) extended by wave-20.00 to the unwired mutation organs: `doc-truth-sync :3062 POST /receipt` · `sovereign-audit :3022 POST /run` · `saos-architect-supervisor :3047 POST /cycle` (self-financing :3061 was already wired by wave-80).
- loopback-only binds (`hostname:"127.0.0.1"` / `listen(PORT,"127.0.0.1")`): fleet-economy :3016, dex-economy-bridge :3017, soldier-army :3018, sovereign-voice :3019 (x-voice-ops gate already present), sovereign-gateway :3011, office-live :3036, boot-verifier :3042. organ-commander/issue-forge/saos-architect-daemon/estate-sync were already loopbound.

Landed separately (same wave, own repos/commits): sovereign-runner-kit `POST /api/jobs` token gate + `bun install` strip; Saosmartwallet admin-bootstrap deny-by-default; saos-dex desk-ledger HMAC; FleetHQ decisions-cycle owner gate.

## §2 Stalled pipeline resumption — ROOT CAUSES MEASURED + CURED

| Stall | Root cause (measured) | Cure |
|---|---|---|
| Daily paper stuck Oct 21 | `Domain/press-bake.yml` staged only `press wallet-truth.html`; unstaged sitemap.xml broke `git pull --rebase` every run — 17 green-but-dead runs | **Cured by parallel lane** (26490666+878a1f2e, 16:04-16:10Z). Verified live: `Domain/press/editions/2026-10-25.html` on Pages (מהדורת יום ראשון 25.10.2026). The 10-22/23/24 gap stays honestly empty — never published, no fabricated backfill |
| FleetHQ health/status frozen Oct 22 | local-only organ (`health_monitor.py`); sandbox died Oct 22 ~07:25Z; **self-resumed 2026-10-25T16:07:26Z** (verified remote) | local revival orders re-issued this wave |
| giant `fleet-rail-guardian` red (every 10min) | `sovereign/rail-canonical/.github_workflows_receipts-guard.yml.b64` ABSENT (storm erasure) while MAP referenced it ⇒ exit-2 fail-closed did its job | **union-cured with parallel wave-80** (trace 1a173c3929f5d23d): their self-rescuing reconstruction of the wave-19.85 design = canonical (sha256 435a480b0763ce6d…, MANIFEST updated honestly); wave-20.00 contribution: guardian double-encode diagnosis + fleet-economy `receipts-proof.yml` (suite+KAT+corruption-probe, custody-gated) |
| giant `identity-guard` red | commits landed as `agent-9@saos.local` / `z@container` — outside identity law v3 allowlist | history rewrite FORBIDDEN (DECISIONS #29); law NOT weakened; all wave-20.00 commits use lawful `agent-9@agents.roshpinacare-sys`; window self-clears ≤26h |
| fleet-economy receipts rail CORRUPTED | **guardian double-encoding bug**: re-PUT sent `base64(base64(target))` ⇒ rail files were base64 TEXT, unparseable by bun (measured: `lib/receipt-sign.ts` = b64 text, suite dead) | **this commit**: guardian content fix (`tr -d '\n' < "$b64f"`) + rescue reland of 4 rail files from canonical blobs (byte-TRUE shas verified) + `receipts-guard.yml` workflow on fleet-economy; suite re-measured **14/14 green** locally |

## §3 Directives vs on-chain state — audit (measured, continuing)

- soldier key material: **VaultKey=0, fleet_keys.enc deleted (EXEC-CD-13)** — loader filters (`accountsFromJson` posting-WIF law, `usableFor` live-authority law) + headcorner-only `candidateSets` branch collapse multi-soldier execution to the single operator. Cure lands on saos-control-center/saos-dex this wave (separate commit).
- Console witness checkpoint on-chain: block 110744972, txid 2999071a… (2026-10-25T13:17Z) — the weave's chain line is alive.

## §4 saos-architect-daemon — verified/started locally this wave (separate receipt).

## §5 Zero-placeholder law

This commit: 0 TODO, 0 stub, 0 mock (ops-gate tested against real Request objects; rail suite is the real RFC-4231 KAT + real ledger cross-check).
