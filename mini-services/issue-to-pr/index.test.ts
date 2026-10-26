/**
 * index.test.ts — TDD suite for the native issue-to-PR runner (§9.3).
 * Written BEFORE the implementation (red-first law, directive trace 1a16e9871c9c9db1).
 *
 * The runner consumes meta-planner's machine-readable contracts feed
 * (mini-services/meta-planner/state/issues.json, schema meta-planner/issues@2)
 * and turns claimable items into deterministic, gated, receipt-chained fixes.
 *
 * Run: bun test mini-services/issue-to-pr
 * Everything offline/deterministic: no network, no real tsc, tmp dirs only.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadFeed, rank, selectWork, type Contract, type Feed } from "./planner-feed";
import { trunkTypesCure, fakeFixer } from "./fixers";
import { ReceiptChain, type WorkReceipt } from "./receipts";
import { once, type RunnerIo } from "./index";

// ── fixtures ────────────────────────────────────────────────────────────────

const CONTRACT = (over: Partial<Contract> = {}): Contract => ({
  id: "MP-0001",
  kind: "silent-catch",
  severity: "medium",
  subsystem: "src",
  title: "silent catch swallows failure",
  evidence: [{ file: "src/a.ts", line: 3, snippet: "catch (e) {}" }],
  invariant: "fail-honest",
  ...over,
});

const FEED = (contracts: Contract[]): Feed => ({
  schema: "meta-planner/issues@2",
  count: contracts.length,
  contracts,
});

// ── planner-feed ────────────────────────────────────────────────────────────

describe("planner-feed — fail-closed schema law", () => {
  test("loadFeed accepts a well-formed issues@2 feed", () => {
    const dir = mkdtempSync(join(tmpdir(), "feed-"));
    const p = join(dir, "issues.json");
    writeFileSync(p, JSON.stringify(FEED([CONTRACT()])));
    const feed = loadFeed(p);
    expect(feed.contracts).toHaveLength(1);
    expect(feed.schema).toBe("meta-planner/issues@2");
    rmSync(dir, { recursive: true, force: true });
  });

  test("loadFeed rejects a malformed feed (wrong schema) — fail closed", () => {
    const dir = mkdtempSync(join(tmpdir(), "feed-"));
    const p = join(dir, "issues.json");
    writeFileSync(p, JSON.stringify({ schema: "unknown@9", count: 0, contracts: [] }));
    expect(() => loadFeed(p)).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  test("loadFeed rejects count drift (declared count ≠ actual length)", () => {
    const dir = mkdtempSync(join(tmpdir(), "feed-"));
    const p = join(dir, "issues.json");
    writeFileSync(p, JSON.stringify({ schema: "meta-planner/issues@2", count: 5, contracts: [CONTRACT()] }));
    expect(() => loadFeed(p)).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  test("loadFeed rejects a missing file — fail closed, never empty-honest", () => {
    expect(() => loadFeed("/nonexistent/issues.json")).toThrow();
  });
});

describe("rank — deterministic severity order", () => {
  test("critical > high > medium > low, id ascending inside a tier", () => {
    const ranked = rank([
      CONTRACT({ id: "MP-0009", severity: "low" }),
      CONTRACT({ id: "MP-0004", severity: "medium" }),
      CONTRACT({ id: "MP-0002", severity: "high" }),
      CONTRACT({ id: "MP-0001", severity: "critical" }),
      CONTRACT({ id: "MP-0003", severity: "high" }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(["MP-0001", "MP-0002", "MP-0003", "MP-0004", "MP-0009"]);
  });

  test("rank never mutates the input array", () => {
    const input = [CONTRACT({ id: "MP-0002" }), CONTRACT({ id: "MP-0001" })];
    const snapshot = JSON.stringify(input);
    rank(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("selectWork — highest claimable item with an applicable fixer", () => {
  test("picks the highest-severity item whose fixer claims it", () => {
    const io: RunnerIo = {
      fixers: [fakeFixer(false), fakeFixer(true, "fake-fix")],
    };
    const item = selectWork(FEED([CONTRACT({ id: "MP-0001" }), CONTRACT({ id: "MP-0002", severity: "critical" })]), io);
    expect(item?.contract.id).toBe("MP-0002"); // rank law: critical first, second fixer claims it
  });

  test("first claiming fixer in io order wins for the same item", () => {
    const io: RunnerIo = { fixers: [fakeFixer(true, "first"), fakeFixer(true, "second")] };
    const item = selectWork(FEED([CONTRACT({ id: "MP-0001" })]), io);
    expect(item?.fixer.name).toBe("fake-fixer");
  });

  test("returns null honestly when nothing is claimable", () => {
    const io: RunnerIo = { fixers: [fakeFixer(false)] };
    expect(selectWork(FEED([CONTRACT()]), io)).toBeNull();
  });

  test("returns null on an empty feed — never fabricates work", () => {
    expect(selectWork(FEED([]), { fixers: [fakeFixer(true)] })).toBeNull();
  });
});

// ── fixers ──────────────────────────────────────────────────────────────────

describe("trunk-types cure — applicability + surgical plan", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cure-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("applicable when @types/node missing from devDependencies", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", devDependencies: { "bun-types": "1" } }));
    expect(trunkTypesCure.applicable(dir)).toBe(true);
  });

  test("not applicable when @types/node already present — idempotent law", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", devDependencies: { "@types/node": "^20" } }));
    expect(trunkTypesCure.applicable(dir)).toBe(false);
  });

  test("not applicable when package.json is absent — fail closed", () => {
    expect(trunkTypesCure.applicable(dir)).toBe(false);
  });

  test("plan preserves every existing key and adds exactly @types/node", () => {
    const pkg = { name: "giant", scripts: { dev: "next dev" }, devDependencies: { "bun-types": "1.3.14", typescript: "^5" } };
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
    const plan = trunkTypesCure.plan!(dir);
    expect(plan).not.toBeNull();
    expect(plan!.addDevDeps).toEqual(["@types/node"]);
    expect(plan!.after.devDependencies!["@types/node"]).toBeDefined();
    expect(plan!.after.name).toBe("giant");
    expect(Object.keys(plan!.after.scripts!)).toEqual(["dev"]);
  });
});

// ── receipts ────────────────────────────────────────────────────────────────

describe("receipts — sha256 hash chain, tamper-evident", () => {
  test("verifyChain accepts a well-formed chain", () => {
    const chain = new ReceiptChain("unit-test-genesis");
    const r1 = chain.append({ at: "2026-10-24T00:00:00Z", item: "MP-0001", action: "probe", proof: { ok: true } });
    const r2 = chain.append({ at: "2026-10-24T00:00:01Z", item: "MP-0002", action: "fix", proof: { ok: true } });
    expect(chain.verify()).toEqual({ ok: true, count: 2 });
    expect(r1.prev).toBe("unit-test-genesis");
    expect(r2.prev).toBe(r1.sig);
  });

  test("verifyChain detects tampering with any field", () => {
    const chain = new ReceiptChain("genesis");
    chain.append({ at: "t1", item: "MP-0001", action: "probe", proof: { ok: true } });
    const r = chain.all()[0] as WorkReceipt & { proof: { ok: boolean } };
    r.proof.ok = false;
    expect(chain.verify().ok).toBe(false);
  });

  test("receipt sig is deterministic for identical payload+prev", () => {
    const a = new ReceiptChain("g");
    const b = new ReceiptChain("g");
    const payload = { at: "t", item: "MP-0001", action: "probe", proof: { x: 1 } };
    expect(a.append(payload).sig).toBe(b.append(payload).sig);
  });
});

// ── gate — fail-closed law ──────────────────────────────────────────────────

describe("once — orchestration with fail-closed gate", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "once-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("green path: feed → select → apply → gate green → receipt appended", async () => {
    writeFileSync(join(dir, "issues.json"), JSON.stringify(FEED([CONTRACT({ id: "MP-0007" })])));
    let gateRuns = 0;
    const io: RunnerIo = {
      feedPath: join(dir, "issues.json"),
      repoRoot: dir,
      fixers: [fakeFixer(true, "applied")],
      gate: async () => {
        gateRuns++;
        return { green: true, detail: "3 test files green" };
      },
      land: async () => ({ landed: true, commit: "deadbeef" }),
    };
    const result = await once(io);
    expect(result.status).toBe("landed");
    expect(result.commit).toBe("deadbeef");
    expect(gateRuns).toBe(1);
    expect(result.receipts.map((r) => r.action)).toEqual(["select", "fix", "gate", "land"]); // full audit chain
    expect(result.receipts.every((r) => r.sig.length === 64)).toBe(true);
  });

  test("red gate: fix aborted, nothing landed, abort receipt issued — fail closed", async () => {
    const pkgPath = join(dir, "package.json");
    writeFileSync(pkgPath, JSON.stringify({ name: "x", devDependencies: {} }, null, 2));
    writeFileSync(join(dir, "issues.json"), JSON.stringify(FEED([CONTRACT({ id: "MP-0001", kind: "type-debt" })])));
    const bytesBefore = readFileSync(pkgPath);
    const io: RunnerIo = {
      feedPath: join(dir, "issues.json"),
      repoRoot: dir,
      fixers: [trunkTypesCure],
      gate: async () => ({ green: false, detail: "tsc delta did not decrease" }),
      land: async () => {
        throw new Error("land must never be called when the gate is red");
      },
    };
    const result = await once(io);
    expect(result.status).toBe("aborted");
    expect(result.commit).toBeNull();
    expect(readFileSync(pkgPath).equals(bytesBefore)).toBe(true); // byte-identical revert
    const abortReceipt = result.receipts.find((r) => r.action === "abort");
    expect(abortReceipt).toBeDefined();
  });

  test("no claimable work: honest no-op terminal, zero receipts", async () => {
    writeFileSync(join(dir, "issues.json"), JSON.stringify(FEED([])));
    const io: RunnerIo = { feedPath: join(dir, "issues.json"), repoRoot: dir, fixers: [fakeFixer(true)] };
    const result = await once(io);
    expect(result.status).toBe("no-work");
    expect(result.receipts).toHaveLength(0);
  });

  test("feed failure: fail-honest terminal with error receipt, never throws", async () => {
    const io: RunnerIo = { feedPath: "/nonexistent/issues.json", repoRoot: dir, fixers: [] };
    const result = await once(io);
    expect(result.status).toBe("feed-error");
    expect(result.commit).toBeNull();
  });
});
