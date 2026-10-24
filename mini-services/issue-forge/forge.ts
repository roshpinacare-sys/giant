/* ═══ issue-forge · forge.ts — config · ledger · lock · issue-schema ══════════════
 * giant §9 PERPETUAL AUTONOMOUS ENGINE BOOTSTRAPPING — the native issue-to-PR
 * developer loop inside giant (port 3046, loopback only).
 *
 * Honesty laws encoded here:
 *  · every state transition appends exactly one JSON line (SAOS-FORGE/1) to
 *    state/forge-ledger.jsonl — the ledger is the loop's memory and its conscience
 *  · the GitHub token is read at RUNTIME from the owner's upload dir — never
 *    embedded, never logged; redact() scrubs it from anything printed/persisted
 *  · single-flight: state/claim.lock (O_EXCL, pid+ts); a stale lock (>30min) is
 *    broken honestly and recorded — never silently
 *  · runtime state lives in state/ and is git-ignored (never enters git history)
 *  · audit findings are debt EVIDENCE: deletion without implementation is forbidden
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/* ── geometry ─────────────────────────────────────────────────────────────── */
export const SERVICE_DIR = import.meta.dir;
export const REPO_ROOT = path.resolve(SERVICE_DIR, "..", "..");
export const STATE_DIR = path.join(SERVICE_DIR, "state");
export const LEDGER_PATH = path.join(STATE_DIR, "forge-ledger.jsonl");
export const CLAIM_LOCK = path.join(STATE_DIR, "claim.lock");
export const PORT = 3046; // hardcoded by directive — never from env

export const GITHUB_REPO = "roshpinacare-sys/giant";
export const TOKEN_FILE = "/home/z/my-project/upload/גיטראש.txt";
export const FORGE_LABEL = "sovereign-forge";
export const CLAIM_MARK = "SAOS-FORGE-CLAIM";
export const LEDGER_SCHEMA = "SAOS-FORGE/1";
export const STALE_LOCK_MS = 30 * 60 * 1000;
export const MAX_ISSUES_PER_CYCLE = 3;
export const FLEET_LEDGER_REL = "mini-services/fleet-economy/state/ledger.jsonl";

/* ── findings (the audit vocabulary) ──────────────────────────────────────── */
export type FindingKind = "todo" | "testgap" | "ledger";

export interface Finding {
  kind: FindingKind;
  subsystem: string;
  /** path relative to repo root (the audited target) */
  target: string;
  count: number;
  detail: string;
  /** content-hash (8 hex) — identity used for issue-title idempotency */
  hash: string;
}

