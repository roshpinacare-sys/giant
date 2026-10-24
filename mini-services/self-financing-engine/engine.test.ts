// TDD suite — deterministic (injected clocks), zero mocks on money paths, fail-honest.
import { describe, test, expect } from "bun:test";
import { planRcRebalance, planCurationHarvest, accrue, verifyAccrual, cycle, state, type SoldierRc, type SoldierVp } from "./index.ts";
import { censusFromBook, type BookRecord } from "./roster-from-book.ts";

const T0 = Date.parse("2026-10-24T21:00:00.000Z");

describe("rc-plan (§1 RC delegation rebalancing)", () => {
  const roster: SoldierRc[] = [
    { account: "a-donor", rcPct: 95, delegationInVests: 100_000, targetFloorPct: 25, ceilingPct: 90 },
    { account: "b-needy", rcPct: 10, delegationInVests: 100_000, targetFloorPct: 25, ceilingPct: 90 },
    { account: "c-ok",    rcPct: 50, delegationInVests: 100_000, targetFloorPct: 25, ceilingPct: 90 },
  ];
  test("moves vests from above-ceiling to below-floor only", () => {
    const p = planRcRebalance(roster, "2026-10-24T21:00:00Z");
    expect(p.donors).toEqual(["a-donor"]);
    expect(p.needy).toEqual(["b-needy"]);
    expect(p.transfers.length).toBe(1);
    expect(p.transfers[0].from).toBe("a-donor");
    expect(p.transfers[0].to).toBe("b-needy");
    expect(p.transfers[0].vests).toBeGreaterThan(0);
    expect(p.transfers[0].vests).toBeLessThanOrEqual(2_500); // capacity = 5% × 100k × 0.5
  });
  test("conservation: conservedVests equals sum of transfers (zero-sum)", () => {
    const p = planRcRebalance(roster, "2026-10-24T21:00:00Z");
    expect(p.conservedVests).toBe(p.transfers.reduce((a, t) => a + t.vests, 0));
  });
  test("honest unresolvable when donors cannot cover the deficit", () => {
    const tiny: SoldierRc[] = [
      { account: "d", rcPct: 91, delegationInVests: 10, targetFloorPct: 25, ceilingPct: 90 },
      { account: "n", rcPct: 1, delegationInVests: 1_000_000, targetFloorPct: 25, ceilingPct: 90 },
    ];
    const p = planRcRebalance(tiny, "2026-10-24T21:00:00Z");
    expect(p.unresolvable).toEqual(["n"]); // never hidden
  });
  test("validation: empty roster, duplicates, out-of-range all fail loud", () => {
    expect(() => planRcRebalance([], "x")).toThrow(TypeError);
    expect(() => planRcRebalance([{ account: "x", rcPct: 50, delegationInVests: 1 }, { account: "x", rcPct: 60, delegationInVests: 1 }], "x")).toThrow(TypeError);
    expect(() => planRcRebalance([{ account: "x", rcPct: 150, delegationInVests: 1 }], "x")).toThrow(RangeError);
  });
});

describe("curation-harvest (§1 reward harvesting)", () => {
  test("idle full-VP soldier wastes its full daily capacity — and the plan recovers it", () => {
    const p = planCurationHarvest([{ account: "s1", vpPct: 100, regenPctPerDay: 20, voteValueUsd: 10, lastVoteIso: null }], T0);
    expect(p.dailyWasteIfIdleUsd).toBeCloseTo(2.0);   // 10 × 20/100
    expect(p.dailyRecoverableUsd).toBeCloseTo(2.0);
    expect(p.entries[0].hoursToThreshold).toBe(0);
    expect(p.entries[0].voteAtIso).toBe("2026-10-24T21:00:00.000Z"); // deterministic injected clock
  });
  test("under-threshold soldier schedules the deterministic vote instant", () => {
    const p = planCurationHarvest([{ account: "s2", vpPct: 50, regenPctPerDay: 20, voteValueUsd: 100, lastVoteIso: null }], T0);
    // gap = 45% at 20%/24h → 54 hours
    expect(p.entries[0].hoursToThreshold).toBeCloseTo(54, 1);
    expect(p.entries[0].voteAtIso).toBe("2026-10-27T03:00:00.000Z");
  });
  test("validation fails loud on out-of-range vp", () => {
    expect(() => planCurationHarvest([{ account: "s", vpPct: 120, regenPctPerDay: 20, voteValueUsd: 1, lastVoteIso: null }], T0)).toThrow(RangeError);
  });
});

