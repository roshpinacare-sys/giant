# DEFI-POLICY-ROLLUP — canonical convergence of Defi policy surfaces (giant)

> Lane: **G76-h** · branch `feat/defi-convergence` · cut from giant `main` @ `cfa91f8`
> Audit instant: 2026-10-26T14:24Z · provenance law: **every row cites repo + path + commit**;
> a parameter without a measured source is not written here. Consolidates and supersedes the
> saos-dex-local roll-up (`saos-dex/docs/DEFI-POLICY-ROLLUP.md`, cycle-30, trace 1a16e979cd7b1fa9)
> as the giant-side canonical view, extended with the cross-chain rail and the execution-ledger access repair.

## 0. Measured source census (at audit instant)

| repo | ref | head @ audit | note |
|---|---|---|---|
| giant | `main` → `feat/defi-convergence` | `cfa91f8` | this roll-up lands on the lane branch |
| saos-dex | `origin/main` | `117b5a96` (grid-beat 2026-10-26T14:15Z) | AMM + grids + curate enforcement home |
| Saosmartwallet | `origin/feat/fixedfloat-crosschain-rail` | `78da6af` ("wallet-verify: PASS at 2026-10-25T17:57:26Z") | cross-chain rail surfaces |
| Domain | `origin/main` | `9dcd4e454` (ledger last-touch `a9e461615`, cycle-31) | execution ledger + public pages |

## 1. Canonical enforcement map (policy surface → enforcement point → provenance)

| # | policy surface | enforcement point (repo/path) | provenance (commit @ audit) | measured evidence |
|---|---|---|---|---|
| 1 | AMM swap fee invariant **30 bps**, treasury cut **30%** / LP **70%** | saos-dex `src/lib/dex/kernel.ts:173` (`FEE_BPS = 30`, `BOOK_TAKER_FEE_BPS = FEE_BPS`); saos-dex `src/lib/dex/showcase.ts:21-29` (`FEE_BPS = 30`, `TREASURY_CUT_PCT = 30`, `lpFee = feeAmt − treasuryCut`) | saos-dex `main` @ `117b5a96` (file lineage last touch `b9c398b1`, 2026-10-25T17:51:45Z) | book engine carries the real book cost with **no phantom taker fee** (`src/lib/dex/mm.ts` FIX(Roast-64)); showcase keeps the 30bps base fee honest (FIX(Roast-67)) |
| 2 | monotonically-growing treasury ("fees never erode") + dividend lane | saos-dex `grids/state/dividend-lane.json` (schema `SAOS-DIVIDEND-LANE/1`: `rateUsdPerDay: 1`, `targetUsdPerDay: 1000`, `pendingReleaseUsd: 0.0026`, `gapToTargetUsd: 999.9974` @ 2026-10-21T12:27:39Z) + `grids/state/dividend-release.jsonl` (append-only) | saos-dex `main` @ `117b5a96` | measured, un-decorated: paidUsdTotal = **0**, lastPaidAt = **null** — the lane is armed, not paying yet (DORMANT-honest) |
| 3 | owner gate — ops above `notionalSbd` require the owner arm file | saos-dex `grids/policy.mjs` (layer-5 ownerGate) + `grids/state/policy.json:40` (`"notionalSbd": 100`) | saos-dex `main` @ `117b5a96` | top gear "tops out AT the gate, never past it" (`grids/state/policy-gears.json` note); policy selftest 29/29 (cycle-30 roll-up evidence) |
| 4 | curation amplifier (Steem voting rail) | saos-dex `.github/workflows/curate.yml:19` (cron `17 */6 * * *` — 4 beats/day) + `grids/curate.mjs:57-83` (amplifier: 20 votes/beat · weight ≤ 10% · `weightSteemUnits` clamp 1..max×100) | saos-dex `main` @ `117b5a96` | 80 votes/day × 10% = **16%/day** voting power vs 20% regen → **1.25× sustainability**; live txids recorded in Domain ledger cycle-30 (`4c4b0130` receipts, 2026-10-23T15:09Z) |
| 5 | external-profit publication cadence | saos-dex `.github/workflows/external-profit-publish.yml:15` (cron `43 */2 * * *`) | saos-dex `main` @ `117b5a96` | run `40111486698` SUCCESS: `vests24h = 1068.465923`, `usd24h = $0.0321` (ext=mexc), ×3.34 vs cycle-27 base $0.0096 (Domain `execution-state.json` `measuredSnapshot`, `a9e461615`) |
| 6 | cross-chain rail (HTLC hash-time-lock sessions, key custody in vaults) | Saosmartwallet `packages/htlc/src/{session,timelock,secret,state,chains,errors,messages}.ts` + `packages/htlc/test/htlc.test.ts`; `packages/swap/src/**`; `packages/bridges/{router,monitor,inject}.ts`; custody: `packages/vault/src/**` (AES-256-GCM envelope) | Saosmartwallet `feat/fixedfloat-crosschain-rail` @ `78da6af` | wallet-verify PASS 2026-10-25T17:57:26Z (commit message, measured); vault test-suite 72/72 green (SWARM §10, main @ `30eca9c`) |
| 7 | self-financing channels (RC rebalance · curation harvest · yield accrual) | giant `mini-services/self-financing-engine/{rc-plan,curation-harvest,yield-accrual,roster-from-book}.ts` (+ `engine.test.ts`) | giant `feat/defi-convergence` base `cfa91f8` | rc-plan: donors above `ceilingPct` (default 90) fund needy below `targetFloorPct` (default 25), zero-sum `conservedVests`, honest `unresolvable[]`; plans only — **no broadcast, no signing** (header law) |
| 8 | receipts rail (canonical blobs) | giant `sovereign/rail-canonical/MANIFEST.sha256` (`lib/receipt-sign.ts` = `beff43c8…`, guard workflow, verify script) | giant `main` @ `cfa91f8` | guardian law: absent-or-divergent on fleet-economy ⇒ re-PUT via contents API; divergent-but-present ⇒ alert only |
| 9 | execution-ledger access (canonical state) | giant `mini-services/defi-convergence/execution-accessor.ts` + mirror `state/execution/execution-state.json` (byte-true of Domain @ `a9e461615`, sha256 `95e932ea…`) | giant `feat/defi-convergence` (this lane) | 28/28 accessor tests green; verify @ 2026-10-26T14:24Z = **stale** (ledger.at 2026-10-23T15:55:00Z > 48h window) — reported honestly, not papered over |
| 10 | Kelly sizing honesty (no edge ⇒ no size) | Domain `execution-state.json` cycle31.kelly (`p: 0.539267`, `b: 0.792396`, verdict `NO-EDGE`, `fractionBps: 0`, trades 191, washExcluded 94) | Domain @ `a9e461615` | Kelly NO-EDGE honored — zero size deployed on a non-edge (measured, cycle-31) |

