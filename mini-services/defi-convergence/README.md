# defi-convergence — canonical Defi policy roll-up + execution-ledger accessor

G76-h lane (`feat/defi-convergence`). Path ownership: `docs/**`, `state/**`, `mini-services/defi-*/**`.

## Surfaces

1. **`execution-accessor.ts`** — canonical accessor for the `SAOS-EXECUTION-LEDGER/1` ledger
   (`Domain/execution-state.json`): schema validation, staleness law (48h, from the ledger's own
   `freshness.staleAfterHours`), deterministic recovery (last-good mirror byte-copy → bounded
   default with zero invented numbers), O_EXCL lock with stale takeover, atomic tmp+fsync+rename writes.
2. **`execution-accessor.test.ts`** — 28 deterministic zero-dep tests (injected clocks, temp roots;
   no network, no sleeps beyond lock-retry cadence).
3. **`cli.ts`** — `verify | recover | mirror` runnable surface with fail-honest exit codes
   (0 ok · 2 stale · 3 invalid · 4 missing · 5 refused).
4. **`docs/DEFI-POLICY-ROLLUP.md`** — canonical roll-up of the measured Defi policy surfaces
   (saos-dex AMM/fees/owner-gate, curate amplifier, HTLC cross-chain rail, self-financing channels),
   every section citing repo + path + commit provenance.
5. **`docs/decisions/DEG9-legacy-eviction.md`** — legacy-archive eviction audit (DECISIONS #42/#43),
   record-only; eviction itself is Instance 0's.

## Run

```sh
bun test mini-services/defi-convergence/
bun mini-services/defi-convergence/cli.ts verify
bun mini-services/defi-convergence/cli.ts mirror    # refresh state/execution last-good mirror
```
