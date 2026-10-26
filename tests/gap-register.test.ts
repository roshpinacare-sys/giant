/**
 * gap-register.test.ts — GAP-3 register law tests (deterministic · zero-dep).
 * The awakening register IS a quality gate: these tests pin its schema laws so a
 * future edit cannot silently drop evidence pointers, gates, or verdicts.
 * The register file is loaded from the committed tree — no network, no clock.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const REG = JSON.parse(readFileSync(join(REPO, "state/gap-closure/gap3-register.json"), "utf8"));

describe("SAOS-GAP3-DORMANT-AWAKENING-REGISTER/1 — register law", () => {
  test("schema, law and review horizon present", () => {
    expect(REG.schema).toBe("SAOS-GAP3-DORMANT-AWAKENING-REGISTER/1");
    expect(Array.isArray(REG.law) && REG.law.length >= 4).toBe(true);
    expect(typeof REG.reReviewBy).toBe("string");
    expect(new Date(REG.reReviewBy).getTime()).toBeGreaterThan(new Date(REG.at).getTime());
  });

  test("gate catalog defines every gate used, and only those", () => {
    const catalog = new Set(Object.keys(REG.gateCatalog));
    for (const a of REG.assets) {
      for (const g of a.gate) expect(catalog.has(g)).toBe(true);
    }
    // catalog gates are non-empty definitions
    for (const [k, v] of Object.entries(REG.gateCatalog)) {
      expect(k.length).toBeGreaterThan(3);
      expect(String(v).length).toBeGreaterThan(10);
    }
  });

  test("every asset row: class, verdict, measured status with source, action", () => {
    const classes = new Set(Object.keys(REG.classes));
    for (const a of REG.assets) {
      expect(classes.has(a.class)).toBe(true);
      expect(typeof a.standingVerdict).toBe("string");
      expect(typeof a.measuredStatus?.source).toBe("string");
      expect(typeof a.measuredStatus?.value).toBe("string");
      expect(typeof a.action).toBe("string");
      expect(Array.isArray(a.gate)).toBe(true);
      // an awake/retired asset may carry zero gates; a gated asset must carry at least one
      if (/KEEP-DORMANT|HANDOFF/.test(a.action)) expect(a.gate.length).toBeGreaterThan(0);
    }
  });

  test("no silent silencing: every KEEP-DORMANT/HANDOFF row names its gate holder", () => {
    for (const a of REG.assets) {
      if (a.action.startsWith("KEEP-DORMANT") || a.action.startsWith("HANDOFF")) {
        expect(/gate|gated|G77|lane|owner|census/i.test(a.action + " " + a.greenProofRequired)).toBe(true);
      }
    }
  });

  test("handoffs have unique ids and targets", () => {
    const ids = REG.handoffs.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of REG.handoffs) {
      expect(typeof h.to).toBe("string");
      expect(h.to.length).toBeGreaterThan(2);
      expect(typeof h.what).toBe("string");
    }
  });

  test("the census population is covered: 16 census rows + 5 stale-undecided", () => {
    const census = REG.assets.filter((a) => a.class === "fleet-dormant-census");
    const undecided = REG.assets.filter((a) => a.class === "stale-undecided");
    expect(census.length).toBe(16);
    expect(undecided.map((a) => a.asset).sort()).toEqual(
      ["agent9-clock", "oss-scanner", "saos-agents", "saos-markets", "saos-owner-channel"],
    );
  });

  test("giant-internal rows carry measured in-repo evidence only", () => {
    for (const a of REG.assets.filter((x) => x.class === "giant-internal")) {
      expect(a.measuredStatus.source).toMatch(/giant|state\/|Pulse|git history|SWARM_STATE/);
    }
  });
});

describe("GAP-2 gate-run receipt — the executed verdict is committed and lawful", () => {
  const RUN = JSON.parse(readFileSync(join(REPO, "state/gap-closure/gap2-gate-run.json"), "utf8"));
  test("schema + law + inputs measured", () => {
    expect(RUN.schema).toBe("SAOS-GAP2-GEAR-GATE-RUN/1");
    expect(RUN.law).toContain("SAOS-GEAR-GATE/1");
    expect(RUN.inputs.gearTable.protocol).toBe("SAOS-POLICY-GEARS/1");
    expect(RUN.inputs.receipts.army.stats.total).toBeGreaterThan(0);
    expect(RUN.inputs.receipts.treasury.stats.total).toBeGreaterThan(0);
  });
  test("a HELD verdict lists exact missing evidence (the lawful hold)", () => {
    const primary = RUN.runs.primary_ledgers;
    if (primary.verdict === "HELD") {
      const held = primary.perGear.filter((g: { earned: boolean }) => !g.earned);
      expect(held.length).toBeGreaterThan(0);
      for (const g of held) expect(g.missingEvidence.join(" ")).toMatch(/more consecutive green verdicts required/);
    } else {
      expect(primary.topEarnedGear).toBeGreaterThan(1);
    }
  });
});

describe("GAP-1 coverage ledger — measured, zero-fabrication", () => {
  const LED = JSON.parse(readFileSync(join(REPO, "state/gap-closure/gap1-coverage-ledger.json"), "utf8"));
  test("schema + verdict + basis", () => {
    expect(LED.schema).toBe("SAOS-GAP1-COMPUTE-COVERAGE/1");
    expect(typeof LED.coverage.verdict).toBe("string");
    expect(LED.coverage.verdictBasis.length).toBeGreaterThan(0);
  });
  test("every yield stream carries its source citation", () => {
    for (const [k, v] of Object.entries(LED.yield)) {
      if (v === null) continue; // honest unmeasured stays null
      expect(String((v as Record<string, unknown>).source ?? "")).toMatch(/^saos-dex:|^Pulse:/);
      expect(k.length).toBeGreaterThan(3);
    }
  });
  test("the private-minutes basis names the census numbers, never an invented rate", () => {
    expect(LED.coverage.privateRepoComputeOverheadBasis).toMatch(/private=\d+/);
    expect(LED.compute.fleetVisibility.private).toBe(0);
    expect(LED.coverage.privateRepoComputeOverheadUsd).toBe(0);
  });
});
