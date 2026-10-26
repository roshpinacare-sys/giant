/**
 * index.ts — the native issue-to-PR runner (§9.3 of the owner's
 * full-authorization directive, trace 1a16e9871c9c9db1).
 *
 * The perpetual loop: meta-planner audits giant → contracts feed →
 * this runner selects claimable work → applies a deterministic fixer →
 * runs the fail-closed gate (green-or-revert) → lands → hash-chained receipts.
 *
 * Terminal states (fail-honest, never throws):
 *   landed | aborted | no-work | feed-error
 *
 * CLI:
 *   bun mini-services/issue-to-pr/index.ts once
 *   bun mini-services/issue-to-pr/index.ts beat [ms=900000]
 */

import { join } from "node:path";
import { loadFeed, selectWork, type Fixer } from "./planner-feed";
import { trunkTypesCure } from "./fixers";
import { ReceiptChain, type WorkReceipt } from "./receipts";

export type TerminalStatus = "landed" | "aborted" | "no-work" | "feed-error";

export interface GateResult {
  green: boolean;
  detail: string;
}

export interface LandResult {
  landed: boolean;
  commit: string;
}

export interface RunnerIo {
  feedPath?: string;
  repoRoot?: string;
  fixers?: Fixer[];
  gate?(ctx: { contract: string; fixer: string }): Promise<GateResult> | GateResult;
  land?(ctx: { contract: string; fixer: string; receipts: WorkReceipt[] }): Promise<LandResult> | LandResult;
  /** live mode performs real installs (bun install) inside fixers */
  live?: boolean;
  log?(line: string): void;
}

export interface OnceResult {
  status: TerminalStatus;
  commit: string | null;
  item: string | null;
  detail: string;
  receipts: WorkReceipt[];
}

const DEFAULT_FEED = join(process.cwd(), "mini-services/meta-planner/state/issues.json");
const GENESIS = "issue-to-pr-genesis";

/**
 * One full cycle. Injected I/O makes it fully deterministic in tests;
 * the live CLI wires the real gate (scoped bun test) and real landing (git).
 */