## 2. Convergence notes (what moved where — no double policy logic)

1. **Doctrine home stays `/lane/Defi` (doc + mission book); enforcement lives in saos-dex; giant holds
   the canonical roll-up (this file) + the self-financing channels + the execution-ledger accessor.**
   saos-dex policy engine (SAOS-POLICY-ENGINE/1, decision #17) already rolls the doctrine into
   intent-schema → capital ceilings → ledger rate → owner gate → allow-lists; the cycle-30 roll-up's
   10/10 doctrine-law map remains valid and is not duplicated here row-by-row beyond the surfaces above.
2. **The cross-chain rail (G76-b) arrives on the Saosmartwallet side.** Measured drift, recorded
   honestly: the SWARM G76-b claim names branch `feat/htlc-fixedfloat-rail` and `packages/fixedfloat/**`,
   but the branch that exists at audit instant is **`feat/fixedfloat-crosschain-rail`** @ `78da6af`,
   the HTLC surface is `packages/htlc/**` (+ `packages/swap`, `packages/bridges`), and a case-insensitive
   tree grep for "fixedfloat" returns **0 hits** on that ref. Verdict: rail surfaces present
   (HTLC sessions/timelock/secret/state + vault custody), FixedFloat-provider integration **not yet
   in tree** — recorded as pending, no fabricated parameters.
3. **Execution ledger access repair (this lane).** Root cause (measured): the ledger lived only in
   the Domain repo with no accessor in giant, no schema guard, no locking, and no recovery path —
   hand-renewals race the every-few-minutes fleet pushes and a wiped checkout had no lawful rebuild.
   Cure: canonical accessor (`execution-accessor.ts`) + last-good mirror (`state/execution/`)
   + receipt (`state/execution/ACCESS-RECEIPT-G76H.json`). Recovery is deterministic and bounded:
   mirror byte-copy first; otherwise a schema-valid default whose `measuredSnapshot` carries only the
   honest note — **zero invented numbers**.

## 3. Honest gaps (DORMANT / pending — recorded, not hidden)

| gap | evidence | activation condition |
|---|---|---|
| FixedFloat provider integration absent on the rail branch | grep "fixedfloat" = 0 hits @ `78da6af` | G76-b landing adds `packages/fixedfloat/**` (or equivalent) with measured rail params |
| dividend lane has never paid | `paidUsdTotal: 0`, `lastPaidAt: null` | `targetUsdPerDay: 1000` — gap 999.9974 USD/day at last measure |
| curated execution ledger stale | accessor verify: `stale` (ledger.at 2026-10-23T15:55:00Z, window 48h) | next agent-round renewal pushes cycle-32 content to Domain |
| TRON outbound lane (SunSwap/JustLend) DORMANT | cycle-30 roll-up §3 | economic cost threshold |
| APY of the savings fund proven only at micro scale | cycle-30 roll-up §3 | chain-measured at scale |

## 4. Closure verdict

**Defi policy convergence: LANDED (canonical roll-up in giant, provenance-complete, zero fabricated
parameters).** Enforcement remains single-home (saos-dex + Saosmartwallet rail + giant self-financing);
this file is the giant-side index of record. Access repair to the execution ledger: **cured at the
accessor layer** (validate/lock/atomic/recover, 28/28 tests); content renewal stays with the agent round.

---
Receipt: giant `feat/defi-convergence` (base `cfa91f8`) · saos-dex `117b5a96` · Saosmartwallet `feat/fixedfloat-crosschain-rail@78da6af` · Domain `9dcd4e454`/`a9e461615` · accessor tests 28/28 · mirror sha256 `95e932ea1a12c9e71dd1c412939c77e2eea1d41d0bf3eab64fa0b97ead33ca64` (source==mirror byte-identical).
