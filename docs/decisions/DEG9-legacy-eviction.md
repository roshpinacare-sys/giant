# DEG9 — Legacy-archive eviction audit (Zip / Project-files) — DECISIONS #42/#43

> Lane: **G76-h** · giant `feat/defi-convergence` (base `cfa91f8`) · measured 2026-10-26T14:30Z
> Directive (owner, ULTIMATE ENGINEERING DIRECTIVE §4 / SINGLE CANONICAL TRUNK, DECISIONS #42 & #43):
> "Finalize full code convergence into giant. **Isolate/evict all legacy archives (Zip, Project-files).**"
> **Scope law: this audit is RECORD-ONLY. The actual eviction is Instance 0's** (G76-h write scope:
> `docs/**`, `state/**`, `mini-services/defi-*/**`).

## 1. Measured census method

- `git ls-files -s` over the tracked tree (shallow clone, main @ `cfa91f8`) — mode `160000` (gitlink)
  entries = embedded clone snapshots ("Project-files" class); plus explicit scan for archive files
  (`*.zip|*.tar|*.gz` → **0 hits** at repo root and in the tracked tree; the literal `Zip` artifact is a
  gitlink directory, `estate/work/t34-fresh/Zip`).
- On-disk verification: every gitlink target renders as an **empty directory** in a fresh checkout —
  the pointers are unresolvable here (shallow), proving the clones carry no live content in-tree.
- Consumer scan: `rg` across `src/ tools/ scripts/ mini-services/` for references to the tracked paths.
- Size evidence: pack **88.65 MiB**, worktree **292 MB** — gitlinks are byte-cheap pointers; the case
  for eviction is **truth-of-tree** (dead topology that misleads discovery and tooling), not bytes.
- Last-touch: all 29 legacy gitlinks sealed by `138e03e` — "voice-ops seal [auto]" **2026-10-18T15:31:20Z**
  (8 days before audit; superseded by the estate-sync anchor canon, giant gal-18).

## 2. Verdict table

