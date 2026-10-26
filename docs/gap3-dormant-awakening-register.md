# GAP-3 — Dormant-Asset Awakening Register

**Wave:** G77-f · **Directive:** owner MASTER DIRECTIVE §4 GAP-3 — *"re-evaluate and awaken dormant fleet assets via verifiable quality gates."*
**Machine register of record:** [`state/gap-closure/gap3-register.json`](../state/gap-closure/gap3-register.json) (schema-pinned by [`tests/gap-register.test.ts`](../tests/gap-register.test.ts) — the register itself is a quality gate: no row can lose its evidence, gates, or verdict silently).
**Census sources:** Pulse `state/dormant-decisions.json` (16 rows, decidedAt 2026-10-14, reviewBy 2026-11-13) · Pulse `state/network.json` census (stale24h + staleUndecided) · giant DEG9 eviction (commit 7fc8053) · giant in-repo state.

---

## 1. Law of awakening (inherited + applied)

1. A dormant verdict is a **PLANNED state**, never a silenced one.
2. An asset wakes **only** when its named gate produces green, measured proof — never from a prompt, never from an arm file, never from this register's optimism.
3. Every row cites measured evidence; no evidence = `unmeasured`, never guessed.
4. Cross-repo awakening is a **handoff**, never a unilateral flip from this lane.
5. Re-review horizon: **2026-11-13** (inherited).

**Gate catalog** (full definitions in the register): `G-ROLE` (role re-declared, owner-briefed) · `G-LANE` (one green lane receipt: workflow run id or tested commit) · `G-KEYS` (owner key custody proof) · `G-CONSUMER` (a named custody consumer demands change) · `G-CENSUS` (verdict flipped in the Pulse census with evidence).

## 2. Measured roll-up (24 rows in the register)

| Population | Count | Measured state | Action |
|---|---|---|---|
| Fleet dormant census (`keep-dormant-on-purpose`) | 14 | role-declared why-silenced shells; lastCommit band 2026-10-11→10-13 | KEEP-DORMANT behind named gates (owner/keys/device/content-gated) — **zero fabricated awakenings** |
| Fleet census revived | 1 (Project-files) | keeper receipts flowing since 2026-10-14 | AWAKE (measured) |
| Stale-undecided (census `staleUndecided=5`) | 5 | saos-agents (pushed 10-24), agent9-clock (10-22), oss-scanner (10-22), saos-owner-channel (10-19), saos-markets (10-18) | HANDOFF: Pulse census lane must produce verdict rows before 2026-11-13 |
| Giant-internal | 4 | see below | 1 awakened by this branch, 2 measured awake, 1 awake-by-removal |

## 3. Giant-internal assets (this lane's own ground)

| Asset | Measured | Verdict |
|---|---|---|
| `estate/work/t3*-fresh`, `t35/`, `t36/`, `.zscripts/dev.pid`, `download/README` (29 gitlinks) | DEG9 eviction executed G76-0 (7fc8053, reversible tag `legacy/pre-DEG9-eviction`); tree resolves clean | **AWAKE-BY-REMOVAL** — restoration gate: real clones only (fetch-verified HEAD, zero gitlinks) + tests |
| `state/keys` vault | `VAULT-CENSUS.json`: **25/25 slots FILLED** (llm-brain 3, research 5, cloud-infra 4, steem-custody 8, owner-anchor 2, infra-pat 1, shards 1, core 1) | **AWAKE** (no action) |
| `state/execution` ledger | refreshed wave-81 (G76-h); SITE-render accessibility = Domain lane G77-c | **AWAKE** (handoff already registered) |
| `Pulse/state/network.json` gap-records surface | measured ABSENT in giant at base 0e09257 (SWARM_STATE line 472 referenced it; no `Pulse/**` existed) | **AWAKENED BY THIS BRANCH** — the gap-truth record now exists with dated verdicts + evidence pointers |

## 4. Closest-to-awake (honest ranking, measured)

1. **saos-control-center** — `control-center-build` run 40109614383 = **success @ 2026-10-24** (measured in the census); G77-a is landing its live work branch this very wave. Gate: merge G77-a + census flip (G-LANE already satisfiable).
2. **saos-sovereign-foundry / saos-sovereign-platform** — their "Actions quota-gated" excuse **expired with public visibility** (census `private=0`); only the owner brief + one green run remain. The dormant census row is measurably stale on that excuse and is queued for re-review.
3. **saos-agents** — most recently pushed of the undecided set (10-24); needs a verdict row, not silence.

## 5. Handoffs (register `handoffs[]`)

- **H-3a** Pulse census lane: decide the 5 staleUndecided rows before 2026-11-13.
- **H-3b** G77-d: production-HSM suite = Saosmartwallet's awakening gate (G-KEYS + G-LANE).
- **H-3c** G77-a: merge + census flip wakes saos-control-center.
- **H-3d** owner: briefs for Defi / Adsmarket / TruthRail / SovereignConsole / saos-sovereign-foundry / saos-sovereign-platform / negen / sandbox-private.

## 6. What was awakened giant-side (this branch)

- `Pulse/state/network.json` — the gap-truth surface (was absent; now carries GAP-1/2/3 dated verdicts + evidence pointers).
- `state/gap-closure/{gap1-coverage-ledger,gap2-gate-run,gap3-register}.json` — machine ledgers, schema-pinned by tests, re-derivable by `Pulse/scripts/gap1-coverage.mjs` and `Pulse/scripts/gap2-gate-run.mjs`.

No cross-repo config was flipped. Every dormant repo keeps its planned state until its own gate goes green — that restraint **is** the deliverable.
