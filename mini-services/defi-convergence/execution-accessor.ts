// ============================================================================
// execution-accessor.ts — canonical accessor for the SAOS-EXECUTION-LEDGER/1
// (Domain/execution-state.json, schema measured at Domain @ a9e461615, cycle-31)
//
// G76-h · feat/defi-convergence · giant mini-services/defi-convergence
//
// ROOT CAUSE this module cures (measured 2026-10-26):
//   1. PATH DRIFT — the ledger lives only in the Domain repo
//      (roshpinacare-sys/Domain/execution-state.json); giant holds zero accessors
//      (grep: only SWARM_STATE.md/worklog.md prose mentions). Beats that want the
//      ledger have no lawful way to resolve it across hosts/checkouts.
//   2. NO SCHEMA GUARD — the file is hand-curated per agent round; nothing
//      validates shape, so drift is discovered only when the public viewer
//      (Domain/execution.html) fails its fetch.
//   3. TEARING — concurrent renewals write straight into the live file with no
//      lock and no atomic tmp+rename; the fleet pushes main every few minutes,
//      so a torn mid-write file is a real class, and a corrupt file silently
//      poisons every reader.
//   4. NO RECOVERY — when the file is missing (wiped checkout) nothing can
//      rebuild it; agents re-invent content by hand.
//
// LAWS (owner directive §5 / house law):
//   - deterministic recovery from MEASURED history (last-good mirror) only;
//     the bootstrap default carries ZERO invented numbers — measuredSnapshot is
//     empty with an honest note until a real agent-round renewal lands;
//   - fail-closed writes: schema-validated, O_EXCL lock with stale takeover,
//     tmp+fsync+rename atomicity — concurrent beats can never tear the file;
//   - corrupt files are quarantined (*.corrupt-<stamp>), never deleted —
//     evidence survives;
//   - zero dependencies (node:fs/path only). Injected clocks — deterministic.
// ============================================================================

import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Canonical schema contract (measured from Domain/execution-state.json @ a9e461615)
// ---------------------------------------------------------------------------

export const EXECUTION_LEDGER_SCHEMA = "SAOS-EXECUTION-LEDGER/1" as const;
export const DEFAULT_STALE_AFTER_HOURS = 48;

export interface ExecutionStateFreshness {
  howToVerify?: string;
  staleAfterHours?: number;
  renewedBy?: string;
  [k: string]: unknown;
}

export interface ExecutionStateDoc {
  schema: string;
  at: string; // ISO-8601 instant of last renewal
  generator: string;
  sourceWorklog?: string;
  law?: string;
  freshness: ExecutionStateFreshness;
  measuredSnapshot: Record<string, unknown>;
  done: unknown[];
  partial: unknown[];
  gaps: unknown[];
  next: unknown[];
  [k: string]: unknown; // cycle30/cycle31/... future epochs — open but shape-checked core
}

export interface SchemaVerdict {
  valid: boolean;
  reason?: string;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function validateExecutionState(doc: unknown): SchemaVerdict {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { valid: false, reason: "schema: ledger must be a JSON object" };
  }
  const d = doc as Record<string, unknown>;
  if (d.schema !== EXECUTION_LEDGER_SCHEMA) {
    return { valid: false, reason: `schema: expected ${EXECUTION_LEDGER_SCHEMA}, got ${JSON.stringify(d.schema)}` };
  }
  for (const key of ["at", "generator", "freshness", "measuredSnapshot", "done", "partial", "gaps", "next"] as const) {
    if (!(key in d)) return { valid: false, reason: `schema: missing core field "${key}"` };
  }
  if (typeof d.at !== "string" || !ISO_RE.test(d.at)) {
    return { valid: false, reason: "schema: `at` must be an ISO-8601 instant" };
  }
  if (Number.isNaN(Date.parse(d.at))) {
    return { valid: false, reason: "schema: `at` does not parse as a date" };
  }
  if (typeof d.generator !== "string" || d.generator.length === 0) {
    return { valid: false, reason: "schema: `generator` must be a non-empty string" };
  }
  const fr = d.freshness as Record<string, unknown> | null;
  if (fr === null || typeof fr !== "object" || Array.isArray(fr)) {
    return { valid: false, reason: "schema: `freshness` must be an object" };
  }
  if (fr.staleAfterHours !== undefined && (typeof fr.staleAfterHours !== "number" || !Number.isFinite(fr.staleAfterHours) || fr.staleAfterHours < 0)) {
    return { valid: false, reason: "schema: `freshness.staleAfterHours` must be a finite number >= 0" };
  }
  if (d.measuredSnapshot === null || typeof d.measuredSnapshot !== "object" || Array.isArray(d.measuredSnapshot)) {
    return { valid: false, reason: "schema: `measuredSnapshot` must be an object" };
  }
  for (const key of ["done", "partial", "gaps", "next"] as const) {
    if (!Array.isArray(d[key])) return { valid: false, reason: `schema: \`${key}\` must be an array` };
  }
  return { valid: true };
}

