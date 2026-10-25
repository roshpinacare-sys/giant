# issue-forge — native issue-to-PR autonomous worker (giant §9)

**Port 3046 · loopback only · single-flight · honest.**

The perpetual autonomous engine bootstrapping §9: a self-triggering
audit → issue → claim → author → verify → PR loop that lives INSIDE giant and
develops giant. Every state transition lands in `state/forge-ledger.jsonl`
(schema `SAOS-FORGE/1`). Runtime state never enters git (`state/` is ignored).

## Cycle (bounded, one at a time — `state/claim.lock`, pid+ts, stale >30min breaks honestly)

| Phase | What happens (all real, no fakes) |
|---|---|
| **AUDIT** | Three deterministic auditors over the repo (READ-ONLY): `todo-auditor` (TODO/FIXME/XXX/STUB markers in `src/**/*.ts` — debt evidence, never auto-deleted), `testgap-auditor` (exported functions in `src/lib/**/*.ts` with no referencing test file), `ledger-auditor` (malformed JSON lines / duplicate consecutive hashes in the fleet-economy ledger — never written by this loop). |
| **ISSUES** | Top findings (max 3/cycle) become GitHub issues on `roshpinacare-sys/giant` labeled `sovereign-forge` + `subsystem:<x>`. Body carries strict TDD acceptance criteria: exact test command, definition of green, scope declaration. Idempotency: `[forge:<hash8>]` title suffix — one OPEN issue per content-hash. Nothing outside the sovereign-forge namespace is ever listed or touched. |
| **CLAIM** | Oldest open forge issue without a `SAOS-FORGE-CLAIM/` comment (observation-only `ledger` issues are never claimed). Claim = comment `SAOS-FORGE-CLAIM/<cycle>/<iso>` + label `claimed`. |
| **AUTHOR** | **Mode A** (testgap): probes the audited module in a bounded child process, captures REAL outputs of ≥3 deterministic calls (double-run determinism proof at authoring time) and writes `tests/<name>.forge.test.ts` — a genuine characterization suite, assertions computed from execution, never invented. **Mode B** (todo): asks the LLM for a unified diff (direct `z-ai-web-dev-sdk` import; fallback: local edge API `POST /api/sovereign/channel/ask` — contract `{text, token} → {ok, answer}`), validates with `git apply --check` + scope law (target file only); two failures → `author-refused` recorded, claim released. No fabricated diffs. |
| **VERIFY** | Temp branch `forge/issue-<n>` from current main HEAD. Real gate: `bun test tests/` (vacuously-honest when no test files exist) + `bun run lint` — full output captured. GREEN required to proceed. RED → ledger, claim released, temp branch deleted, honest comment on the issue. |
| **SHIP** | Push `forge/issue-<n>` → PR `fix(issue-<n>): <slug>` (body = scope + full test-output proof + `closes #n`) → squash merge ONLY after a FRESH local gate re-run passes. Non-green is never merged. |
| **LEDGER** | `{schema:"SAOS-FORGE/1", at, cycle, phase, issue, verdict, detail}` per transition. |

## HTTP API

```
GET  /health   → {ok, uptimeMs, lastCycle}
GET  /state    → {claims, lastFindings, ledgerTail}
POST /cycle    → one bounded cycle, verdict summary returned
```

Loop mode: `FORGE_INTERVAL_MS=<ms> bun --hot index.ts` → single-flight interval
loop (clamped ≥30s). Without it the service idles — trigger cycles externally
via `POST /cycle`. `EADDRINUSE` → log + exit 1.

## Run

```bash
bun --hot index.ts                 # idle server on 127.0.0.1:3046
curl -X POST localhost:3046/cycle  # one cycle
bun run selftest.mjs               # offline deterministic selftest (exit 1 on any failure)
```

The GitHub token is read at RUNTIME from `/home/z/my-project/upload/גיטראש.txt`
(never embedded, never logged — `redact()` scrubs it from every printed or
persisted byte).

## Honesty laws

1. Findings are debt **evidence** — deletion without implementation is forbidden.
2. Assertions in generated tests come from **real execution**, double-run-proven.
3. The gate is real: `bun test tests/` + `bun run lint`; a vacuous no-test run is
   recorded as vacuous, never as fabricated green.
4. Merge happens only after a **fresh** green gate re-run. RED never ships.
5. Every refusal (`author-refused`, `gate-red`, `push-failed`, …) is a ledger
   verdict — the loop never hides a failure, never retries into spam.