export function sha8(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

export function findingHash(kind: FindingKind, target: string): string {
  return sha8(`${kind}|${target}`);
}

export function slugify(s: string): string {
  const slug = s
    .replace(/\.(ts|tsx)$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return slug || "target";
}

export function subsystemFor(target: string): string {
  if (target.startsWith("src/app/api")) return "api";
  if (target.startsWith("src/lib")) return "lib";
  if (target.startsWith("src/components")) return "ui";
  if (target.startsWith("src/hooks")) return "hooks";
  if (target.startsWith("src/")) return "src";
  if (target.includes("ledger")) return "ledger";
  return "repo";
}

/* ── issue schema (strict TDD acceptance criteria) ────────────────────────── */
export function parseKindFromTitle(title: string): FindingKind | null {
  const m = /forge\((testgap|todo|ledger)\)/.exec(title);
  return m ? (m[1] as FindingKind) : null;
}

/** `[forge:<hash8>]` suffix is the idempotency key — one OPEN issue per hash */
export function hashFromTitle(title: string): string | null {
  const m = /\[forge:([0-9a-f]{8})\]/.exec(title);
  return m ? m[1] : null;
}

export function buildIssueTitle(f: Finding): string {
  return `forge(${f.kind}): ${slugify(f.target)} [forge:${f.hash}]`;
}

export interface IssueCriteria {
  testCommand: string;
  greenDefinition: string;
  scope: string;
}

export function issueCriteriaFor(f: Finding): IssueCriteria {
  if (f.kind === "testgap") {
    const stem = path.basename(f.target).replace(/\.tsx?$/, "");
    return {
      testCommand: `bun test tests/${stem}.forge.test.ts`,
      greenDefinition:
        "exit code 0, every captured characterization case green, AND `bun run lint` exits 0. RED is never shipped.",
      scope: `ONLY \`${f.target}\` and its generated characterization test \`tests/${stem}.forge.test.ts\`. No other file may change.`,
    };
  }
  if (f.kind === "todo") {
    return {
      testCommand: "bun test tests/ ; bun run lint",
      greenDefinition:
        "the gate is green: tests exit 0 (or vacuously absent — recorded honestly) AND `bun run lint` exits 0. RED is never shipped.",
      scope: `ONLY \`${f.target}\`. No other file may change.`,
    };
  }
  return {
    testCommand: "n/a — observation-only issue",
    greenDefinition: "n/a — this issue carries anomaly evidence; it is triaged, never auto-merged.",
    scope: "NO code change authorized — evidence issue for the fleet-economy ledger (READ-ONLY for this loop).",
  };
}

export function buildIssueBody(f: Finding, c: IssueCriteria): string {
  return [
    "## SAOS-FORGE — autonomous issue (§9)",
    "",
    `- auditor: \`${f.kind}\``,
    `- target: \`${f.target}\``,
    `- evidence: ${f.detail}`,
    `- content-hash: \`${f.hash}\` (idempotency — one open issue per hash)`,
    "",
    "### Scope declaration",
    c.scope,
    "",
    "### TDD acceptance criteria (strict)",
    `1. Test command (exact): \`${c.testCommand}\``,
    `2. Definition of green: ${c.greenDefinition}`,
    "3. Repo rules: no new TODO/FIXME/XXX/STUB markers; never delete a marker without a real implementation behind it; no mocks/stubs in production code; TypeScript must keep compiling.",
    "",
    "### Honesty law",
    "Opened by the sovereign-forge loop from deterministic audit evidence. Findings are debt evidence — deletion without implementation is forbidden. A claim is announced with a `SAOS-FORGE-CLAIM/<cycle>/<iso>` comment; a PR is merged ONLY after a fresh green gate re-run.",
  ].join("\n");
}

/* ── GitHub token (runtime read — never embedded, never logged) ───────────── */
let cachedToken: string | null | undefined;

export function readGithubToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf8").replace(/\s+/g, "");
    cachedToken = raw.length >= 20 ? raw : null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

/** scrubs the token out of anything about to be printed or persisted */
export function redact(s: string): string {
  const t = readGithubToken();
  if (!t || !s) return s;
  return s.split(t).join("***");
}

/* ── forge ledger (append-only, one line per state transition) ────────────── */
export interface LedgerEntry {
  schema: string;
  at: string;
  cycle: number;
  phase: string;
  issue: number | null;
  verdict: string;
  detail: string;
}

export function appendLedger(
  entry: Omit<LedgerEntry, "schema" | "at">,
  ledgerPath: string = LEDGER_PATH,
): LedgerEntry {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const full: LedgerEntry = { schema: LEDGER_SCHEMA, at: new Date().toISOString(), ...entry };
  fs.appendFileSync(ledgerPath, JSON.stringify(full) + "\n");
  return full;
}

export function readLedgerTail(n: number, ledgerPath: string = LEDGER_PATH): LedgerEntry[] {
  try {
    return fs
      .readFileSync(ledgerPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(-n)
      .map((l) => {
        try {
          return JSON.parse(l) as LedgerEntry;
        } catch {
          return null;
        }
      })
      .filter((x): x is LedgerEntry => x !== null);
  } catch {
    return [];
  }
}

/* ── single-flight lock (O_EXCL, pid+ts, honest stale-break) ──────────────── */
export interface LockInfo {
  pid: number;
  ts: number;
}

export interface LockResult {
  ok: boolean;
  staleBroken: boolean;
  holder?: LockInfo;
}

export function readLock(lockPath: string = CLAIM_LOCK): LockInfo | null {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8")) as LockInfo;
  } catch {
    return null;
  }
}

export function acquireLock(lockPath: string = CLAIM_LOCK, staleMs: number = STALE_LOCK_MS): LockResult {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let existing = readLock(lockPath);
  let staleBroken = false;
  if (existing && Date.now() - existing.ts > staleMs) {
    /* stale lock: the holder is presumed dead — break it, but only honestly */
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* a racing writer got there first — fall through to the busy path */
    }
    staleBroken = true;
    existing = null;
  }
  if (existing) return { ok: false, staleBroken, holder: existing };
  try {
    const fd = fs.openSync(lockPath, "wx");
    const info: LockInfo = { pid: process.pid, ts: Date.now() };
    fs.writeSync(fd, JSON.stringify(info));
    fs.closeSync(fd);
    return { ok: true, staleBroken };
  } catch {
    return { ok: false, staleBroken, holder: readLock(lockPath) ?? undefined };
  }
}

export function releaseLock(lockPath: string = CLAIM_LOCK): boolean {
  const me = readLock(lockPath);
  if (!me) return true;
  if (me.pid !== process.pid) return false; // never remove someone else's lock
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return true;
  }
}

/* ── cycle counter (persisted) ────────────────────────────────────────────── */
export function nextCycle(stateDir: string = STATE_DIR): number {
  const file = path.join(stateDir, "cycle.json");
  let last = 0;
  try {
    last = (JSON.parse(fs.readFileSync(file, "utf8")) as { last?: number }).last ?? 0;
  } catch {
    /* first cycle */
  }
  const n = last + 1;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ last: n }));
  return n;
}

/* ── process plumbing ─────────────────────────────────────────────────────── */
export interface ShResult {
  code: number;
  out: string;
}

export async function sh(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 120_000,
): Promise<ShResult> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      timeout: timeoutMs,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return { code, out: `${stdout || ""}\n${stderr || ""}`.trim() };
  } catch (e) {
    return { code: -1, out: e instanceof Error ? e.message : String(e) };
  }
}
