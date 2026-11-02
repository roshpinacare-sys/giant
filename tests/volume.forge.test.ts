/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/markets/volume.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 */
import { describe, expect, test } from "bun:test";
import * as eng from "../src/lib/markets/engine";
import * as mod from "../src/lib/markets/volume";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/markets/volume.ts (forge characterization batch-1)", () => {
  test("makerSpreadBps ladder captured", () => {
    expect(mod.makerSpreadBps(50)).toBe(37);
    expect(mod.makerSpreadBps(200)).toBe(75);
    expect(mod.makerSpreadBps(600)).toBe(175);
    expect(mod.makerSpreadBps(5000)).toBe(1275);
  });
  test("runVolumeCycle genesis cycle captured (deterministic world)", () => {
    const vc = mod.runVolumeCycle(eng.makeWorld(), 0);
    expect(canon(vc)).toBe("{\"cycle\":0,\"notionalMakerMu\":71200000,\"notionalTakerMu\":0,\"ops\":[{\"actor\":\"maker-alef\",\"base\":\"*\",\"kind\":\"cancel\",\"quote\":\"USDS\",\"role\":\"maker\"},{\"actor\":\"maker-alef\",\"base\":\"XAI\",\"kind\":\"order\",\"priceMu\":6725200,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-alef\",\"base\":\"XAI\",\"kind\":\"order\",\"priceMu\":6874800,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-alef\",\"base\":\"XFIN\",\"kind\":\"order\",\"priceMu\":3381300,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-alef\",\"base\":\"XFIN\",\"kind\":\"order\",\"priceMu\":3418700,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-alef\",\"base\":\"XSHIP\",\"kind\":\"order\",\"priceMu\":1241250,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-alef\",\"base\":\"XSHIP\",\"kind\":\"order\",\"priceMu\":1258750,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-bet\",\"base\":\"*\",\"kind\":\"cancel\",\"quote\":\"USDS\",\"role\":\"maker\"},{\"actor\":\"maker-bet\",\"base\":\"XBIO\",\"kind\":\"order\",\"priceMu\":5335200,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-bet\",\"base\":\"XBIO\",\"kind\":\"order\",\"priceMu\":5464800,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-bet\",\"base\":\"XNRG\",\"kind\":\"order\",\"priceMu\":2087400,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-bet\",\"base\":\"XNRG\",\"kind\":\"order\",\"priceMu\":2112600,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-bet\",\"base\":\"XTECH\",\"kind\":\"order\",\"priceMu\":4166400,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-bet\",\"base\":\"XTECH\",\"kind\":\"order\",\"priceMu\":4233600,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-gimel\",\"base\":\"*\",\"kind\":\"cancel\",\"quote\":\"USDS\",\"role\":\"maker\"},{\"actor\":\"maker-gimel\",\"base\":\"XCONS\",\"kind\":\"order\",\"priceMu\":1642245,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-gimel\",\"base\":\"XCONS\",\"kind\":\"order\",\"priceMu\":1657755,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-gimel\",\"base\":\"XRE\",\"kind\":\"order\",\"priceMu\":2838600,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-gimel\",\"base\":\"XRE\",\"kind\":\"order\",\"priceMu\":2861400,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-dalet\",\"base\":\"*\",\"kind\":\"cancel\",\"quote\":\"USDS\",\"role\":\"maker\"},{\"actor\":\"maker-dalet\",\"base\":\"XDEF\",\"kind\":\"order\",\"priceMu\":3030175,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-dalet\",\"base\":\"XDEF\",\"kind\":\"order\",\"priceMu\":3069825,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"},{\"actor\":\"maker-dalet\",\"base\":\"XROB\",\"kind\":\"order\",\"priceMu\":4855900,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"buy\"},{\"actor\":\"maker-dalet\",\"base\":\"XROB\",\"kind\":\"order\",\"priceMu\":4944100,\"qty\":1,\"quote\":\"USDS\",\"role\":\"maker\",\"side\":\"sell\"}],\"refreshes\":4}");
  });
  test("runVolumeCycle determinism (fresh world, same cycle index)", () => {
    expect(canon(mod.runVolumeCycle(eng.makeWorld(), 0))).toBe(canon(mod.runVolumeCycle(eng.makeWorld(), 0)));
  });
  test("auditVolume captured for captured cycle", () => {
    const a = mod.auditVolume(mod.runVolumeCycle(eng.makeWorld(), 0));
    expect(a.ok).toBe(true);
    expect(a.makerMu).toBe(71200000);
    expect(a.takerMu).toBe(0);
  });
});
