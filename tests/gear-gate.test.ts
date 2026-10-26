/**
 * gear-gate.test.ts — GAP-2 gate law tests (deterministic · zero-dep · no network · no time).
 * ════════════════════════════════════════════════════════════════════════════════════════
 * The law under test is the R329/R330 gearbox law of saos-dex grids/policy.mjs
 * (SAOS-POLICY-GEARS/1): green streaks promote, any FAILED/HALTED resets instantly,
 * neutral verdicts neither grow nor reset, kelly only tightens. This suite pins the
 * giant-side INDEPENDENT evaluator (src/lib/gear-gate.ts) to that exact law so the
 * auditor can never drift from the road it audits.
 * Every fixture is inline and deterministic — no clock, no randomness, no I/O.
 */
import { describe, expect, test } from "bun:test";
import {
  classifyVerdict,
  replayReceipts,
  evaluateGearGate,
  streakFromHistory,
  effectiveCaps,
  GEAR_GATE_PROTOCOL,
  type GearTable,
  type GearReceipt,
} from "../src/lib/gear-gate";

// The measured canary gear table (saos-dex grids/state/policy-gears.json, 2026-10-26).
const TABLE: GearTable = {
  protocol: "SAOS-POLICY-GEARS/1",
  gears: [
    { gear: 1, require: { greenStreak: 0 }, laneOverrides: { grid: { maxNotionalPerOpSbd: 25, maxCycleNotionalSbd: 120 } } },
    { gear: 2, require: { greenStreak: 6 }, laneOverrides: { grid: { maxNotionalPerOpSbd: 50, maxCycleNotionalSbd: 240 } } },
    { gear: 3, require: { greenStreak: 12 }, laneOverrides: { grid: { maxNotionalPerOpSbd: 100, maxCycleNotionalSbd: 480 } } },
  ],
};

const green = (at: string, kind = "army"): GearReceipt => ({ at, kind, verdict: "ARMY-ACTED" });
const red = (at: string, kind = "army"): GearReceipt => ({ at, kind, verdict: "ARMY-ACTS-FAILED" });
const neutral = (at: string, kind = "army"): GearReceipt => ({ at, kind, verdict: "ARMY-AT-TARGET" });
const at = (n: number): string => `2026-10-26T00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}Z`;

describe("classifyVerdict — the R329 receipt law", () => {
  test("ACTED without FAILED/HALTED is green", () => {
    expect(classifyVerdict("ARMY-ACTED")).toBe("green");
    expect(classifyVerdict("LADDER-ACTED")).toBe("green");
    expect(classifyVerdict("VOTED-LIVE")).toBe("neutral"); // no ACTED token → neutral
  });
  test("FAILED / HALTED is red even when containing ACTED", () => {
    expect(classifyVerdict("ARMY-ACTS-FAILED")).toBe("red");
    expect(classifyVerdict("POLICY-HALTED")).toBe("red");
    expect(classifyVerdict("LADDER-ACTED-BUT-HALTED")).toBe("red");
  });
  test("neutral verdicts (AT-TARGET / STASIS / anything else)", () => {
    expect(classifyVerdict("ARMY-AT-TARGET")).toBe("neutral");
    expect(classifyVerdict("STASIS")).toBe("neutral");
    expect(classifyVerdict("")).toBe("neutral");
  });
});