| artifact (tracked path) | entries | pinned SHAs (recovery pointer) | verdict | reason (measured) |
|---|---|---|---|---|
| `estate/work/t30-fresh/{FleetHQ,Sandbox,roshpina}` | 3 | `d0ca66f5`, `560e44ff`, `1aa4ab53` | **EVICT** | embedded-clone snapshot, task-scoped (t30); no in-repo reader; host counterpart `/home/z/my-project/estate/work/` **does not exist** (wiped — `ls` measured 2026-10-26); canonical FleetHQ/roshpina live in the org |
| `estate/work/t31-fresh/{FleetHQ,Sandbox,roshpina}` | 3 | `9c896116`, `83fa0900`, `1aa4ab53` | **EVICT** | same class as t30 (superseded task snapshot) |
| `estate/work/t33-fresh/{Console,Domain,FleetHQ,Sandbox}` | 4 | `6323e69c`, `205d6a9b`, `188a91d9`, `61e7f4fb` | **EVICT** | same class; note `src/lib/sectors.ts:10` reads the **host** path `/home/z/my-project/estate/work/t33-fresh` (wiped location — an honest-missing degrading dependency), **not** this tracked copy — eviction of the gitlink does not touch that code path |
| `estate/work/t34-fresh/{Console,Domain,FleetHQ,Sandbox,`**`Zip`**`,roshpina,saos-dex}` | 7 | `6f788365`, `e6a38442`, `20293e26`, `2612de24`, **`d97897da` (Zip)**, `fe95dcec`, `3eb0dca4` | **EVICT** | the literal **Zip** archive entry of DECISIONS #42/#43 — unresolvable embedded snapshot; 0 tracked `*.zip` payloads exist; empty on disk |
| `t35/{Console,Domain,FleetHQ,Sandbox,roshpina,saos-dex}` | 6 | `5ff1d9ab`, `c063b21a`, `5e1c283f`, `34e0365f`, `fe95dcec`, `48892ffc` | **EVICT** | estate topology labels t35 "archive" (`src/app/api/estate/state/route.ts:198`), but that label describes host-side dirs; `src/lib/estate-discovery.ts:5` records (gal-18, measured) that discovery **no longer peeks at t35/t36** — the real machine lives under `estate/·lane/·channels/·autonomy-fix`; tracked gitlinks are dead topology. Reversible alternative: `git rm --cached` + tag `legacy/t35` |
| `t36/{Console,Domain,FleetHQ,Sandbox,roshpina,saos-dex}` | 6 | `e39231a8`, `36bc0bc6`, `bde6fbb4`, `9de011b8`, `9525d1c3`, `01a925ea` | **EVICT** | route comment (`estate/state/route.ts:149`) records the t36 legacy canon as **already restored via estate-sync anchors** — the tracked gitlinks duplicate that as unresolvable pointers. Same reversible alternative (`legacy/t36` tag) |
| `.zscripts/dev.pid` | 1 | content `1078` (stale PID) | **EVICT** | runtime PID file committed by accident; sibling `.zscripts/*` build/start scripts are live and stay |
| `download/README.md` | 1 | — | **EVICT** | upstream template placeholder ("Here are all the generated files."), zero fleet content, zero code references to this tracked dir (forge's `download` matches are its own API routes) |
| `sovereign/rail-canonical/*.b64` + `MANIFEST.sha256` | 6 | `beff43c8…`, `c6337da1…`, `db896432…`, `0be08771…`, `cc935b38…` | **KEEP** | live receipts-rail canonical blobs; guardian law re-PUTs them on divergence — active infrastructure, not archive |
| `reports/*.png` (61) + root `0*.png` (6) | 67 | — | **KEEP** | measured visual evidence receipts (doc-truth/ext-audit/waves); referenced by truth pages |
| `docs/lanes/*.md` (9) | 9 | — | **KEEP** | live lane doctrine/protocol docs (PROTOCOL.md, sovereign-channel-live.md, …) |
| `mini-services/fleet-economy/state/quarantine/*` | 12 | — | **KEEP (already ISOLATED)** | active quarantine by the custody-guard of its own service (dated 2026-10-16..18); isolation is that service's function; outside G76-h write scope — recorded, untouched |
| `db/`, `repos/saos-dex/db/*` | 13 | — | **OUT OF SCOPE (record-only)** | live DEX book/state data; `db/**` VERBOTEN to G76-h; listed for census completeness |

**Totals: 29 gitlink entries EVICT (23 in `estate/work/t3X-fresh`, 12 across `t35`/`t36`, incl. the
`Zip` artifact) · 2 file EVICTs (`dev.pid`, `download/README.md`) · KEEP: rail-canonical, evidence
receipts, lane docs, service-owned quarantine · 0 fabrications: every SHA and path above was read
from `git ls-files -s` at audit instant.**

## 3. Execution recipe for Instance 0 (record-only)

```sh
# reversible eviction (recommended): untrack the pointers, tag the pins first
git tag legacy/project-files-20261026 && \
git rm -r --cached estate/work t35 t36 && \
git rm --cached .zscripts/dev.pid download/README.md
# host-side mirror dirs (wiped already) need no action; estate-sync anchors carry the canon
```

Recovery after eviction: pinned SHAs preserved in §2 and in tag `legacy/project-files-20261026`;
host clones remain at the canonical org repos (`roshpinacare-sys/*`).

## 4. Honest residual

- The gitlinks cost ~0 bytes; eviction value = single-canonical-trunk truth (DECISIONS #42), not size.
- `src/lib/sectors.ts` still points at the wiped host estate (`/home/z/my-project/estate/work/…`) —
  an honest-missing dependency **outside G76-h scope** (`src/**` not owned by this lane); flagged for
  the owner/next wave: either repoint to the live `/home/z/estate` roots (gal-18 discovery roots) or
  record DORMANT.
- Audit instant is pre-eviction; re-run `git ls-files -s | awk '$1==160000'` after Instance 0's
  eviction to confirm **0 gitlinks** remain (expected end-state).

---

## 3. EXECUTION receipt — the eviction is DONE (G78-e, trace 1a17d4f7d0ecfe91, 2026-10-27T12:5xZ)

> Authority: Instance 0's WAVE G78 lane law assigns **e = giant (execution-ledger live receipts + DECISIONS #43)**
> (SWARM_STATE line 579, trace 1a17d4eee1b012c1) — this supersedes the G76-h record-only scope for the
> execution act itself; the audit above remains the recovery ledger.

- **Executed**: `git rm --cached` ×31 — all 29 legacy gitlinks exactly per the verdict table
  (t30×3 · t31×3 · t33×4 · t34×7 incl. the literal **Zip** · t35×6 · t36×6) + `.zscripts/dev.pid` (stale PID) +
  `download/README.md` (template placeholder). `--cached` eviction: **zero bytes of history lost**; recovery =
  the pinned SHAs in §2 + full git history.
- **Verified**: `git ls-files -s | awk '$1=="160000"' | wc -l` → **0** (census matched §2 exactly, nothing else
  was mode-160000); staged deletions = 31.
- **Consumer re-scan (zero tracked-path readers)**: 4 files reference these names and all are HOST-scoped —
  `src/lib/sectors.ts:11` reads the wiped host dir `/home/z/my-project/estate/work/t30-fresh/roshpina`;
  `src/lib/giant-git.ts:10` reads `/home/z/my-project/t36/Sandbox` (host);
  `src/lib/material-engine.ts` MATERIAL_SCAN_ROOTS scans DISK dirs that exist independently of gitlinks
  (untracked empty dirs on hosts are unchanged by eviction — the engine's scan surface is byte-identical);
  `src/app/api/material/read/route.ts` is a host-path doc reader. Zero code path reads the tracked gitlinks.
- **Green gate**: full suite **341/341** (incl. 7 new t64 selftests), src/lib 66/66.
- **Disk law**: nothing on any host disk was deleted — only the tracked dead topology left the tree.
