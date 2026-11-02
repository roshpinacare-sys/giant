/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/dex-format.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * fmtClock/fmtDaySec use host-locale Intl formatters without explicit timezone: the suite asserts same-process self-consistency + shape (honest), while every numeric formatter is fully captured.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/dex-format";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/dex-format.ts (forge characterization batch-1)", () => {
  test("fmtMicro captured", () => {
    expect(mod.fmtMicro(0)).toBe("0 µ");
    expect(mod.fmtMicro(462400)).toBe("462.4K µ");
    expect(mod.fmtMicro(1.5e9)).toBe("1.50B µ");
    expect(mod.fmtMicro(2.3e12)).toBe("2300.00B µ");
    expect(mod.fmtMicro(Infinity)).toBe("—");
  });
  test("fmtPrice captured", () => {
    expect(mod.fmtPrice(1234.5)).toBe("1,234.50");
    expect(mod.fmtPrice(0.0001234)).toBe("0.000123");
    expect(mod.fmtPrice(0)).toBe("0.00");
  });
  test("fmtPct captured", () => {
    expect(mod.fmtPct(12.3456)).toBe("+12.35%");
    expect(mod.fmtPct(-0.5)).toBe("-0.50%");
  });
  test("fmtAmount captured", () => {
    expect(mod.fmtAmount(123456.789)).toBe("123,457");
    expect(mod.fmtAmount(42)).toBe("42");
  });
  test("fmtUsd captured", () => {
    expect(mod.fmtUsd(1234.5)).toBe("$1,234.5");
    expect(mod.fmtUsd(0)).toBe("$0");
  });
  test("fmtClock self-consistent shape (host TZ honest)", () => {
    const a = mod.fmtClock(new Date(Date.UTC(2026, 10, 2, 12, 34, 56)));
    const b = mod.fmtClock(new Date(Date.UTC(2026, 10, 2, 12, 34, 56)));
    expect(a).toBe(b);
    expect(a).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
  test("fmtDaySec self-consistent shape (host TZ honest)", () => {
    const a = mod.fmtDaySec(1761984000);
    const b = mod.fmtDaySec(1761984000);
    expect(a).toBe(b);
    expect(a).toMatch(/^\d{2}\.\d{2}$/);
  });
  test("timeAgoHe captured with frozen clock", () => {
    const FIXED_NOW = 1793620800000;
    const realNow = Date.now;
    Date.now = () => FIXED_NOW;
    try {
      expect(mod.timeAgoHe(new Date(FIXED_NOW - 30_000).toISOString())).toBe("לפני 30 שנ׳");
      expect(mod.timeAgoHe(new Date(FIXED_NOW - 5 * 60_000).toISOString())).toBe("לפני 5 דק׳");
      expect(mod.timeAgoHe(new Date(FIXED_NOW - 3 * 3_600_000).toISOString())).toBe("לפני 3 שע׳");
      expect(mod.timeAgoHe(new Date(FIXED_NOW - 2 * 86_400_000).toISOString())).toBe("לפני 2 ימ׳");
      expect(mod.timeAgoHe(new Date(FIXED_NOW + 9_000).toISOString())).toBe("לפני 0 שנ׳");
    } finally { Date.now = realNow; }
  });
  test("chainColor + CHAIN_COLORS captured", () => {
    expect(mod.chainColor("Giant Chain")).toBe("bg-emerald-500/15 text-emerald-600 dark:text-emerald-400");
    expect(mod.chainColor("Ethereum")).toBe("bg-zinc-500/15 text-zinc-600 dark:text-zinc-300");
    expect(mod.chainColor("BNB Chain")).toBe("bg-amber-500/15 text-amber-700 dark:text-amber-400");
    expect(mod.chainColor("Solana")).toBe("bg-purple-500/15 text-purple-700 dark:text-purple-400");
    expect(mod.chainColor("Tron")).toBe("bg-red-500/15 text-red-700 dark:text-red-400");
    expect(mod.chainColor("TON")).toBe("bg-teal-500/15 text-teal-700 dark:text-teal-400");
    expect(mod.chainColor("Unknown")).toBe("bg-zinc-500/15 text-zinc-600 dark:text-zinc-300");
    expect(canon(mod.CHAIN_COLORS)).toBe("{\"BNB Chain\":\"bg-amber-500/15 text-amber-700 dark:text-amber-400\",\"Ethereum\":\"bg-zinc-500/15 text-zinc-600 dark:text-zinc-300\",\"Giant Chain\":\"bg-emerald-500/15 text-emerald-600 dark:text-emerald-400\",\"Solana\":\"bg-purple-500/15 text-purple-700 dark:text-purple-400\",\"TON\":\"bg-teal-500/15 text-teal-700 dark:text-teal-400\",\"Tron\":\"bg-red-500/15 text-red-700 dark:text-red-400\"}");
  });
  test("direction colors captured", () => {
    expect(mod.upColor).toBe("text-emerald-600 dark:text-emerald-400");
    expect(mod.downColor).toBe("text-red-600 dark:text-red-400");
  });
});