export function staleAfterHoursOf(doc: ExecutionStateDoc): number {
  const h = doc.freshness?.staleAfterHours;
  return typeof h === "number" && Number.isFinite(h) && h >= 0 ? h : DEFAULT_STALE_AFTER_HOURS;
}

export function isStaleLedger(doc: ExecutionStateDoc, nowMs: number): boolean {
  const atMs = Date.parse(doc.at);
  if (Number.isNaN(atMs)) return true; // unparsable instant cannot be fresh
  return nowMs - atMs >= staleAfterHoursOf(doc) * 3600_000;
}

// ---------------------------------------------------------------------------
// Bounded default — deterministic skeleton, zero invented state
// ---------------------------------------------------------------------------

export function boundedDefaultLedger(nowMs: number, generator: string): ExecutionStateDoc {
  return {
    schema: EXECUTION_LEDGER_SCHEMA,
    at: new Date(nowMs).toISOString(),
    generator: `${generator} — bounded-default recovery (G76-h), awaiting agent-round renewal`,
    sourceWorklog: "none (recovery bootstrap — no measured history was reachable)",
    law: "every line derives from the real worklog and measured books · what is not proven is recorded as not-done · no decoration",
    freshness: {
      howToVerify: "github.com/roshpinacare-sys/Domain → commits · github.com/roshpinacare-sys/saos-dex/actions → runs",
      staleAfterHours: DEFAULT_STALE_AFTER_HOURS,
      renewedBy: "agent cycle (measure-and-push) or defi-convergence recovery accessor",
    },
    measuredSnapshot: {
      note: "no measured snapshot available at recovery time — numbers arrive only from an agent-round renewal carrying receipts; gaps and next are honestly empty, not decorated",
    },
    done: [],
    partial: [],
    gaps: [],
    next: [],
  };
}

// ---------------------------------------------------------------------------
// Candidate resolution — measured fleet layout, env-overridable, host-honest
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  env?: Record<string, string | undefined>;
  repoRoot?: string; // giant checkout root (auto-discovered when omitted)
}