describe("replayReceipts — streak arithmetic from zero", () => {
  test("zero receipts → gear 1, streak 0", () => {
    const r = replayReceipts([], TABLE);
    expect(r.gear).toBe(1);
    expect(r.greenStreak).toBe(0);
    expect(r.steps).toEqual([]);
  });
  test("5 greens stay in gear 1 (gear 2 needs 6)", () => {
    const r = replayReceipts([1, 2, 3, 4, 5].map(at).map((t) => green(t)), TABLE);
    expect(r.gear).toBe(1);
    expect(r.greenStreak).toBe(5);
  });
  test("6th green promotes exactly to gear 2", () => {
    const r = replayReceipts([1, 2, 3, 4, 5, 6].map(at).map((t) => green(t)), TABLE);
    expect(r.gear).toBe(2);
    expect(r.greenStreak).toBe(6);
  });
  test("12 consecutive greens reach gear 3 (one gear per receipt)", () => {
    const r = replayReceipts(Array.from({ length: 12 }, (_, i) => at(i + 1)).map((t) => green(t)), TABLE);
    expect(r.gear).toBe(3);
    expect(r.greenStreak).toBe(12);
  });
  test("red resets instantly to gear 1 / streak 0", () => {
    const r = replayReceipts([...Array.from({ length: 8 }, (_, i) => at(i + 1)).map((t) => green(t)), red(at(9))], TABLE);
    expect(r.gear).toBe(1);
    expect(r.greenStreak).toBe(0);
  });
  test("neutral neither grows nor resets", () => {
    const r = replayReceipts([green(at(1)), neutral(at(2)), neutral(at(3)), green(at(4)), neutral(at(5))], TABLE);
    expect(r.gear).toBe(1);
    expect(r.greenStreak).toBe(2);
  });
  test("recovery after reset: 6 greens then red then 1 green", () => {
    const r = replayReceipts(
      [
        ...Array.from({ length: 6 }, (_, i) => at(i + 1)).map((t) => green(t)),
        red(at(7)),
        green(at(8)),
      ],
      TABLE,
    );
    expect(r.gear).toBe(1);
    expect(r.greenStreak).toBe(1);
  });
  test("replay steps carry per-step classification and state", () => {
    const r = replayReceipts([green(at(1)), neutral(at(2)), red(at(3))], TABLE);
    expect(r.steps.map((s) => s.classification)).toEqual(["green", "neutral", "red"]);
    expect(r.steps.map((s) => s.greenStreak)).toEqual([1, 1, 0]);
    expect(r.steps.map((s) => s.gear)).toEqual([1, 1, 1]);
  });
  test("out-of-order receipts replay as given (caller owns chronological order)", () => {
    // The law is a chronological replay; the evaluator does not silently reorder.
    const r = replayReceipts([red(at(9)), ...Array.from({ length: 6 }, (_, i) => at(i + 1)).map((t) => green(t))], TABLE);
    expect(r.gear).toBe(2);
    expect(r.greenStreak).toBe(6);
  });
});

describe("evaluateGearGate — per-gear verdicts with exact missing evidence", () => {
  test("measured state (streak 1) → HELD at gear 1, gear2 needs 5, gear3 needs 11", () => {
    const r = evaluateGearGate(TABLE, [green(at(1))]);
    expect(r.law).toBe(GEAR_GATE_PROTOCOL);
    expect(r.verdict).toBe("HELD");
    expect(r.gear).toBe(1);
    const g2 = r.perGear.find((x) => x.gear === 2);
    const g3 = r.perGear.find((x) => x.gear === 3);
    expect(g2?.earned).toBe(false);
    expect(g2?.missingEvidence).toEqual([
      "greenStreak 1/6 — 5 more consecutive green verdicts required (e.g. ARMY-ACTED/LADDER-ACTED)",
      "replay sits in gear 1; row 2 unlocks only after the streak requirement above is met on the live road",
    ]);
    expect(g3?.earned).toBe(false);
    expect(g3?.missingEvidence).toEqual([
      "greenStreak 1/12 — 11 more consecutive green verdicts required (e.g. ARMY-ACTED/LADDER-ACTED)",
      "replay sits in gear 1; row 3 unlocks only after the streak requirement above is met on the live road",
    ]);
    const g1 = r.perGear.find((x) => x.gear === 1);
    expect(g1?.earned).toBe(true);
  });
  test("streak 12 → PROMOTED to gear 3, no missing evidence", () => {
    const r = evaluateGearGate(TABLE, Array.from({ length: 12 }, (_, i) => at(i + 1)).map((t) => green(t)));
    expect(r.verdict).toBe("PROMOTED");
    expect(r.gear).toBe(3);
    expect(r.perGear.every((x) => x.earned)).toBe(true);
    expect(r.perGear.flatMap((x) => x.missingEvidence)).toEqual([]);
  });
  test("caps ride the earned gear row", () => {
    const r = evaluateGearGate(TABLE, Array.from({ length: 6 }, (_, i) => at(i + 1)).map((t) => green(t)));
    expect(r.gear).toBe(2);
    const g2 = r.perGear.find((x) => x.gear === 2);
    expect(g2?.caps).toEqual({ maxNotionalPerOpSbd: 50, maxCycleNotionalSbd: 240, kellyTightened: false });
  });
  test("malformed table fails closed to gear 1 with why — never invents caps", () => {
    const bad = { protocol: "SAOMETHING-ELSE/9", gears: [] } as unknown as GearTable;
    const r = evaluateGearGate(bad, Array.from({ length: 20 }, (_, i) => at(i + 1)).map((t) => green(t)));
    expect(r.verdict).toBe("HELD");
    expect(r.gear).toBe(1);
    expect(r.greenStreak).toBe(0);
    expect(r.why.length).toBeGreaterThan(0);
    expect(r.perGear).toEqual([]);
  });
  test("table without gear-1 row still fails closed conservatively", () => {
    const bad: GearTable = {
      protocol: "SAOS-POLICY-GEARS/1",
      gears: [{ gear: 2, require: { greenStreak: 6 }, laneOverrides: { grid: { maxNotionalPerOpSbd: 50, maxCycleNotionalSbd: 240 } } }],
    };
    const r = evaluateGearGate(bad, [green(at(1))]);
    expect(r.verdict).toBe("HELD");
    expect(r.gear).toBe(1);
  });
});

