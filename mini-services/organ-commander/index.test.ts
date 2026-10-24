/**
 * index.test.ts — TDD suite BEFORE logic (owner MASTER DIRECTIVE 19:39, §5 zero-slop).
 * Deterministic · offline · zero deps. Every organ probe / spawn / clock is injected.
 * The commander never imports organ code — tests prove the boundary.
 */
import { describe, test, expect } from "bun:test";
import { probeTruth, type ProbeFn, type OrganSpec, ORGANS } from "./truth";
import { planNext, type Command } from "./command";
import { ReceiptChain, verifyChain } from "./receipts";
import { revivePlan, executeRevive, type SpawnPlan } from "./revive";
import { runCycle } from "./index";
import { detectSiblings } from "./singleflight";

const now = 1_700_000_000_000;

/* ── truth.ts ─────────────────────────────────────────────────────────── */
describe("probeTruth", () => {
  const spec = (organ: string, port: number): OrganSpec => ({ organ, port, path: "/health" });

  test("classifies alive organ with latency", async () => {
    const probe: ProbeFn = async () => ({ alive: true, detail: "ok", body: { ok: true } });
    const t = await probeTruth({ probe, readFeed: () => 0, gitBehind: () => 0, organs: [spec("forge", 3046)] });
    expect(t.organs[0].alive).toBe(true);
    expect(t.organs[0].wrongOwner).toBe(false);
    expect(t.organs[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("classifies dead organ honestly (fail-honest, never throws)", async () => {
    const probe: ProbeFn = async () => { throw new Error("ECONNREFUSED"); };
    const t = await probeTruth({ probe, readFeed: () => 0, gitBehind: () => 0, organs: [spec("dex-node", 3010)] });
    expect(t.organs[0].alive).toBe(false);
    expect(t.organs[0].detail).toContain("ECONNREFUSED");
  });

  test("flags wrong-owner occupation (forge held by gates-host)", async () => {
    const probe: ProbeFn = async () => ({ alive: true, detail: "ok", body: { ok: true, host: "local-gates-host" } });
    const t = await probeTruth({ probe, readFeed: () => 0, gitBehind: () => 0, organs: [spec("issue-forge", 3046)] });
    expect(t.organs[0].alive).toBe(true);
    expect(t.organs[0].wrongOwner).toBe(true);
  });

  test("carries feed claimable count and git behind", async () => {
    const t = await probeTruth({ probe: async () => ({ alive: true, detail: "ok" }), readFeed: () => 3, gitBehind: () => 7, organs: [] });
    expect(t.feedClaimable).toBe(3);
    expect(t.giantBehind).toBe(7);
  });

  test("default organ census covers the liquidity chain + dev loop", () => {
    const names = ORGANS.map((o) => o.organ);
    for (const n of ["dex-node", "soldier-army", "dex-economy-bridge", "issue-forge", "sovereign-audit", "economy-engine"]) {
      expect(names).toContain(n);
    }
  });
});

/* ── command.ts ───────────────────────────────────────────────────────── */
describe("planNext", () => {
  const aliveAll = (names: string[]) => names.map((organ) => ({ organ, alive: true, wrongOwner: false, detail: "ok", latencyMs: 1 }));

  test("P0: dead liquidity organs revive in dependency order", () => {
    const truth = {
      organs: [
        { organ: "dex-node", alive: false, wrongOwner: false, detail: "down", latencyMs: 0 },
        { organ: "soldier-army", alive: false, wrongOwner: false, detail: "down", latencyMs: 0 },
        { organ: "dex-economy-bridge", alive: false, wrongOwner: false, detail: "down", latencyMs: 0 },
      ] as any,
      feedClaimable: 0, giantBehind: 0, at: new Date(now).toISOString(),
    };
    const cmds = planNext(truth, {}, now);
    const revives = cmds.filter((c) => c.kind === "revive");
    expect(revives[0].organ).toBe("dex-node");
    expect(revives.map((c) => c.organ)).toEqual(["dex-node", "soldier-army", "dex-economy-bridge"]);
  });

  test("cooldown law: organ inside cooldown is excluded, after expiry returns", () => {
    const mk = (organ: string): any => ({ organs: [{ organ, alive: false, wrongOwner: false, detail: "down", latencyMs: 0 }], feedClaimable: 0, giantBehind: 0, at: new Date(now).toISOString() });
    const cooldowns = { "dex-node": now + 60_000 };
    expect(planNext(mk("dex-node"), cooldowns, now).filter((c) => c.kind === "revive")).toEqual([]);
    const cmds = planNext(mk("dex-node"), cooldowns, now + 61_000);
    expect(cmds.some((c) => c.kind === "revive" && c.organ === "dex-node")).toBe(true);
  });

  test("honest no-op when everything is healthy and feed is empty", () => {
    const truth = { organs: aliveAll(ORGANS.map((o) => o.organ)) as any, feedClaimable: 0, giantBehind: 0, at: new Date(now).toISOString() };
    const cmds = planNext(truth, {}, now);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind).toBe("noop");
    expect(cmds[0].reason.length).toBeGreaterThan(3);
  });

  test("forge occupied by wrong owner → port-conflict diagnosis, never spawn spam", () => {
    const truth = { organs: aliveAll(ORGANS.map((o) => o.organ)).map((o) => o.organ === "issue-forge" ? { ...o, wrongOwner: true } : o) as any, feedClaimable: 0, giantBehind: 0, at: new Date(now).toISOString() };
    const cmds = planNext(truth, {}, now);
    const fc = cmds.find((c) => c.organ === "issue-forge");
    expect(fc?.kind).toBe("port-conflict");
  });

  test("claimable feed → runner-once; alive forge → forge-cycle", () => {
    const truth = { organs: aliveAll(ORGANS.map((o) => o.organ)) as any, feedClaimable: 2, giantBehind: 0, at: new Date(now).toISOString() };
    const cmds = planNext(truth, {}, now);
    expect(cmds.some((c) => c.kind === "forge-cycle" && c.organ === "issue-forge")).toBe(true);
    expect(cmds.some((c) => c.kind === "runner-once")).toBe(true);
  });

  test("commands are ranked (ascending priority) and carry reasons", () => {
    const truth = {
      organs: [
        { organ: "dex-node", alive: false, wrongOwner: false, detail: "down", latencyMs: 0 },
        { organ: "issue-forge", alive: true, wrongOwner: false, detail: "ok", latencyMs: 1 },
      ] as any,
      feedClaimable: 1, giantBehind: 0, at: new Date(now).toISOString(),
    };
    const cmds = planNext(truth, {}, now) as Command[];
    const prios = cmds.map((c) => c.priority);
    expect([...prios].sort((a, b) => a - b)).toEqual(prios);
    for (const c of cmds) expect(c.reason.length).toBeGreaterThan(3);
  });
});

/* ── receipts.ts ──────────────────────────────────────────────────────── */
describe("ReceiptChain", () => {
  test("hash-links every receipt (prevHash chaining)", () => {
    const c = new ReceiptChain();
    const r1 = c.append({ kind: "revive", organ: "dex-node", verdict: "spawned" });
    const r2 = c.append({ kind: "forge-cycle", organ: "issue-forge", verdict: "ok" });
    expect(r1.prevHash).toBe("genesis");
    expect(r2.prevHash).toBe(r1.hash);
    expect(r2.hash).not.toBe(r1.hash);
  });

  test("verifyChain passes on intact chain", () => {
    const c = new ReceiptChain();
    c.append({ kind: "a", organ: "x", verdict: "ok" });
    c.append({ kind: "b", organ: "y", verdict: "ok" });
    expect(verifyChain(c.all())).toBe(true);
  });

  test("tamper detection: one flipped byte breaks the chain", () => {
    const c = new ReceiptChain();
    c.append({ kind: "a", organ: "x", verdict: "ok" });
    c.append({ kind: "b", organ: "y", verdict: "ok" });
    const all = c.all();
    all[1].organ = "TAMPERED";
    expect(verifyChain(all)).toBe(false);
  });
});

/* ── revive.ts ────────────────────────────────────────────────────────── */
describe("revive", () => {
  test("port-first authority: live port is never spawned twice", async () => {
    let spawns = 0;
    const plan = revivePlan("dex-node");
    expect(plan.port).toBe(3010);
    expect(plan.cwd).toContain("giant");
    const r = await executeRevive(plan, { aliveCheck: async () => true, spawn: () => { spawns++; return 123; } });
    expect(r.spawned).toBe(false);
    expect(r.reason).toContain("alive");
    expect(spawns).toBe(0);
  });

  test("dead port → exactly one detached spawn with absolute bun", async () => {
    let spawnedPlan: SpawnPlan | null = null;
    const plan = revivePlan("soldier-army");
    const r = await executeRevive(plan, {
      aliveCheck: async () => false,
      spawn: (p) => { spawnedPlan = p; return 456; },
    });
    expect(r.spawned).toBe(true);
    expect(spawnedPlan!.cmd[0]).toBe("/usr/local/bin/bun");
    expect(spawnedPlan!.cmd).toContain("mini-services/soldier-army/index.ts");
  });

  test("every organ has a plan and every plan is loopback-registered", () => {
    for (const organ of ["dex-node", "soldier-army", "dex-economy-bridge", "issue-forge"]) {
      const p = revivePlan(organ);
      expect(p.port).toBeGreaterThan(3000);
      expect(p.log).toContain("/home/z/audit/");
      expect(p.cmd.length).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ── singleflight ─────────────────────────────────────────────────────── */
describe("detectSiblings", () => {
  test("finds live sibling by cmdline tag, excludes self", () => {
    const cmdlines = new Map<number, string>([
      [1, "tini -- /start.sh"],
      [100, "bun mini-services/organ-commander/index.ts beat"], // sibling
      [200, "bun mini-services/organ-commander/index.ts beat"], // self
      [300, "bun --hot index.ts"],
    ]);
    const sibs = detectSiblings({ selfPid: 200, cmdlines });
    expect(sibs).toEqual([100]);
  });
});

/* ── runCycle (fail-honest end-to-end, injected) ──────────────────────── */
describe("runCycle", () => {
  test("all-alive + empty feed → honest noop verdict + receipt", async () => {
    const receipts = new ReceiptChain();
    const io = {
      probe: async (_s: OrganSpec) => ({ alive: true, detail: "ok" }),
      readFeed: () => 0,
      gitBehind: () => 0,
      aliveCheck: async () => true,
      spawn: () => 1,
      receipts,
      now: () => now,
      postCycle: async () => ({ ok: true, verdict: "ok" }),
      runnerOnce: async () => ({ ok: true, status: "no-work" }),
    };
    const r = await runCycle(io);
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("noop");
    expect(receipts.all().length).toBe(1);
    expect(receipts.all()[0].kind).toBe("cycle");
  });

  test("probe crash → ok:false verdict 'probe-error', receipt written, never throws", async () => {
    const receipts = new ReceiptChain();
    const io = {
      probe: async () => { throw new Error("boom"); },
      readFeed: () => 0,
      gitBehind: () => 0,
      aliveCheck: async () => false,
      spawn: () => 1,
      receipts,
      now: () => now,
      postCycle: async () => ({ ok: true, verdict: "ok" }),
      runnerOnce: async () => ({ ok: true, status: "no-work" }),
    };
    const r = await runCycle(io);
    expect(r.ok).toBe(false);
    expect(r.verdict).toBe("probe-error");
    expect(receipts.all().length).toBe(1);
  });

  test("dead dex → revive executed before any other command", async () => {
    const receipts = new ReceiptChain();
    const order: string[] = [];
    const io = {
      probe: async (s: OrganSpec) => ({ alive: s.organ !== "dex-node", detail: s.organ === "dex-node" ? "down" : "ok" }),
      readFeed: () => 1,
      gitBehind: () => 0,
      aliveCheck: async () => false,
      spawn: (p: SpawnPlan) => { order.push(`spawn:${p.port}`); return 1; },
      receipts,
      now: () => now,
      postCycle: async () => { order.push("forge-cycle"); return { ok: true, verdict: "ok" }; },
      runnerOnce: async () => { order.push("runner-once"); return { ok: true, status: "landed" }; },
    };
    const r = await runCycle(io);
    expect(r.ok).toBe(true);
    expect(order[0]).toBe("spawn:3010");
    expect(order).toContain("forge-cycle");
    expect(order).toContain("runner-once");
    expect(receipts.all().some((x) => x.kind === "revive" && x.organ === "dex-node")).toBe(true);
  });
});

/* ── measured cure wave 19.85b: dead forge gets revived too ──────────── */
describe("planNext (measured cure 19.85b)", () => {
  test("dead issue-forge (port free) → revive command", () => {
    const truth = {
      organs: ORGANS.map((o) => ({ organ: o.organ, alive: o.organ === "issue-forge" ? false : true, wrongOwner: false, detail: o.organ === "issue-forge" ? "ECONNREFUSED" : "ok", latencyMs: 1 })) as any,
      feedClaimable: 0, giantBehind: 0, at: new Date(now).toISOString(),
    };
    const cmds = planNext(truth, {}, now);
    const r = cmds.find((c) => c.kind === "revive" && c.organ === "issue-forge");
    expect(r).toBeTruthy();
    expect(r!.priority).toBeGreaterThanOrEqual(0);
  });
  test("cooldown also applies to the forge revive", () => {
    const mk = (): any => ({ organs: [{ organ: "issue-forge", alive: false, wrongOwner: false, detail: "down", latencyMs: 0 }], feedClaimable: 0, giantBehind: 0, at: new Date(now).toISOString() });
    expect(planNext(mk(), { "issue-forge": now + 60_000 }, now).filter((c) => c.kind === "revive")).toEqual([]);
    expect(planNext(mk(), { "issue-forge": now + 60_000 }, now + 61_000).some((c) => c.kind === "revive")).toBe(true);
  });
});
