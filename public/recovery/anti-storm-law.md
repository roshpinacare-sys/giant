# The Anti-Storm Law (governance)

Adopted 2026-10-13, owner mandate trace 1a1374da43d52c39 ("אני רק מקבל באימייל חסימות כל כמה דק").

## The failure this law closes
Every scheduled workflow that exits non-zero on GitHub produces a notification
email. With ~120 scheduled workflows across 6 repos — honest fail-loud designs,
secret-dependent jobs, and writer-races — "honesty" was implemented at the WRONG
layer (the runner's exit code), so the operator's inbox paid for every red.
Measured 2026-10-13: 22+ failing workflows, office book stale since 11:26Z,
failure emails every few minutes.

## The law
1. **Measurement is a duty; alarm is a record.** A scheduled scanner/measurer
   exits 0 when its duty is done — even if the world is RED. The RED lives in
   the book (network/STATE.md), the claims (ops/claims/), and the ledger
   (ops/decisions.jsonl). Honesty is never deleted; it is RE-HOMED.
2. **One signature, one escalation.** A new problem signature opens exactly ONE
   deduped issue (`sig:<hash>` in the body). No repeat emails for a known,
   still-open signature. Resolution closes the claim with evidence.
3. **Autonomy before the operator.** Claims are routed to `claims-triage`
   first: self-heal attempt (redispatch) → quarantine (disable the failing
   schedule, keep the book loud) → and only then one `operator-needed` issue.
4. **No lock while sleeping.** A workflow that holds a concurrency group must
   not sleep inside the run (measured: office-pulse held `domain-office-writers`
   up to 30 min/run, starving the twins into timeouts). Dispatch-and-exit;
   cron keeps the clock.
5. **Publishers defer, never storm.** A writer that loses a push race after its
   retry budget names its terminal (`publish-deferred`) and exits 0 — the next
   scheduled flight re-lands the book. The disk copy is always kept.
6. **Sandboxes are accelerators, not the spine.** CI (Actions) is the network's
   only required runtime; any sandbox heartbeat is an optimization. Absence of a
   sandbox degrades a number, never the network.
