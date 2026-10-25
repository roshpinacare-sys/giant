/**
 * index.ts — saos-organ-commander · :3047 (loopback only)
 * ═══════════════════════════════════════════════════════════════════════
 * The Chief Sovereign Architect's keep-alive command plane (§1+§2+§4 of the
 * 19:39 MASTER DIRECTIVE, wave 19.85, trace 1a16ecaa3ddddba9).
 *
 * The perpetual loop: probe every organ → rank commands → execute fail-closed
 * → hash-chained receipts. Never imports organ code (HTTP + subprocess only).
 *
 * CLI:
 *   bun mini-services/organ-commander/index.ts once
 *   bun mini-services/organ-commander/index.ts beat [s=60000]
 *
 * Terminals (fail-honest, never throws): ok | probe-error
 */
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { ORGANS, probeTruth, type OrganSpec, type Truth } from "./truth";
import { planNext, type Command } from "./command";
import { ReceiptChain, verifyChain, type Receipt } from "./receipts";
import { executeRevive, revivePlan, GIANT_ROOT, type SpawnPlan } from "./revive";
import { liveSiblings } from "./singleflight";

export const PORT = 3047;
export const STATE_DIR = join(import.meta.dir, "state");
export const RECEIPTS_FILE = join(STATE_DIR, "receipts.jsonl");
const FEED_FILE = join(GIANT_ROOT, "mini-services", "meta-planner", "state", "issues.json");

/** default cooldowns per organ (ms) — no spawn spray, measured boot windows */
const COOLDOWN_MS: Record<string, number> = {
  "dex-node": 120_000,
  "soldier-army": 30_000,
  "dex-economy-bridge": 60_000,
  "issue-forge": 120_000,
};

export interface CycleIo {
  probe: (spec: OrganSpec) => Promise<{ alive: boolean; detail: string; body?: unknown }>;
  readFeed: () => number;
  gitBehind: () => number;
  aliveCheck: (port: number) => Promise<boolean>;
  spawn: (plan: SpawnPlan) => number;
  receipts: ReceiptChain;
  now: () => number;
  postCycle: () => Promise<{ ok: boolean; verdict: string }>;
  runnerOnce: () => Promise<{ ok: boolean; status: string }>;
  cooldowns?: Record<string, number>;
  maxCommands?: number;
  /** injectable /proc scan (tests inject [] — the real one scans /proc) */
  procSiblings?: (tag: string) => number[];
}

export interface CycleResult {
  ok: boolean;
  verdict: "noop" | "probe-error" | "acted";
  commands: Command[];
  receipts: Receipt[];
  truth?: Truth;
  detail?: string;
}

/* ── runtime io (real world) ──────────────────────────────────────────── */
async function realProbe(spec: OrganSpec): Promise<{ alive: boolean; detail: string; body?: unknown }> {
  const r = await fetch(`http://127.0.0.1:${spec.port}${spec.path}`, { signal: AbortSignal.timeout(2000) });
  let body: unknown = undefined;
  try { body = await r.json(); } catch { /* non-JSON alive organ — honest */ }
  return { alive: true, detail: `HTTP ${r.status}`, body };
}
function readFeed(): number {
  try {
    const j = JSON.parse(readFileSync(FEED_FILE, "utf8")) as { contracts?: Array<{ status?: string; claimedBy?: string }> };
    return (j.contracts ?? []).filter((c) => (c.status ?? "open") !== "done" && !c.claimedBy).length;
  } catch { return 0; }
}
function gitBehind(): number {
  try {
    const out = execFileSync("git", ["-C", GIANT_ROOT, "rev-list", "--count", "HEAD..origin/main"], { encoding: "utf8" });
    return parseInt(out.trim(), 10) || 0;
  } catch { return 0; }
}
async function aliveCheck(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return true; // any HTTP response = port alive
  } catch { return false; }
}
function procSiblingsFor(tag: string): number[] {
  const out: number[] = [];
  try {
    for (const d of readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const cmd = readFileSync(`/proc/${d}/cmdline`, "utf8").replace(/\0/g, " ");
        if (cmd.includes(tag)) out.push(Number(d));
      } catch { /* vanished */ }
    }
  } catch { /* no proc */ }
  return out.filter((p) => p !== process.pid);
}
function realSpawn(plan: SpawnPlan): number {
  // child output goes to the plan's OWN log (measured cure: "ignore" made the
  // bridge crash invisible — an organ that dies silently cannot be commanded)
  let out: number;
  try { out = openSync(plan.log, "a"); } catch { out = "ignore" as unknown as number; }
  const p = Bun.spawn(plan.cmd, {
    cwd: plan.cwd,
    env: { ...process.env, ...plan.env },
    stdout: out, stderr: out,
  });
  p.unref();
  return p.pid;
}
async function postCycle(): Promise<{ ok: boolean; verdict: string }> {
  try {
    const r = await fetch("http://127.0.0.1:3046/cycle", { method: "POST", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json" }, body: "{}" });
    const j = (await r.json()) as { ok?: boolean; verdict?: string };
    return { ok: Boolean(j.ok), verdict: j.verdict ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, verdict: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120) };
  }
}
async function runnerOnce(): Promise<{ ok: boolean; status: string }> {
  try {
    const p = Bun.spawn(["/usr/local/bin/bun", "mini-services/issue-to-pr/index.ts", "once"], { cwd: GIANT_ROOT, stdout: "ignore", stderr: "ignore" });
    p.unref();
    return { ok: true, status: `spawned(${p.pid})` };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120) };
  }
}

