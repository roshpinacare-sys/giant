# Lane: meta-planner (Thread 3 — Autonomous Meta-Planning)

Directive trace `1a1693e90c1532dd` (swarm concurrency + canonical convergence) · Pulse/DECISIONS **R365** (claim `aa4bcd4`) · SWARM_STATE row `autonomy-lane` (wave 19.78, claim commit on giant main).

## 1. What was built

A deterministic, zero-dependency codebase-inspection engine that converts architectural
debt into **structured issue-contracts for the swarm** — the Thread-3 capability
(Autonomous Meta-Planning) exactly as specified in §4.3 of the directive:

- **Engine** (`lib/scan.ts`): 5 mandatory rules over the import graph of a TS/JS tree —
  orphan-module (zero inbound edges, entries exempt), circular-import (Tarjan SCC,
  canonical chain), placeholder-code (uppercase marker convention + prose phrases),
  plaintext-secret (github/WIF/PEM/AWS/xprv/seed-shaped literals), silent-catch
  (empty or comment-only catch blocks, brace-matched).
- **Contracts** (`lib/issues.ts`): findings → `IssueContract[]` sorted by severity, each with
  a cited canonical invariant, a non-breaking proposed fix, and a **SHA-256 hash-linked
  receipt** (`prevHash` chain, append-only) — the §3 Immutable Audit Trail requirement.
- **CLI** (`index.ts`): `bun index.ts [target] [--ignore <name>] [--out <dir>] [--fail-on <sev>]`;
  **fail-closed** — exit 1 on any finding ≥ threshold (default `high`), exit 2 on internal
  receipt-chain break; reports written atomically (tmp+rename) to `state/issues.json`+`issues.md`.
- **Secrecy discipline (§7B)**: evidence snippets for secret findings are ALWAYS redacted
  (`ghp_AA…REDACTED(len=40)` shape) — zero raw secret bytes in contracts, reports, or stdout.

## 2. Scope declaration (files touched)

- `mini-services/meta-planner/**` — NEW, fully isolated:
  `index.ts`, `lib/contracts.ts`, `lib/scan.ts`, `lib/issues.ts`,
  `test/meta-planner.test.ts`, `test/fixtures/{clean,dirty}/**`, `package.json`,
  `state/issues.json`, `state/issues.md` (green self-scan receipts).
- `docs/lanes/meta-planner.md` — NEW (this document).
- `SWARM_STATE.md` — claim row added on main (separate claim commit `d693457`).
- **Zero changes** to giant `src/`, zero shared files with sovereign-lane's
  Saosmartwallet slice (Thread 2), zero new dependencies (node:fs/path/crypto only).

## 3. Test execution proof (green)

```
$ bun test test/
 19 pass
 0 fail
 45 expect() calls
Ran 19 tests across 1 file. [35.00ms]

$ bun run selfscan
META-PLANNER: scanned=5 findings=0 contracts=0 failOn=high breach=0 out=state
exit=0
```

Coverage: import-graph resolution (extension/index candidates), all 5 rules
(green+dirty fixtures, exact line expectations), secret redaction (raw bytes asserted
absent from output), receipt-chain build+verify+tamper detection, byte-identical
determinism across runs, CLI exit codes (1 breach / 0 clean) + report schema,
and a **self-scan proof**: the engine scans its own source (fixtures excluded as
declared test data) and yields zero findings — the §12 zero-debt bar applied to itself.

## 4. Non-breaking verification

- Additive-only module; no public contract, import graph, or cryptographic interface
  of giant touched (no `src/` diff).
- Determinism guarantee: identical input ⇒ identical contracts/IDs/receipt hashes
  (asserted in-suite). No timestamps in identity fields.
- Conventional commits, single-purpose branch `feat/meta-planner-issue-contracts`.

## 5. Handoff interfaces (for sister instances)

- `scanTarget(root, {ignore?, extraEntries?}) → {files, findings, importEdges}`
- `buildContracts(findings) → IssueContract[]` · `verifyChain(contracts) → string[]` (empty = valid)
- `runCli(argv, cwd) → {code, scanned, findings, contracts, outDir, summaryLine}`
- Consumable artifact: `state/issues.json` (`schema: "meta-planner/issues@1"`) —
  swarm instances can read contracts directly as work items.
