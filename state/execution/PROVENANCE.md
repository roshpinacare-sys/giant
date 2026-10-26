# state/execution — last-good mirror of the SAOS-EXECUTION-LEDGER

Path ownership: G76-h (`state/**` per SWARM_STATE WAVE G76 claim line 390).

## What lives here

| file | what it is |
|---|---|
| `execution-state.json` | byte-true last-good copy of `roshpinacare-sys/Domain/execution-state.json` — the recovery source for the canonical accessor |
| `ACCESS-RECEIPT-G76H.json` | measured receipt of the G76-h verify/recover/mirror run that established this mirror |

## Provenance (measured, 2026-10-26)

- source repo: `roshpinacare-sys/Domain` (checkout `/home/z/audit/repos/Domain`, clean vs `origin/main` @ 9dcd4e454)
- last commit touching the file: `a9e461615` — "execution-ledger: cycle-31 — §9 closed (PR #240 autonomous), supervisor :3047 live, Kelly NO-EDGE honored, HTLC canonical"
- sha256 (source == mirror, byte-identical): `95e932ea1a12c9e71dd1c412939c77e2eea1d41d0bf3eab64fa0b97ead33ca64`
- schema: `SAOS-EXECUTION-LEDGER/1`, ledger `at` = 2026-10-23T15:55:00Z
- accessor verdict at mirror time: **stale** — the ledger's own 48h freshness window has lapsed; renewal remains the agent-round duty (this accessor never invents content to hide that)

## The accessor

`mini-services/defi-convergence/execution-accessor.ts` (tests: `execution-accessor.test.ts`, 28/28 green; runnable surface: `cli.ts verify|recover|mirror`).

Laws baked in:

1. recovery is deterministic and bounded — mirror byte-copy first, then a schema-valid default with **zero invented numbers** (`measuredSnapshot` = honest note only);
2. all writes are schema-validated, lock-guarded (`O_EXCL` + stale takeover) and atomic (tmp + fsync + rename) — concurrent beats cannot tear the file;
3. corrupt files are quarantined as `*.corrupt-<stamp>` — evidence is never deleted;
4. staleness is reported honestly (`stale` status, exit 2), never papered over.

Root cause this cures (measured 2026-10-26): the ledger existed only inside the Domain repo with no accessor in giant, no schema guard, no lock, no recovery — hand-renewals could tear against the every-few-minutes fleet pushes, and a wiped checkout had no lawful rebuild path.

## G77-b refresh (measured, 2026-10-26T15:47Z)

- source repo: `roshpinacare-sys/Domain` (checkout `/home/z/estate/Domain` — post-wipe host path, main @ ce243aa7e)
- renewal race absorbed additively: lane 36-c had landed a renewal (cycles 33–35 consolidated + loader repair, `at` 15:36:02Z) while G77-b measured; G77-b rebased on that lineage — zero clobber
- sha256 (source == mirror, byte-identical): `b15399196323cb5c92cc58b03fe728ad96e0c9199210acf97baac9c99301f04b`
- schema: `SAOS-EXECUTION-LEDGER/1`, ledger `at`/`generatedAt` = 2026-10-26T15:43:44Z, top-level `cycle` = 36 (was absent/null — the Instance-0 shell state), `cycle33` section documents the G77-b measured renewal
- accessor verdict at mirror time: **ok, exit 0** (`cli.ts verify` — fresh within the ledger's own 48h window)
- receipt: `ACCESS-RECEIPT-G77B.json` (verify + mirror + 12 cited source families)