/* ── the cycle ────────────────────────────────────────────────────────── */
export async function runCycle(io: CycleIo): Promise<CycleResult> {
  const now = io.now();
  let truth: Truth;
  try {
    truth = await probeTruth({ probe: io.probe, readFeed: io.readFeed, gitBehind: io.gitBehind });
    if (truth.organs.length > 0 && truth.probeErrors.length === truth.organs.length) {
      // probe layer itself is broken (bug-class) — honest terminal, no fake actions
      const detail = `probe layer failure on all organs: ${truth.probeErrors[0]}`;
      io.receipts.append({ kind: "cycle", organ: "commander", verdict: "probe-error", detail });
      return { ok: false, verdict: "probe-error", commands: [], receipts: io.receipts.all(), detail };
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    io.receipts.append({ kind: "cycle", organ: "commander", verdict: "probe-error", detail: detail.slice(0, 160) });
    return { ok: false, verdict: "probe-error", commands: [], receipts: io.receipts.all(), detail };
  }

  const cooldowns = io.cooldowns ?? {};
  const cmds = planNext(truth, cooldowns, now).slice(0, io.maxCommands ?? 6);
  const executed: string[] = [];

  for (const c of cmds) {
    if (c.kind === "noop") break;
    if (c.kind === "revive") {
      // dependency gate: `after` organ must be alive at execute time
      if (c.after) {
        const dep = truth.organs.find((o) => o.organ === c.after);
        if (!dep?.alive) {
          io.receipts.append({ kind: "revive", organ: c.organ, verdict: "deferred", detail: `dependency ${c.after} not alive yet` });
          continue;
        }
      }
      const plan = revivePlan(c.organ);
      const r = await executeRevive(plan, { aliveCheck: io.aliveCheck, spawn: io.spawn, procSiblings: io.procSiblings ?? procSiblingsFor });
      io.receipts.append({ kind: "revive", organ: c.organ, verdict: r.spawned ? "spawned" : "skipped", detail: r.reason });
      if (r.spawned) executed.push(`revive:${c.organ}`);
    } else if (c.kind === "port-conflict") {
      io.receipts.append({ kind: "port-conflict", organ: c.organ, verdict: "diagnosed", detail: c.reason });
      executed.push("port-conflict:issue-forge");
    } else if (c.kind === "forge-cycle") {
      const r = await io.postCycle();
      io.receipts.append({ kind: "forge-cycle", organ: c.organ, verdict: r.ok ? r.verdict : "failed", detail: r.verdict.slice(0, 160) });
      executed.push("forge-cycle");
    } else if (c.kind === "runner-once") {
      const r = await io.runnerOnce();
      io.receipts.append({ kind: "runner-once", organ: c.organ, verdict: r.ok ? r.status : "failed", detail: r.status.slice(0, 160) });
      executed.push("runner-once");
    }
  }

  const verdict: CycleResult["verdict"] = cmds[0]?.kind === "noop" ? "noop" : "acted";
  io.receipts.append({ kind: "cycle", organ: "commander", verdict, detail: `commands=${cmds.map((c) => c.kind).join("+") || "none"} executed=${executed.join(",") || "none"}` });
  return { ok: true, verdict, commands: cmds, receipts: io.receipts.all(), truth };
}

/* ── persistence ──────────────────────────────────────────────────────── */
function loadChain(): ReceiptChain {
  const c = new ReceiptChain();
  try {
    if (existsSync(RECEIPTS_FILE)) {
      const rows = readFileSync(RECEIPTS_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Receipt);
      if (!c.adopt(rows)) console.error("[commander] persisted receipt chain TAMPERED — starting fresh (honest)");
    }
  } catch { /* unreadable history — fresh chain, honest */ }
  return c;
}
function persist(receipts: Receipt[]): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    // FULL atomic rewrite (measured cure): partial appends broke the disk chain
    // (seq N persisted with prevHash of unpersisted N-1 → adopt refused on boot).
    // The chain is small (bytes per cycle) — writeFileSync keeps it consistent.
    writeFileSync(RECEIPTS_FILE, receipts.map((r) => JSON.stringify(r)).join("\n") + "\n");
  } catch { /* receipt write never kills the loop */ }
}

