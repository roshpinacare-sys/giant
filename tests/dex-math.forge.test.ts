/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/dex-math.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/dex-math";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/dex-math.ts (forge characterization batch-1)", () => {
  test("ammQuote BUY captured", () => {
    expect(canon(mod.ammQuote({ base: 1000000, quote: 2000000 }, "BUY", 10000, 30))).toBe("{\"effectivePrice\":2.0160180541625032,\"outAmount\":4960.273038901039,\"priceImpactPct\":0.9994850225000018,\"reservesAfter\":{\"base\":995039.726961099,\"quote\":2009970}}");
  });
  test("ammQuote SELL captured", () => {
    expect(canon(mod.ammQuote({ base: 1000000, quote: 2000000 }, "SELL", 5000, 30))).toBe("{\"effectivePrice\":1.9841092155604159,\"outAmount\":9920.546077802079,\"priceImpactPct\":-0.9895941769181626,\"reservesAfter\":{\"base\":1004985,\"quote\":1990079.453922198}}");
  });
  test("ammQuote degenerate reserves guard", () => {
    expect(canon(mod.ammQuote({ base: 0, quote: 0 }, "BUY", 100, 30))).toBe("{\"effectivePrice\":0,\"outAmount\":0,\"priceImpactPct\":0,\"reservesAfter\":{\"base\":0,\"quote\":0}}");
  });
  test("ammQuote non-positive amount guard", () => {
    expect(canon(mod.ammQuote({ base: 1000, quote: 1000 }, "BUY", -5, 30))).toBe("{\"effectivePrice\":0,\"outAmount\":0,\"priceImpactPct\":0,\"reservesAfter\":{\"base\":1000,\"quote\":1000}}");
  });
  test("ammQuote determinism (double probe run)", () => {
    expect(canon(mod.ammQuote({ base: 1000000, quote: 2000000 }, "BUY", 10000, 30))).toBe("{\"effectivePrice\":2.0160180541625032,\"outAmount\":4960.273038901039,\"priceImpactPct\":0.9994850225000018,\"reservesAfter\":{\"base\":995039.726961099,\"quote\":2009970}}");
  });
  test("lpQuote first LP (no existing shares)", () => {
    expect(canon(mod.lpQuote({ base: 1000000, quote: 2000000 }, 0, 50000))).toBe("{\"baseAmount\":25000,\"poolSharePct\":2.4390243902439046,\"shares\":35355.33905932738}");
  });
  test("lpQuote existing shares", () => {
    expect(canon(mod.lpQuote({ base: 1000000, quote: 2000000 }, 1000, 50000))).toBe("{\"baseAmount\":25000,\"poolSharePct\":2.4390243902439046,\"shares\":24.99999999999991}");
  });
  test("poolAprPct captured", () => {
    expect(mod.poolAprPct(700, 100000)).toBe(36.5);
  });
  test("poolAprPct zero TVL guard", () => {
    expect(mod.poolAprPct(700, 0)).toBe(0);
  });
});
