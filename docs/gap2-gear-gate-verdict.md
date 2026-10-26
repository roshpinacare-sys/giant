# GAP-2 — Canary Volume Gear: Promotion Gate Verdict

**Wave:** G77-f · **Directive:** owner MASTER DIRECTIVE §4 GAP-2 — *"shift trade volume limits from Canary Gear 1 to Gears 2 & 3 based STRICTLY on green test receipts."*
**Gate law:** `SAOS-GEAR-GATE/1` — giant-side independent replay of the R329/R330 gearbox law of saos-dex (`grids/policy.mjs:recordLadderReceipt`).
**Gate code:** [`src/lib/gear-gate.ts`](../src/lib/gear-gate.ts) · **Tests:** [`tests/gear-gate.test.ts`](../tests/gear-gate.test.ts) (24 deterministic, zero-dep, no clock) · **Executed receipt:** [`state/gap-closure/gap2-gate-run.json`](../state/gap-closure/gap2-gate-run.json) (run via `bun Pulse/scripts/gap2-gate-run.mjs`).

---

## 1. The gear table of record (measured, saos-dex `grids/state/policy-gears.json`, SAOS-POLICY-GEARS/1)

| Gear | Requirement | Per-op cap | Per-cycle cap | Effective per-op after measured kelly |
|---|---|---|---|---|
| 1 | greenStreak ≥ 0 | 25 SBD | 120 SBD | **3 SBD** (kelly) |
| 2 | greenStreak ≥ 6 | 50 SBD | 240 SBD | **3 SBD** (kelly) |
| 3 | greenStreak ≥ 12 | 100 SBD | 480 SBD | **3 SBD** (kelly) |

Law of the road (unchanged, cited from the table itself): gears change **only** from accumulated ladder receipts; upshift is slow (green streak), downshift is **instant** (any `ACTS-FAILED`/`POLICY-HALTED` resets streak and gear to 1); neutral verdicts neither grow nor reset; the owner gate is untouched; R330 kelly prices speed from measured expectancy and can only tighten.

## 2. Measured state at gate-run time

| Measurement | Value | Source |
|---|---|---|
| Git-written gearbox state | **gear 1, greenStreak 1**, lastVerdict `ARMY-ACTED` @ 2026-10-26T14:50:57.615Z | `policy-gears.json` `.state` |
| History-tail green streak (independent derivation) | **1** — agrees with git state | `streakFromHistory(history)` |
| Independent replay over the combined ledger (455 receipts: army 405 + treasury 50) | **gear 1, streak 1** — agrees with git state (zero cross-check discrepancies) | `state/gap-closure/gap2-gate-run.json` `runs.primary_ledgers` |
| Receipt mix | army: 296 green / 62 red / 47 neutral · treasury: 32 green / 0 red / 18 neutral | same receipt |
| Last instant reset | `ARMY-ACTS-FAILED` @ 2026-10-26T14:20:38.411Z → streak 0, gear 1 | `policy-gears.json` `.state.history` |
| Gear 2 evidence in the window | the road DID reach gear 2 once today (streak 6 @ 13:53:29.733Z) before the 14:20 reset — promotion mechanics measured working | same history |

## 3. Verdict per gear (the executed gate outcome)

> **Gear 1 → Gear 2: HELD — missing evidence: 5 more consecutive green verdicts** (streak 1/6; e.g. `ARMY-ACTED`/`LADDER-ACTED`).
> **Gear 2 → Gear 3: HELD — missing evidence: 11 more consecutive green verdicts** (streak 1/12).
> The hold is the **lawful outcome** under the mission law ("shift … based STRICTLY on green test receipts"): the measured receipts do not yet satisfy the table's own promotion requirements, and the gate holds with the exact missing evidence listed instead of promoting on hope.

Sub-verdicts recorded in the run receipt:
- `army_ledger` alone: HELD gear 1 streak 1 (the army lane is the red driver — 62/405 `ARMY-ACTS-FAILED`).
- `treasury_ledger` alone: **PROMOTED gear 3, streak 32** — the treasury ladder has *zero* red receipts; if it fed the road alone the road would sit at gear 3 by law. The mixed-stream law (both ladders feed one gearbox) is what holds the road at gear 1.
- `gear_history` (git-written 20-entry history replayed): HELD gear 1 streak 1 — three independent measurements agree with the git state; the auditor and the road have not drifted.

## 4. Structural findings (measured — what actually blocks the upshift)

1. **The red driver is a parity-floor epsilon skip, not a market loss.** Inside failed army beats the executed actions are dominated by `PARITY-FLOOR-SKIP` with why `"sell 0.10736 < parity-floor 0.107360"` — the parity-floored price equals the floor yet the comparison rejects it (float epsilon), turning a legal parity order into a skip; an all-skip beat publishes `ARMY-ACTS-FAILED`, which instantly resets the streak. 119 such skips across the 62 failed beats. **Fix belongs to saos-dex** (grid parity-floor comparison) → **handoff H-2a**. This is the single highest-leverage cure for GAP-2: it converts recurring instant resets into green beats.
2. **The R330 kelly governor already prices the road at 3 SBD regardless of gear.** kelly snapshot `mode=kelly cap=3 SBD vs gearCap=25` (informative fills 392 ≥ minBeats 10); `kelly-sizing.json` measures **NO-EDGE** (full-Kelly −422 bps; Σprofit −$0.12799 over 191 informative fills). So even a promoted Gear 2/3 would not loosen the effective money cap — expectancy must improve first. The gear ladder is reliability-earned speed on a road the kelly filter currently keeps narrow (by design: kelly can only tighten, never loosen).

## 5. What this lane did NOT do

- The gate is a **read-only auditor**: it never writes `policy-gears.json` (the road's writer is saos-dex `recordLadderReceipt`; the table lives in git there and the code only reads the table).
- No caps were changed anywhere. No arm file was created. The owner gate is untouched.

## 6. Handoffs

- **H-2a** (saos-dex): cure the parity-floor epsilon (`sell <price> < parity-floor` where price === floor) so parity orders are accepted or skipped honestly without failing the beat; then the streak can accumulate and the gearbox promotes by its own law.
- **H-2b** (saos-dex): the treasury ladder's 32-green zero-red record stands as the measured template — army beats reaching treasury-grade verdict discipline would promote the road to gear 3 in ≤12 beats.
- **H-2c** (owner/expectancy): NO-EDGE (−422 bps full-Kelly) keeps effective caps at 3 SBD; gear promotion without an edge only widens a road the kelly filter narrows again.
