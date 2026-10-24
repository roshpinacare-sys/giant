/* custody-guard.mjs — deployment-safe tear-proofing for the live book (sovereign-fabric-liveness lane).
 *
 * WHY NOT gitignore/untrack (the measured lesson): a commit that untracks the live state files
 * makes every future `git checkout` of that commit DELETE the working-tree book under a running
 * engine → boot-heal quarantine + reseed = treasury history destroyed. Untracking is itself a
 * tear vector. (Live-measured: checkout refused on dirty book — the protection that saved it.)
 *
 * THE CURE: git update-index --skip-worktree on the volatile live files.
 *  - files stay tracked (zero checkout hazard in every clone)
 *  - local changes are invisible to git: `add -A` of the engine's seal can no longer stage them
 *    → no more vault-seal commits of the live book → no merge/pull/autostash tear windows
 *  - checkout/pull/merge never rewrite them (skip-worktree paths are left untouched)
 *  - the flag is per-clone by design → custody-guard re-asserts it on every watchdog cycle
 *
 * Custody durability is custody-seal.mjs's job (append-only state-custody/ snapshots).
 * Zero deps. Exit 0 = all flags asserted; exit 1 = any failure (fail-closed).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

/* the volatile live files: engine book + voice state (same measured tear class) */
const GUARDED = [
  "mini-services/fleet-economy/state/ledger.jsonl",
  "mini-services/fleet-economy/state/snapshot.json",
  "mini-services/fleet-economy/state/seal-log.jsonl",
  "mini-services/fleet-economy/state/spawn-receipts.jsonl",
  "mini-services/sovereign-voice/state/alerts.jsonl",
  "mini-services/sovereign-voice/state/alert-status.jsonl",
  "mini-services/sovereign-voice/state/fuel-log.jsonl",
  "mini-services/sovereign-voice/state/seal-log.jsonl",
  "mini-services/sovereign-voice/state/heal-log.jsonl",
  "mini-services/sovereign-voice/state/disk-log.jsonl",
];

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

export function guardState() {
  const tracked = new Set(git(["ls-files", "mini-services/fleet-economy/state/", "mini-services/sovereign-voice/state/"]).split("\n").filter(Boolean));
  const existing = GUARDED.filter((f) => tracked.has(f) && existsSync(join(REPO_ROOT, f)));
  const missing = GUARDED.filter((f) => !tracked.has(f) || !existsSync(join(REPO_ROOT, f)));
  const flagged = existing.length
    ? new Set(git(["ls-files", "-v", ...existing]).split("\n").filter((l) => l.startsWith("S ")).map((l) => l.slice(2)))
    : new Set();
  const need = existing.filter((f) => !flagged.has(f));
  return { existing, need, missing };
}

export function assertGuard() {
  const { existing, need, missing } = guardState();
  if (need.length > 0) {
    git(["update-index", "--skip-worktree", ...need]);
  }
  const after = guardState();
  return {
    ok: after.need.length === 0,
    guarded: after.existing.length,
    newlyGuarded: need.length,
    notPresent: missing,
  };
}

/* CLI: assert + honest report */
if (import.meta.main) {
  const r = assertGuard();
  if (!r.ok) {
    console.error("CUSTODY-GUARD-FAIL: flags not assertable — fail-closed");
    process.exit(1);
  }
  console.log(`CUSTODY-GUARD-OK: ${r.guarded} live files guarded (${r.newlyGuarded} newly asserted, ${r.notPresent.length} not-present)`);
}