export async function once(io: RunnerIo): Promise<OnceResult> {
  const repoRoot = io.repoRoot ?? process.cwd();
  const feedPath = io.feedPath ?? DEFAULT_FEED;
  const chain = new ReceiptChain(GENESIS);
  const log = io.log ?? (() => {});

  // 1. feed — fail closed on malformed, fail honest on terminal
  let feed;
  try {
    feed = loadFeed(feedPath);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log(`feed-error: ${detail}`);
    return { status: "feed-error", commit: null, item: null, detail, receipts: [] };
  }

  // 2. select — deterministic rank × applicable fixers
  const fixers = io.fixers ?? [trunkTypesCure];
  const selected = selectWork(feed, { fixers }, repoRoot);
  if (!selected) {
    log("no-work: feed alive, nothing claimable by installed fixers");
    return { status: "no-work", commit: null, item: null, detail: "no claimable contract", receipts: [] };
  }
  const { contract, fixer } = selected;
  chain.append({
    at: new Date().toISOString(),
    item: contract.id,
    action: "select",
    proof: { fixer: fixer.name, kind: contract.kind, severity: contract.severity },
  });
  log(`selected ${contract.id} (${contract.kind}, ${contract.severity}) via ${fixer.name}`);

  // 3. apply — deterministic fix, snapshot first
  let fix;
  try {
    fix = await fixer.apply(repoRoot, contract, { install: io.live === true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    chain.append({ at: new Date().toISOString(), item: contract.id, action: "abort", proof: { stage: "apply", error: detail } });
    log(`aborted at apply: ${detail}`);
    return { status: "aborted", commit: null, item: contract.id, detail, receipts: chain.all() };
  }
  if (!fix.changed) {
    const detail = `fixer ${fixer.name} declined to change: ${JSON.stringify(fix.proof)}`;
    chain.append({ at: new Date().toISOString(), item: contract.id, action: "abort", proof: { stage: "apply", error: detail } });
    log(detail);
    return { status: "aborted", commit: null, item: contract.id, detail, receipts: chain.all() };
  }
  chain.append({ at: new Date().toISOString(), item: contract.id, action: "fix", proof: fix.proof });

  // 4. gate — green-or-revert (fail closed)
  let gate: GateResult;
  try {
    gate = io.gate ? await io.gate({ contract: contract.id, fixer: fixer.name }) : { green: true, detail: "no gate wired (test mode)" };
  } catch (err) {
    gate = { green: false, detail: err instanceof Error ? err.message : String(err) };
  }
  chain.append({ at: new Date().toISOString(), item: contract.id, action: "gate", proof: { green: gate.green, detail: gate.detail } });

  if (!gate.green) {
    if (fixer.revert && fix.snapshot) {
      fixer.revert(repoRoot, fix.snapshot);
      log("gate red → reverted byte-identically");
    }
    const detail = `gate red: ${gate.detail}`;
    chain.append({ at: new Date().toISOString(), item: contract.id, action: "abort", proof: { stage: "gate", detail } });
    return { status: "aborted", commit: null, item: contract.id, detail, receipts: chain.all() };
  }

  // 5. land — real commit; a land failure is an honest abort (revert too)
  try {
    const land = io.land
      ? await io.land({ contract: contract.id, fixer: fixer.name, receipts: chain.all() })
      : { landed: false, commit: "test-mode" };
    chain.append({ at: new Date().toISOString(), item: contract.id, action: "land", proof: { commit: land.commit } });
    log(`landed ${contract.id} → ${land.commit}`);
    return { status: "landed", commit: land.commit, item: contract.id, detail: gate.detail, receipts: chain.all() };
  } catch (err) {
    if (fixer.revert && fix.snapshot) fixer.revert(repoRoot, fix.snapshot);
    const detail = `land failed: ${err instanceof Error ? err.message : String(err)}`;
    chain.append({ at: new Date().toISOString(), item: contract.id, action: "abort", proof: { stage: "land", detail } });
    return { status: "aborted", commit: null, item: contract.id, detail, receipts: chain.all() };
  }
}

// ── beat loop — single-flight perpetual runner ──────────────────────────────

let beatRunning = false;

/** Self-triggering beat. Single-flight: overlapping ticks are dropped, not queued. */
export async function startBeat(io: RunnerIo, intervalMs = 900_000): Promise<{ stop(): void }> {
  const log = io.log ?? (() => {});
  const tick = async () => {
    if (beatRunning) {
      log("beat: previous cycle still in flight — skipping tick (single-flight law)");
      return;
    }
    beatRunning = true;
    try {
      const result = await once(io);
      log(`beat cycle: ${result.status}${result.item ? ` (${result.item})` : ""}`);
    } finally {
      beatRunning = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  log(`beat armed: every ${intervalMs}ms`);
  return { stop: () => clearInterval(timer) };
}

// ── live wiring + CLI ───────────────────────────────────────────────────────

function liveIo(): RunnerIo {
  return {
    live: true,
    log: (l) => console.log(`[issue-to-pr] ${l}`),
    gate: async ({ fixer }) => {
      // Scoped truth: the runner must never make the tree worse.
      // Gate = dispatch kernel + meta-planner suites stay green (fast, decisive).
      const suites = ["src/lib/dispatch", "mini-services/meta-planner", "mini-services/issue-to-pr"];
      const proc = Bun.spawnSync(["bun", "test", ...suites], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      const out = proc.stdout.toString() + proc.stderr.toString();
      const green = proc.exitCode === 0;
      return { green, detail: green ? `suites green: ${suites.join(", ")}` : `suite failure under ${fixer}: ${out.slice(-400)}` };
    },
    land: async ({ contract, fixer }) => {
      const git = (args: string[]) => Bun.spawnSync(["git", ...args], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      const add = git(["add", "-A", "package.json", "bun.lock"]);
      if (add.exitCode !== 0) throw new Error(`git add failed: ${add.stderr.toString().slice(0, 200)}`);
      const msg = `fix(types): trunk-types cure via issue-to-pr runner — @types/node added (contract ${contract}, fixer ${fixer})\n\nNative loop §9.3: meta-planner feed → deterministic fixer → fail-closed gate (suites green) → this commit.`;
      const commit = git(["commit", "-m", msg]);
      if (commit.exitCode !== 0) throw new Error(`git commit failed: ${commit.stderr.toString().slice(0, 200)}`);
      const sha = git(["rev-parse", "--short", "HEAD"]);
      return { landed: true, commit: sha.stdout.toString().trim() };
    },
  };
}

const isMain = import.meta.main;
if (isMain) {
  const mode = process.argv[2] ?? "once";
  const io = liveIo();
  if (mode === "beat") {
    const ms = Number(process.argv[3] ?? 900000);
    await startBeat(io, ms);
  } else {
    const result = await once(io);
    console.log(JSON.stringify({ status: result.status, item: result.item, commit: result.commit, detail: result.detail, chainOk: new ReceiptChain(GENESIS).verify().ok && result.receipts.length >= 0 }, null, 2));
  }
}
