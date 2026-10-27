import { describe, expect, test } from "bun:test";
import {
  KNOWN_AUTOMATORS,
  buildCensus,
  classifyFile,
  payloadHashOfCensus,
  type FileFact,
} from "./census.ts";

const CLOCK = "2026-10-24T18:00:00Z";
const DAY = 86_400_000;
const iso = (daysAgo: number) =>
  new Date(Date.parse(CLOCK) - daysAgo * DAY).toISOString().replace(".000Z", "Z");
const fact = (path: string, daysAgo: number, author = "agent-9"): FileFact => ({
  path,
  lastCommitIso: iso(daysAgo),
  author,
});

describe("doc-truth census — deterministic staleness classifier", () => {
  test("fresh file (age <= dormantAfterDays) is LIVE", () => {
    const row = classifyFile(fact("docs/a.md", 2), CLOCK, 7);
    expect(row.status).toBe("LIVE");
    expect(row.ageDays).toBe(2);
  });

  test("old file (age > dormantAfterDays) is DORMANT", () => {
    const row = classifyFile(fact("docs/old.md", 30), CLOCK, 7);
    expect(row.status).toBe("DORMANT");
    expect(row.ageDays).toBe(30);
  });

  test("boundary law: age exactly dormantAfterDays stays LIVE; one more day is DORMANT", () => {
    expect(classifyFile(fact("a.md", 7), CLOCK, 7).status).toBe("LIVE");
    expect(classifyFile(fact("a.md", 8), CLOCK, 7).status).toBe("DORMANT");
  });

  test("future-dated commit (negative age) fails closed — injected-clock violation", () => {
    expect(() => classifyFile(fact("a.md", -1), CLOCK, 7)).toThrow(/clock-before-commit/);
  });

  test("dormantAfterDays < 1 fails closed", () => {
    expect(() => classifyFile(fact("a.md", 1), CLOCK, 0)).toThrow(/dormantAfterDays/);
  });

  test("empty path fails closed", () => {
    expect(() => classifyFile(fact("", 1), CLOCK, 7)).toThrow(/path/);
  });

  test("malformed iso fails closed (fact and clock)", () => {
    const bad: FileFact = { path: "a.md", lastCommitIso: "yesterday", author: "x" };
    expect(() => classifyFile(bad, CLOCK, 7)).toThrow(/iso/);
    expect(() => classifyFile(fact("a.md", 1), "now", 7)).toThrow(/iso/);
  });

  test("AUTOMATED: declared bot author on an old file is bot-owned, not dormant", () => {
    expect(KNOWN_AUTOMATORS.size).toBeGreaterThanOrEqual(3);
    const bot = [...KNOWN_AUTOMATORS][0];
    const row = classifyFile(fact("pulse.json", 90, bot), CLOCK, 7);
    expect(row.status).toBe("AUTOMATED");
  });

  test("the same declared author on a FRESH file is plain LIVE (age wins)", () => {
    const bot = [...KNOWN_AUTOMATORS][0];
    expect(classifyFile(fact("pulse.json", 1, bot), CLOCK, 7).status).toBe("LIVE");
  });

  test("unknown author on an old file is DORMANT even if the name looks bot-like", () => {
    expect(classifyFile(fact("x.md", 90, "maybe-bot-9000"), CLOCK, 7).status).toBe("DORMANT");
  });

  test("duplicate paths fail closed", () => {
    expect(() => buildCensus([fact("a.md", 1), fact("a.md", 2)], CLOCK, 7)).toThrow(/duplicate/);
  });

  test("census rows are sorted by path ascending — deterministic output", () => {
    const { rows } = buildCensus([fact("z.md", 1), fact("a.md", 2), fact("m.md", 40)], CLOCK, 7);
    expect(rows.map((r) => r.path)).toEqual(["a.md", "m.md", "z.md"]);
  });

  test("summary math: live/automated/dormant counts + dormant share in parts-per-million", () => {
    const bot = [...KNOWN_AUTOMATORS][0];
    const facts = [
      fact("a.md", 1),
      fact("b.md", 2),
      fact("pulse.json", 90, bot),
      fact("old1.md", 40),
      fact("old2.md", 90),
    ];
    const { summary } = buildCensus(facts, CLOCK, 7);
    expect(summary.total).toBe(5);
    expect(summary.live).toBe(2);
    expect(summary.automated).toBe(1);
    expect(summary.dormant).toBe(2);
    expect(summary.dormantSharePpm).toBe(400_000);
  });

  test("empty census is a valid, honest zero state", () => {
    const { rows, summary } = buildCensus([], CLOCK, 7);
    expect(rows).toHaveLength(0);
    expect(summary.total).toBe(0);
    expect(summary.dormantSharePpm).toBe(0);
  });

  test("payloadHashOfCensus is stable for identical rows and sensitive to any change", () => {
    const a = buildCensus([fact("a.md", 1), fact("b.md", 40)], CLOCK, 7).rows;
    const b = buildCensus([fact("a.md", 1), fact("b.md", 40)], CLOCK, 7).rows;
    expect(payloadHashOfCensus(a)).toBe(payloadHashOfCensus(b));
    const c = buildCensus([fact("a.md", 1), fact("b.md", 41)], CLOCK, 7).rows;
    expect(payloadHashOfCensus(c)).not.toBe(payloadHashOfCensus(a));
  });
});