describe("streakFromHistory — cross-check against the git-written gearbox history", () => {
  test("derives the same streak the recorded state carries (green tail)", () => {
    const history = [
      { at: at(5), kind: "army", verdict: "ARMY-ACTED", gear: 1, greenStreak: 3 },
      { at: at(4), kind: "army", verdict: "ARMY-ACTED", gear: 1, greenStreak: 2 },
      { at: at(3), kind: "army", verdict: "ARMY-ACTED", gear: 1, greenStreak: 1 },
      { at: at(2), kind: "army", verdict: "ARMY-ACTS-FAILED", gear: 1, greenStreak: 0 },
    ];
    expect(streakFromHistory(history)).toBe(3);
  });
  test("stops counting at the newest red", () => {
    const history = [
      { at: at(2), kind: "army", verdict: "ARMY-ACTS-FAILED", gear: 1, greenStreak: 0 },
      { at: at(1), kind: "army", verdict: "ARMY-ACTED", gear: 1, greenStreak: 4 },
    ];
    expect(streakFromHistory(history)).toBe(0);
  });
  test("empty history → 0", () => {
    expect(streakFromHistory([])).toBe(0);
  });
  test("neutral tail does not count and does not reset (transparent)", () => {
    const history = [
      { at: at(3), kind: "army", verdict: "ARMY-AT-TARGET", gear: 1, greenStreak: 2 },
      { at: at(2), kind: "army", verdict: "ARMY-ACTED", gear: 1, greenStreak: 2 },
      { at: at(1), kind: "army", verdict: "ARMY-ACTED", gear: 1, greenStreak: 1 },
    ];
    expect(streakFromHistory(history)).toBe(2);
  });
});

describe("effectiveCaps — R330 kelly can only tighten, never loosen", () => {
  const kelly = { enabled: true, cap: 3 } as const;
  test("kelly below row cap → tightened", () => {
    expect(effectiveCaps(TABLE.gears[0], kelly)).toEqual({ maxNotionalPerOpSbd: 3, maxCycleNotionalSbd: 14, kellyTightened: true });
  });
  test("kelly above row cap → row cap stands (never loosened)", () => {
    expect(effectiveCaps(TABLE.gears[2], { enabled: true, cap: 500 })).toEqual({ maxNotionalPerOpSbd: 100, maxCycleNotionalSbd: 480, kellyTightened: false });
  });
  test("no kelly → table row verbatim", () => {
    expect(effectiveCaps(TABLE.gears[1], null)).toEqual({ maxNotionalPerOpSbd: 50, maxCycleNotionalSbd: 240, kellyTightened: false });
  });
});