/* ── entry ────────────────────────────────────────────────────────────── */
const state = {
  startedAt: new Date().toISOString(),
  cycles: 0, lastVerdict: null as string | null, lastAt: null as string | null,
  lastTruth: null as Truth | null, running: false,
};

async function cycle(): Promise<CycleResult> {
  const receipts = loadChain();
  const r = await runCycle({
    probe: realProbe, readFeed, gitBehind, aliveCheck, spawn: realSpawn,
    receipts, now: () => Date.now(), postCycle, runnerOnce,
    cooldowns: readCooldowns(),
  });
  persist(receipts.all()); // FULL chain — a truncated write breaks prevHash continuity on next load (measured)
  state.cycles++;
  state.lastVerdict = r.verdict;
  state.lastAt = new Date().toISOString();
  state.lastTruth = r.truth ?? null;
  return r;
}

const CD_FILE = join(STATE_DIR, "cooldowns.json");
function readCooldowns(): Record<string, number> {
  try { return JSON.parse(readFileSync(CD_FILE, "utf8")); } catch { return {}; }
}
function writeCooldowns(spawnedOrgans: string[]): void {
  try {
    const cds = readCooldowns();
    const now = Date.now();
    for (const o of spawnedOrgans) cds[o] = now + (COOLDOWN_MS[o] ?? 60_000);
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(CD_FILE, ""); // ensure dir exists (touch)
    writeFileSync(CD_FILE, JSON.stringify(cds));
  } catch { /* cooldown persistence best-effort */ }
}

/* single-flight: /proc authority (G62 law) */
function assertSingleFlight(): void {
  const sibs = liveSiblings(process.pid);
  if (sibs.length > 0) {
    console.error(`[commander] live sibling(s) ${sibs.join(",")} — exit honestly (single-flight authority)`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "once";
  if (mode === "beat") {
    assertSingleFlight();
    const ms = Math.max(15_000, parseInt(process.argv[3]?.replace(/^s=/, "") ?? "60000", 10) || 60_000);
    let flight = false;
    const tick = async () => {
      if (flight) return;
      flight = true;
      try {
        const r = await cycle();
        const spawned = r.commands.filter((c) => c.kind === "revive").map((c) => c.organ);
        if (spawned.length > 0) writeCooldowns(spawned);
        console.info(`[commander] cycle ${state.cycles} verdict=${r.verdict}`);
      } catch (e) {
        console.error(`[commander] cycle crash (honest): ${e instanceof Error ? e.message : String(e)}`);
      } finally { flight = false; }
    };
    void tick();
    setInterval(() => void tick(), ms);
    // loopback status plane :3047
    Bun.serve({
      port: PORT, hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/health") {
          return Response.json({ ok: true, host: "saos-organ-commander", startedAt: state.startedAt, cycles: state.cycles, lastVerdict: state.lastVerdict, lastAt: state.lastAt, at: new Date().toISOString() });
        }
        if (url.pathname === "/state") {
          return Response.json({ ok: true, lastTruth: state.lastTruth, receiptsTail: loadChain().tail(10) });
        }
        if (url.pathname === "/cycle" && req.method === "POST") {
          const r = await cycle(); // measured cure: the void-then cast returned undefined → Bun's default "Welcome to Bun!" body
          return Response.json({ ok: r.ok, verdict: r.verdict, commands: r.commands.map((c) => `${c.kind}:${c.organ}`) });
        }
        return new Response("not found", { status: 404 });
      },
    });
    console.info(`[commander] beat every ${ms}ms · status :${PORT} (loopback)`);
    return;
  }
  // once
  const r = await cycle();
  console.info(JSON.stringify({ ok: r.ok, verdict: r.verdict, commands: r.commands.map((c) => `${c.kind}:${c.organ}`) }));
  if (!r.ok) process.exitCode = 1;
}

void main();
