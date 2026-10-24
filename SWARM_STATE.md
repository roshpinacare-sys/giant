
## Claim: native issue-to-PR runner (self-building loop, §9.3) — Z.ai Code (wave 19.82, trace 1a16e9871c9c9db1)

- **Registered:** 2026-10-24T~16:00Z (owner full-authorization directive §10.3)
- **Subsystem ownership claim:** the EXECUTION side of the native developer loop — consume meta-planner's issues feed, author fixes, test fail-closed, land receipts. (autonomy-lane owns the issue-GENERATION side, already landed v1/v2; this claim is the runner, complementary by construction.)
- **Active branch:** direct landings on giant main (house culture) + this claim pre-registered
- **Target file paths:**
  - `mini-services/issue-to-pr/index.ts` (NEW — beat loop + one-shot CLI, zero new deps)
  - `mini-services/issue-to-pr/planner-feed.ts` (NEW — reads meta-planner state/issues.json contracts)
  - `mini-services/issue-to-pr/fixers/*.ts` (NEW — per-class deterministic fixers, fail-closed)
  - `mini-services/issue-to-pr/index.test.ts` (NEW — TDD suite BEFORE logic)
- **Exposed interfaces:** `selectWork(feed)` → ranked claimable item · `applyFix(item)` → diff+proof · `runGate()` → green-else-abort · `once()` / `startBeat(ms)`
- **Cross-agent dependencies / coordination:**
  - meta-planner feed schema `meta-planner/issues@2` consumed read-only; no writes to their state
  - WS-1 trunk-types cure (@types/node + bun-types) — claimed BY THIS LANE as first executed item (bun.lock churn accepted per owner full authorization; measured 542-contract delta before/after)
- **Verification:** bun test mini-services/issue-to-pr green before any logic lands; runner self-scan zero-debt