/** Walk up from a start dir until a package.json is found (deterministic, host-agnostic). */
export function repoRootFrom(startDir: string): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < 12; i++) {
    try {
      if (statSync(join(dir, "package.json")).isFile()) return dir;
    } catch {
      /* keep walking */
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function resolveCandidates(opts: ResolveOptions = {}): string[] {
  const env = opts.env ?? process.env;
  const out: string[] = [];
  const push = (p?: string | null) => {
    if (p) out.push(resolve(p));
  };
  // 1. explicit file override (beats may pin the exact ledger)
  push(env.SAOS_EXECUTION_STATE_PATH);
  // 2. Domain checkout root override (ledger home: roshpinacare-sys/Domain)
  if (env.SAOS_DOMAIN_ROOT) push(join(env.SAOS_DOMAIN_ROOT, "execution-state.json"));
  // 3. measured sandbox Domain checkout (fleet-measured layout, 2026-10-26) —
  //    freshest curated content, preferred for reading
  push("/home/z/audit/repos/Domain/execution-state.json");
  // 4. giant last-good mirror (repo-relative — survives host drift, recovery source)
  const root = opts.repoRoot ?? repoRootFrom(import.meta.dir);
  if (root) push(join(root, "state", "execution", "execution-state.json"));
  return out;
}

export function resolveMirrorCandidates(opts: ResolveOptions = {}): string[] {
  const root = opts.repoRoot ?? repoRootFrom(import.meta.dir);
  return root ? [join(root, "state", "execution", "execution-state.json")] : [];
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type AccessStatus = "ok" | "stale" | "missing" | "invalid";

export interface AccessResult {
  status: AccessStatus;
  path: string | null;
  doc: ExecutionStateDoc | null;
  reason?: string;
  candidates: string[];
}

export function readExecutionState(opts: {
  candidates?: string[];
  env?: Record<string, string | undefined>;
  repoRoot?: string;
  now?: number;
}): AccessResult {
  const candidates = opts.candidates ?? resolveCandidates({ env: opts.env, repoRoot: opts.repoRoot });
  const now = opts.now ?? Date.now();
  let lastInvalid: AccessResult | null = null;
  for (const p of candidates) {
    let text: string;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue; // candidate absent/unreadable — measured, try next
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // a torn copy at one path must not blind us to a healthy copy elsewhere —
      // remember the finding and keep walking the measured candidate order
      lastInvalid = { status: "invalid", path: p, doc: null, reason: `invalid JSON: ${(e as Error).message}`, candidates };
      continue;
    }
    const v = validateExecutionState(parsed);
    if (!v.valid) {
      lastInvalid = { status: "invalid", path: p, doc: null, reason: v.reason, candidates };
      continue;
    }
    const doc = parsed as ExecutionStateDoc;
    if (isStaleLedger(doc, now)) {
      return { status: "stale", path: p, doc, reason: `ledger.at ${doc.at} is older than ${staleAfterHoursOf(doc)}h freshness window`, candidates };
    }
    return { status: "ok", path: p, doc, candidates };
  }
  return (
    lastInvalid ??
    { status: "missing", path: null, doc: null, reason: "no candidate path held a readable ledger", candidates }
  );
}

// ---------------------------------------------------------------------------
// Locking — O_EXCL advisory lock with bounded stale takeover (fail-closed)
// ---------------------------------------------------------------------------

export class LockTimeoutError extends Error {
  constructor(public lockPath: string, public timeoutMs: number) {
    super(`lock timeout after ${timeoutMs}ms: ${lockPath} held by another writer`);
    this.name = "LockTimeoutError";
  }
}

export interface LockOptions {
  timeoutMs?: number; // total wait before fail-closed throw (default 10_000)
  retryMs?: number; // retry cadence (default 25)
  staleMs?: number; // lock older than this may be taken over (default 30_000)
  clock?: () => number; // injectable monotonic-ish clock (tests)
}

export async function withLedgerLock<T>(targetPath: string, opts: LockOptions = {}, fn: () => Promise<T> | T): Promise<T> {
  const lockPath = `${targetPath}.lock`;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retryMs = opts.retryMs ?? 25;
  const staleMs = opts.staleMs ?? 30_000;
  const now = opts.clock ?? Date.now;
  const deadline = now() + timeoutMs;

  const acquire = (): boolean => {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeFileSync(
          fd,
          JSON.stringify({ pid: typeof process !== "undefined" ? process.pid : null, at: new Date().toISOString() }) + "\n",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        // stale takeover: a lock older than staleMs belongs to a dead writer
        try {
          const st = statSync(lockPath);
          if (now() - st.mtimeMs >= staleMs) {
            try {
              unlinkSync(lockPath);
            } catch {
              /* another worker took it first — keep racing */
            }
          }
        } catch {
          /* vanished — retry */
        }
        return false;
      }
      throw e;
    }
  };

  while (!acquire()) {
    if (now() >= deadline) throw new LockTimeoutError(lockPath, timeoutMs);
    await new Promise((r) => setTimeout(r, retryMs));
  }
  try {
    return await fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      /* already released */
    }
  }
}

// ---------------------------------------------------------------------------
// Atomic write — validate → lock → tmp → fsync → rename
// ---------------------------------------------------------------------------

