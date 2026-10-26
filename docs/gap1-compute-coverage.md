# GAP-1 — Compute Coverage Ledger (COMPUTE WALL)

**Wave:** G77-f · **Directive:** owner MASTER DIRECTIVE §4 GAP-1 — *"internal yield capture must cover private-repository compute overhead."*
**Machine ledger of record:** [`state/gap-closure/gap1-coverage-ledger.json`](../state/gap-closure/gap1-coverage-ledger.json) (reproducible: `bun Pulse/scripts/gap1-coverage.mjs --print`).
**Measured at:** see `at` field of the ledger (2026-10-26, wave G77). Every number below carries its source; unreadable sources are named `unmeasured`, never zeroed, never guessed.

---

## 1. The named overhead: private-repository compute

| Measured fact | Value | Source |
|---|---|---|
| Repos in fleet census | 40 | `Pulse:state/network.json` `totals` (census 2026-10-26T14:31:07.280Z) |
| **Private repos** | **0** (public 40) | same census — `totals.private = 0` |
| Billable private Actions minutes | **0** — GitHub bills Actions minutes for **private** repos only | derived: 0 private repos × any rate = 0 |
| Historical wall (what GAP-1 was opened against) | parkedAt **2026-10-13T22:40:00Z**, 18 repos parked, armed, sentinel `Sandbox` | `Autonomy:agents/compute-park-ledger.json` (public raw, fetched live) |
| Wall trigger (historical) | "private-repo Actions minutes exhausted — ~95 blocked-run emails in one day (0-step startup failures on every scheduled job in private repos)" | same ledger, `reason` field |
| Canary health | `armed-healthy`, run 40227856443 success @ 2026-10-25T19:51:04Z; **6 consecutive green daily canary events** since 2026-10-20T13:40:25Z | `Autonomy:agents/compute-journal.jsonl` (46 events, fetched live) |
| Repos excluded from the park (alive by law) | `steem` ("processes honest skips without runners — zero failures") | same ledger, `excluded[]` |
| Local sovereign estate compute | 2 vCPU (Intel Xeon), 4042 MB RAM, **un-metered** — the estate pays no per-minute API for its own sandbox; printing a $ price would be invention, so none is printed | `os.cpus()`/`os.totalmem()` measured at run |

## 2. The yield side (books of record, all in git receipts)

| Stream | Measured | Source |
|---|---|---|
| External chain income (24h window) | **$0.0281** (899.126534 VESTS, chain-curation, 88 txid-evidenced ops, 7 accounts; vests→USD @ 0.0006208149674253933) | `saos-dex:grids/state/external-profit-public.json` @ 2026-10-26T14:14:33.151Z |
| Grid real PnL (chain truth, `fill_order` only) | 730 fills · ΣSBD delta **−354.186** · realized −2.473686 SBD · open position 4,594.924 STEEM (unbased +137.32 SBD not claimed as profit) | `saos-dex:grids/state/pnl.json` @ 2026-10-21T05:24:37Z |
| Internal dex treasury accounting | profit-ever **18,395,468 µ** (µ=10⁻³ USDS ⇒ 18,395.47 USDS internal units, internal bookkeeping — not chain-external income) · credits treasury 435,532 µ · fee meter 33 µ | `saos-dex:grids/state/internal-pnl.json` @ 2026-10-19T14:20:36Z |
| Dex market throughput | 14 days (2026-10-13 → 2026-10-26): Σ quote volume **73,270,925 µ** ≈ 73,271 USDS · 81,245 trades | `saos-dex:db/dex-metrics.json` @ 2026-10-26T14:56:33Z |
| Credits claimed vs unclaimed (dex-beat) | `claimed0 · Σ14250 credits` — fee-meter credits accruing, zero claimed | `saos-dex` dex-beat commit f74a4b6a (2026-10-26T14:56:33Z) |
| Trading expectancy (R330 kelly) | **NO-EDGE** — full-Kelly **−422 bps** · Σprofit **−$0.1279946218682384** over 191 informative fills (103W/88L, avg win $0.01589 / avg loss $0.02005) | `saos-dex:grids/state/kelly-sizing.json` @ 2026-10-24T16:55:10Z |
| Self-financing census | verdict `PLAN-READY (census-only — no keys injected, honest)` · gap-to-target **$999.9974** (target $1000) | `saos-dex:grids/state/self-deposit-receipts.jsonl` (14 receipts, tail 2026-10-21T12:27:38Z) |

## 3. Verdict (honest)

> **COVERED-BY-STRUCTURE for the named overhead — and nothing more is claimed.**

1. **The named overhead (private-repository compute) measures ZERO today.** The fleet census counts **0 private repos**; GitHub Actions minutes are billable **only** for private repos. The wall GAP-1 was opened against (2026-10-13, 18 repos parked on exhausted private minutes) is **retired by visibility** (all 40 repos public — free Actions minutes on public repos), confirmed by 6 consecutive green daily canaries and the ledger's `armed` revival path. Coverage of a $0 overhead requires $0 of yield — structurally covered, no yield needs to be consumed.
2. **What is NOT claimed:** the sovereign self-financing census beyond the named overhead stays **OPEN by its own books** — gap-to-target **$999.9974** of the $1000 target, measured income **$0.0281/24h** (curation only), trading expectancy **NO-EDGE (−422 bps full-Kelly)**. Local sandbox compute (2 vCPU) is real but un-metered; comparing un-metered compute against metered income without a price would fabricate a number, so the ledger prints no such comparison.
3. **Internal µ bookkeeping is not income.** The 18,395.47 USDS-equivalent treasury profit-ever and the 73,271 USDS 14-day throughput are internal dex units; they are recorded here for completeness with their units, never converted into an external coverage claim.

## 4. Wiring status (giant-side vs cross-repo)

- **Giant-side (done, this branch):** the coverage measurement is wired as a reproducible zero-dep scheduled-job candidate — `Pulse/scripts/gap1-coverage.mjs` (node stdlib only: `node:https`, `node:fs`, `node:os`). It fetches the public Autonomy ledger/journal, reads the fleet census + dex books, and emits the machine ledger. **Missing only the workflow registration** — `.github/workflows/**` at giant root is outside this lane's owned paths (`Pulse/**`, `state/**`, `docs/**`) → **handoff row H1**.
- **Cross-repo (handoff, not done here):**
  - **H1** — register the scheduled job: a 6h `workflow_dispatch`+`schedule` workflow running `bun Pulse/scripts/gap1-coverage.mjs` and committing the refreshed ledger. One file, root `.github/workflows/` (Instance 0 / workflows lane).
  - **H2** — saos-dex: credits claiming (Σ14250 credits accruing, `claimed0`) is the internal-yet-unrealized yield path; claiming flow lives dex-side.
  - **H3** — owner decision: the $1000 self-financing target's income path (self-deposit legs are `PLAN-READY`, census-only, key-gated — R42 rails; not a code task).

## 5. Source integrity

All sources are git-resident books or public raw fetches made at run time; the fetch is re-runnable and every run re-derives every number. No token was used or needed (public raw + local clones). Zero fabricated metrics: where a value cannot be measured (e.g. a $ price for un-metered local compute, per-min private minutes with 0 private repos), the ledger stores `null`/a named unmeasured row instead of a guess.