describe("yield-accrual (§1 AMM micro-yield settlement, hash-linked)", () => {
  test("chain links h/prevH with monotonic seq and genesis", () => {
    let s = { records: [], totalMicroUnits: 0, headH: "0".repeat(64) };
    s = accrue(s, { source: "amm-spread", microUnits: 500, measuredAtIso: "2026-10-24T21:00:00Z" }, "2026-10-24T21:00:00Z");
    s = accrue(s, { source: "micro-arb", microUnits: 250, measuredAtIso: "2026-10-24T21:00:01Z" }, "2026-10-24T21:00:01Z");
    expect(s.records[0].prevH).toBe("0".repeat(64));
    expect(s.records[0].seq).toBe(1);
    expect(s.records[1].prevH).toBe(s.records[0].h);
    expect(s.records[1].seq).toBe(2);
    expect(s.totalMicroUnits).toBe(750);
    expect(verifyAccrual(s).ok).toBe(true);
  });
  test("full-rewrite-with-recomputed-total is detectable (tamper)", () => {
    let s = { records: [], totalMicroUnits: 0, headH: "0".repeat(64) };
    s = accrue(s, { source: "amm-spread", microUnits: 100, measuredAtIso: "t1" }, "t1");
    s = accrue(s, { source: "amm-spread", microUnits: 200, measuredAtIso: "t2" }, "t2");
    const forged = JSON.parse(JSON.stringify(s));
    forged.records[0].microUnits = 999; // history edit without recomputing h
    expect(verifyAccrual(forged)).toEqual({ ok: false, brokenAt: 1 });
  });
  test("no float money — non-integer or non-positive µ fails loud", () => {
    const g = { records: [], totalMicroUnits: 0, headH: "0".repeat(64) };
    expect(() => accrue(g, { source: "x", microUnits: 10.5, measuredAtIso: "t" }, "t")).toThrow(TypeError);
    expect(() => accrue(g, { source: "x", microUnits: 0, measuredAtIso: "t" }, "t")).toThrow(TypeError);
  });
});

describe("engine cycle (§2 all-soldier activation census)", () => {
  test("cycle counts, census measures activation, blockers honest on empty rosters", () => {
    const before = state.cycles;
    const rcR: SoldierRc[] = [
      { account: "donor", rcPct: 95, delegationInVests: 10_000, targetFloorPct: 25, ceilingPct: 90 },
      { account: "needy", rcPct: 10, delegationInVests: 10_000, targetFloorPct: 25, ceilingPct: 90 },
    ];
    const vpR: SoldierVp[] = [{ account: "curator", vpPct: 100, regenPctPerDay: 20, voteValueUsd: 5, lastVoteIso: null }];
    const s = cycle(rcR, vpR, [{ source: "orderbook-match", microUnits: 42, measuredAtIso: "t" }], T0);
    expect(s.cycles).toBe(before + 1);
    expect(s.activation.rosterSize).toBe(3);
    expect(s.activation.activeCount).toBe(3); // donor+needy (transfer) + curator (vote)
    expect(s.activation.activationPct).toBe(100);
    expect(s.activation.blockers).toEqual([]);
    expect(s.rc?.transfers.length).toBe(1);
    expect(s.harvest?.entries.length).toBe(1);
    expect(s.yields.totalMicroUnits).toBeGreaterThanOrEqual(42);
    expect(verifyAccrual(s.yields).ok).toBe(true);
  });
  test("empty rosters produce honest blockers, never silent zeros", () => {
    const before = state.cycles;
    const s = cycle([], [], [], T0 + 1);
    expect(s.cycles).toBe(before + 1);
    expect(s.activation.blockers).toContain("rc-roster-empty");
    expect(s.activation.blockers).toContain("vp-roster-empty");
  });
});

describe("roster-from-book (§2 measured all-soldier census + §1 self-financing proof)", () => {
  const T = Date.parse("2026-10-24T21:00:00.000Z");
  const book: BookRecord[] = [
    { seq: 1, kind: "service", from: "Console", to: "yarden", asset: "USDS", amount: 3.2, ts: T - 3600_000 },
    { seq: 2, kind: "tax", from: "yarden", to: "treasury", asset: "USDS", amount: 0.08, ts: T - 3600_000 },
    { seq: 3, kind: "swap", from: "gal", to: "tamar", asset: "USDS", amount: 1.0, ts: T - 5 * 3600_000 },
    { seq: 4, kind: "tip", from: "FleetHQ", to: "treasury", asset: "USDS", amount: 0.5, ts: T - 48 * 3600_000 },
  ];
  test("census measures the real roster, pseudonymized, with window truth", () => {
    const c = censusFromBook(book, T, 6);
    expect(c.rosterSize).toBe(6); // Console, yarden, treasury, gal, tamar, FleetHQ
    expect(c.activeCount).toBe(5); // within 6h: Console, yarden, treasury, gal, tamar (T-5h counts) — FleetHQ at 48h is out
    expect(c.activationPct).toBe(Math.round(5 / 6 * 100));
    expect(c.soldiers[0].pseudonym).toMatch(/^acct-h-[0-9a-f]{8}$/); // no raw handles in receipts
    expect(c.treasuryTaxMicroUnits).toBe(80_000); // 0.08 USDS → 80,000 µ
    expect(c.treasuryTaxAsset).toBe("USDS");
    expect(c.blockers).toEqual([]);
  });
  test("empty book is loud, never a silent zero roster", () => {
    const c = censusFromBook([], T, 6);
    expect(c.rosterSize).toBe(0);
    expect(c.blockers).toContain("book-empty");
  });
  test("stale-only book names the blocker honestly", () => {
    const stale: BookRecord[] = [{ kind: "service", from: "a", to: "b", asset: "USDS", amount: 1, ts: T - 72 * 3600_000 }];
    const c = censusFromBook(stale, T, 6);
    expect(c.activeCount).toBe(0);
    expect(c.blockers).toContain("no-recent-activity-in-window");
  });
});