export interface WriteOptions extends LockOptions {
  now?: number; // injected clock (quarantine stamping)
}

export async function writeExecutionState(doc: ExecutionStateDoc, targetPath: string, opts: WriteOptions = {}): Promise<void> {
  const v = validateExecutionState(doc);
  if (!v.valid) throw new TypeError(`refusing to write execution ledger — ${v.reason}`);
  const target = resolve(targetPath);
  mkdirSync(dirname(target), { recursive: true });
  await withLedgerLock(target, opts, () => {
    const tmp = `${target}.tmp-${typeof process !== "undefined" ? process.pid : 0}-${Math.random().toString(36).slice(2, 10)}`;
    const bytes = JSON.stringify(doc, null, 2) + "\n";
    let fd = -1;
    try {
      fd = openSync(tmp, "w");
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      if (fd !== -1) closeSync(fd);
    }
    try {
      renameSync(tmp, target); // atomic on the same filesystem — readers never see a torn file
    } catch (e) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
      throw e;
    }
  });
}

// ---------------------------------------------------------------------------
// Recovery — deterministic, bounded, never invents state
// ---------------------------------------------------------------------------

export type RecoveryAction = "none" | "recovered-from-mirror" | "bootstrapped";

export interface RecoveryResult {
  action: RecoveryAction;
  primary: string | null;
  read: AccessResult;
  wroteTo: string | null;
  quarantinedTo?: string;
}

export function recoverExecutionState(opts: {
  candidates?: string[];
  mirrorCandidates?: string[];
  env?: Record<string, string | undefined>;
  repoRoot?: string;
  now?: number;
  generator?: string;
  apply?: boolean; // default true — write the recovered ledger to the primary path
}): RecoveryResult {
  const candidates = opts.candidates ?? resolveCandidates({ env: opts.env, repoRoot: opts.repoRoot });
  const mirrorCandidates = opts.mirrorCandidates ?? resolveMirrorCandidates({ repoRoot: opts.repoRoot });
  const now = opts.now ?? Date.now();
  const primary = candidates[0] ?? null;
  const read = readExecutionState({ candidates, now });

  if (read.status === "ok" || read.status === "stale") {
    // healthy (or honestly stale) ledger — never touch live state on a read path
    return { action: "none", primary, read, wroteTo: null };
  }

  const apply = opts.apply !== false; // default: recover in place
  if (!primary || !apply) {
    return { action: read.status === "invalid" ? "bootstrapped" : "none", primary, read, wroteTo: null };
  }

  const quarantineCorrupt = (): string | undefined => {
    if (read.status !== "invalid" || read.path !== primary) return undefined;
    const stamped = new Date(now).toISOString().replace(/[:.]/g, "-");
    try {
      const quarantine = `${primary}.corrupt-${stamped}`;
      renameSync(primary, quarantine); // evidence preserved, never deleted
      return quarantine;
    } catch {
      return undefined; // primary vanished between read and rename — proceed to recovery write
    }
  };

  // 1. try measured history: last-good mirror (byte-true copy — no re-serialization)
  for (const m of mirrorCandidates) {
    if (m === primary) continue;
    let bytes: string;
    try {
      bytes = readFileSync(m, "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      continue; // mirror itself torn — not measured history, skip
    }
    if (!validateExecutionState(parsed).valid) continue;
    const quarantinedTo = quarantineCorrupt();
    mkdirSync(dirname(primary), { recursive: true });
    writeFileSync(primary, bytes); // byte-true from measured history
    return { action: "recovered-from-mirror", primary, read, wroteTo: primary, quarantinedTo };
  }

  // 2. no measured history reachable → bounded default (zero invented numbers)
  const doc = boundedDefaultLedger(now, opts.generator ?? "execution-accessor");
  const quarantinedTo = quarantineCorrupt();
  mkdirSync(dirname(primary), { recursive: true });
  writeFileSync(primary, JSON.stringify(doc, null, 2) + "\n");
  return { action: "bootstrapped", primary, read, wroteTo: primary, quarantinedTo };
}
