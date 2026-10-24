/**
 * meta-planner.test.ts — סוויטת-אימות מלאה, אופליין ודטרמיניסטית (R365).
 *
 * כיסוי: גרף-ייבוא · פתרון-מסלולים · כל-חמשת הכללים · שרשרת-קבלות
 * (בנייה+אימות+טמפר) · דטרמיניזם · CLI (קודי-יציאה + דוחות) ·
 * סריקה-עצמית-נקייה (הוכחת אפס-חוב על המודול עצמו, פיקסצ'ות נשללות).
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  scanTarget,
  listSourceFiles,
  buildImportGraph,
  resolveImport,
  findCycles,
  scanContent,
  redactSnippet,
} from "../lib/scan";
import { buildContracts, contractsFromEvidence, verifyChain, renderMarkdown, EVIDENCE_CAP } from "../lib/issues";
import { parseTscOutput, evidenceFromTsc, EvidenceDoc } from "../lib/tsc";
import { runCli, readEvidenceDoc } from "../index";

const HERE = import.meta.dir;
const FIXTURES = join(HERE, "fixtures");
const DIRTY = join(FIXTURES, "dirty");
const CLEAN = join(FIXTURES, "clean");
const TYPES = join(FIXTURES, "typedebt");
const SELF_ROOT = join(HERE, "..");

// ערכי-הסוד הדמי נבנים-בריצה — אף-ליטרל-סוד בקוד-המקור של המבחן עצמו
const RAW = {
  github: "ghp_" + "A".repeat(36),
  wif: "5K" + "d".repeat(50),
  aws: "AKIA" + "IOSFODNN7EXAMPLE",
};

function freshOut(): string {
  return mkdtempSync(join(tmpdir(), "meta-planner-test-"));
}

describe("import graph", () => {
  test("resolves relative specs across extension and index candidates", () => {
    const files = listSourceFiles(CLEAN);
    const all = new Set(files);
    expect(resolveImport("index.ts", "./a", all)).toBe("a.ts");
    expect(resolveImport("a.ts", "./b", all)).toBe("b.ts");
    expect(resolveImport("a.ts", "b", all)).toBeNull(); // לא-יחסי ⇒ חבילה-חיצונית
    expect(resolveImport("a.ts", "./missing", all)).toBeNull();
  });

  test("builds deterministic edges on the clean fixture", () => {
    const files = listSourceFiles(CLEAN);
    const { edges } = buildImportGraph(CLEAN, files);
    expect(files.sort()).toEqual(["a.ts", "b.ts", "index.ts"]);
    expect([...edges.get("index.ts")!]).toEqual(["a.ts"]);
    expect([...edges.get("a.ts")!]).toEqual(["b.ts"]);
    expect([...edges.get("b.ts")!]).toEqual([]);
  });
});

describe("rule 1 — orphan modules", () => {
  test("flags exactly the stranded file on the dirty fixture", () => {
    const res = scanTarget(DIRTY);
    const orphans = res.findings.filter((f) => f.kind === "orphan-module").map((f) => f.file);
    expect(orphans).toEqual(["orphan.ts"]);
  });

  test("entry points and imported files are never flagged on the clean fixture", () => {
    const res = scanTarget(CLEAN);
    expect(res.findings.filter((f) => f.kind === "orphan-module")).toEqual([]);
  });
});

describe("rule 2 — circular imports", () => {
  test("detects the a<->b cycle with a canonical chain", () => {
    const files = listSourceFiles(DIRTY);
    const { edges } = buildImportGraph(DIRTY, files);
    const cycles = findCycles(edges);
    expect(cycles).toEqual([["a.ts", "b.ts"]]);
  });

  test("the clean fixture is acyclic", () => {
    const files = listSourceFiles(CLEAN);
    const { edges } = buildImportGraph(CLEAN, files);
    expect(findCycles(edges)).toEqual([]);
  });
});

describe("rule 3 — skeleton code", () => {
  test("flags every skeleton marker in todo.ts with exact lines", () => {
    const text = readFileSync(join(DIRTY, "todo.ts"), "utf8");
    const found = scanContent("todo.ts", text).filter((f) => f.kind === "placeholder-code");
    const lines = found.map((f) => f.line).sort((x, y) => x - y);
    expect(lines).toEqual([2, 3, 4]);
    expect(found.every((f) => f.file === "todo.ts")).toBe(true);
  });
});

describe("rule 4 — plaintext secrets", () => {
  test("detects all four secret families in secret.ts", () => {
    const text = readFileSync(join(DIRTY, "secret.ts"), "utf8");
    const found = scanContent("secret.ts", text).filter((f) => f.kind === "plaintext-secret");
    const families = found.map((f) => f.detail).sort();
    expect(families).toEqual(["aws-access-key", "github-token", "pem-private-key", "wif-key"]);
  });

  test("evidence is always redacted — zero raw secret bytes in any finding", () => {
    const res = scanTarget(DIRTY);
    const serialized = JSON.stringify(res.findings);
    for (const s of [RAW.github, RAW.wif, RAW.aws]) expect(serialized).not.toContain(s);
    const secretFindings = res.findings.filter((f) => f.kind === "plaintext-secret");
    expect(secretFindings.length).toBe(4);
    expect(secretFindings.every((f) => f.snippet.includes("REDACTED"))).toBe(true);
  });

  test("redactSnippet hides tokens but preserves shape evidence", () => {
    const out = redactSnippet("const k = \"" + RAW.github + "\";");
    expect(out).toContain("ghp_AA…REDACTED(len=40)");
    expect(out).not.toContain("A".repeat(36));
  });
});

describe("rule 5 — silent catch", () => {
  test("flags both the empty and comment-only catch blocks", () => {
    const text = readFileSync(join(DIRTY, "silent.ts"), "utf8");
    const found = scanContent("silent.ts", text).filter((f) => f.kind === "silent-catch");
    expect(found.length).toBe(2);
    expect(found.map((f) => f.line).sort((x, y) => x - y)).toEqual([4, 11]);
  });

  test("a catch with real handling is never flagged", () => {
    const code = ['try {', '  risky();', '} catch (err) {', '  throw new Error("handled: " + String(err));', '}'].join("\n");
    expect(scanContent("x.ts", code).filter((f) => f.kind === "silent-catch")).toEqual([]);
  });
});

describe("issue contracts + receipt chain", () => {
  test("contracts are ordered by severity and carry verified hash-linked receipts", () => {
    const res = scanTarget(DIRTY);
    const contracts = buildContracts(res.findings);
    expect(contracts.length).toBe(res.findings.length);
    expect(contracts[0].severity).toBe("critical"); // סודות ראשונים
    expect(contracts.map((c) => c.id)).toEqual(contracts.map((_, i) => `MP-${String(i + 1).padStart(4, "0")}`));
    expect(verifyChain(contracts)).toEqual([]);
  });

  test("tampering with any contract breaks the chain verifiably", () => {
    const contracts = buildContracts(scanTarget(DIRTY).findings);
    const tampered = contracts.map((c, i) => (i === 2 ? { ...c, title: "forged" } : c));
    expect(verifyChain(tampered).length).toBeGreaterThan(0);
  });

  test("markdown rendering is complete and deterministic", () => {
    const contracts = buildContracts(scanTarget(DIRTY).findings);
    const md1 = renderMarkdown(contracts);
    const md2 = renderMarkdown(buildContracts(scanTarget(DIRTY).findings));
    expect(md1).toBe(md2);
    expect(md1).toContain("MP-0001");
    expect(md1).toContain("sha256=");
  });
});

describe("determinism", () => {
  test("two full scans produce byte-identical findings", () => {
    const a = JSON.stringify(scanTarget(DIRTY).findings);
    const b = JSON.stringify(scanTarget(DIRTY).findings);
    expect(a).toBe(b);
  });
});

describe("CLI (fail-closed)", () => {
  test("exits 1 on high-severity breach and writes both reports", () => {
    const out = freshOut();
    try {
      const res = runCli([DIRTY, "--out", out], HERE);
      expect(res.code).toBe(1);
      expect(res.contracts).toBeGreaterThan(0);
      expect(existsSync(join(out, "issues.json"))).toBe(true);
      expect(existsSync(join(out, "issues.md"))).toBe(true);
      const parsed = JSON.parse(readFileSync(join(out, "issues.json"), "utf8"));
      expect(parsed.schema).toBe("meta-planner/issues@2");
      expect(parsed.count).toBe(res.contracts);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("exits 0 on a clean target", () => {
    const out = freshOut();
    try {
      const res = runCli([CLEAN, "--out", out], HERE);
      expect(res.code).toBe(0);
      expect(res.findings).toBe(0);
      expect(res.contracts).toBe(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("rule 6 (v2) — type-debt (explicit type suppression)", () => {
  test("flags all three suppression markers with exact lines and details", () => {
    const res = scanTarget(TYPES);
    const found = res.findings.filter((f) => f.kind === "type-debt");
    expect(found.map((f) => f.line).sort((x, y) => x - y)).toEqual([2, 5, 8]);
    expect(found.map((f) => f.detail).sort()).toEqual(["ts-expect-error", "ts-ignore", "ts-nocheck"]);
  });

  test("the typedebt fixture yields zero orphan findings (rule isolation)", () => {
    const res = scanTarget(TYPES);
    expect(res.findings.filter((f) => f.kind === "orphan-module")).toEqual([]);
  });

  test("sound code without suppression is never flagged", () => {
    const code = ["// בריא לגמרי", "const x: number = 1;", "export default x;"].join("\n");
    expect(scanContent("ok.ts", code).filter((f) => f.kind === "type-debt")).toEqual([]);
  });
});

describe("v2 — tsc evidence parser (pure, deterministic)", () => {
  const SAMPLE = [
    "src/lib/a.ts(12,5): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
    "junk line that matches nothing",
    "src/lib/a.ts(3,1): error TS2304: Cannot find name 'foo'.",
    "src/lib/b.ts(7,9): error TS7006: Parameter 'x' implicitly has an 'any' type.",
    "not-an-error.ts(1,1): another junk",
  ].join("\n");

  test("parses only canonical tsc lines, sorted by file then line", () => {
    const items = parseTscOutput(SAMPLE);
    expect(items.length).toBe(3);
    expect(items[0]).toEqual({ file: "src/lib/a.ts", line: 3, col: 1, code: "TS2304", message: "Cannot find name 'foo'." });
    expect(items[1].line).toBe(12);
    expect(items[2].file).toBe("src/lib/b.ts");
    expect(items.every((i) => i.code.startsWith("TS"))).toBe(true);
  });

  test("determinism — same text yields identical items", () => {
    expect(JSON.stringify(parseTscOutput(SAMPLE))).toBe(JSON.stringify(parseTscOutput(SAMPLE)));
  });

  test("evidenceFromTsc produces a schema@1 doc with kind hints", () => {
    const doc = evidenceFromTsc(parseTscOutput(SAMPLE), "handover: convergence-lane wave 19.79");
    expect(doc.schema).toBe("meta-planner/evidence@1");
    expect(doc.items.length).toBe(3);
    expect(doc.items[0].kind).toBe("tsc-error");
    expect(doc.items[0].message.startsWith("TS")).toBe(true);
  });
});

describe("v2 — contractsFromEvidence (grouping + chain + redaction)", () => {
  const doc: EvidenceDoc = {
    schema: "meta-planner/evidence@1",
    source: "measured: tsc --noEmit on giant main (handover honored)",
    items: [
      { file: "src/x/one.ts", line: 1, message: "TS2304: Cannot find name 'a'.", kind: "tsc-error" },
      { file: "src/x/one.ts", line: 2, message: "TS2322: Type 'number' is not assignable.", kind: "tsc-error" },
      { file: "src/x/two.ts", line: 9, message: "TS7006: Parameter implicitly 'any'.", kind: "tsc-error" },
      { file: "(pr:#199)", line: 0, message: "closed unmerged — feat/empire-registry-validator (WS-1)", kind: "stranded-work" },
    ],
  };

  test("tsc errors group per-file, stranded work stays per-item", () => {
    const contracts = contractsFromEvidence(doc);
    expect(contracts.length).toBe(3); // one.ts, two.ts, #199
    const tsc = contracts.filter((c) => c.kind === "tsc-error");
    expect(tsc.map((c) => c.subsystem)).toEqual(["src", "src"]);
    const stranded = contracts.find((c) => c.kind === "stranded-work");
    expect(stranded?.severity).toBe("high");
    expect(stranded?.evidence[0].file).toContain("#199"); // הרפרנס נישא בשדה-המקור
    expect(stranded?.evidence[0].snippet).toContain("empire-registry-validator");
  });

  test("tsc title carries the measured per-file count", () => {
    const contracts = contractsFromEvidence(doc);
    const one = contracts.find((c) => c.evidence[0].file === "src/x/one.ts");
    expect(one?.title).toContain("2");
  });

  test("chain verifies and tampering with payloadHash breaks it", () => {
    const contracts = contractsFromEvidence(doc);
    expect(verifyChain(contracts)).toEqual([]);
    const tampered = contracts.map((c, i) =>
      i === 1 ? { ...c, receipt: { ...c.receipt, payloadHash: "f".repeat(64) } } : c,
    );
    expect(verifyChain(tampered).some((p) => p.includes("payloadHash"))).toBe(true);
  });

  test("evidence messages are redacted — zero secret bytes survive ingest", () => {
    const secret = RAW.github;
    const docSecret: EvidenceDoc = {
      schema: "meta-planner/evidence@1",
      source: "t",
      items: [{ file: "src/s.ts", line: 4, message: `leak: ${secret}`, kind: "tsc-error" }],
    };
    const contracts = contractsFromEvidence(docSecret);
    expect(JSON.stringify(contracts)).not.toContain(secret);
    expect(contracts[0].evidence[0].snippet).toContain("REDACTED");
  });

  test("evidence cap — a file with more items than EVIDENCE_CAP keeps exactly the cap, deterministically", () => {
    const items = Array.from({ length: EVIDENCE_CAP + 7 }, (_, i) => ({
      file: "src/big.ts",
      line: i + 1,
      message: `TS1005: err ${i}`,
      kind: "tsc-error" as const,
    }));
    const contracts = contractsFromEvidence({ schema: "meta-planner/evidence@1", source: "t", items });
    expect(contracts.length).toBe(1);
    expect(contracts[0].evidence.length).toBe(EVIDENCE_CAP);
    expect(contracts[0].evidence[0].line).toBe(1);
    expect(JSON.stringify(contractsFromEvidence({ schema: "meta-planner/evidence@1", source: "t", items }))).toBe(
      JSON.stringify(contracts),
    );
  });
});

describe("v2 — CLI ingest (fail-closed)", () => {
  test("ingests a valid evidence doc and writes schema@2 reports", () => {
    const out = freshOut();
    const evPath = join(out, "evidence.json");
    const doc: EvidenceDoc = {
      schema: "meta-planner/evidence@1",
      source: "test",
      items: [{ file: "src/a.ts", line: 3, message: "TS2304: boom", kind: "tsc-error" }],
    };
    writeFileSync(evPath, JSON.stringify(doc));
    try {
      const res = runCli(["ingest", evPath, "--out", out, "--fail-on", "high"], HERE);
      expect(res.code).toBe(0); // tsc-error = medium ⇒ no high breach
      expect(res.contracts).toBe(1);
      const parsed = JSON.parse(readFileSync(join(out, "issues.json"), "utf8"));
      expect(parsed.schema).toBe("meta-planner/issues@2");
      expect(parsed.contracts[0].receipt.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("stranded-work evidence breaches at --fail-on high (rescue-worthy by design)", () => {
    const out = freshOut();
    const evPath = join(out, "evidence.json");
    const doc: EvidenceDoc = {
      schema: "meta-planner/evidence@1",
      source: "test",
      items: [{ file: "(pr:#202)", line: 0, message: "closed unmerged", kind: "stranded-work" }],
    };
    writeFileSync(evPath, JSON.stringify(doc));
    try {
      const res = runCli(["ingest", evPath, "--out", out], HERE);
      expect(res.code).toBe(1);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("malformed evidence fails closed with exit 2 — never invents contracts", () => {
    const out = freshOut();
    const bad = join(out, "bad.json");
    writeFileSync(bad, JSON.stringify({ schema: "wrong/schema", items: [] }));
    try {
      const res = runCli(["ingest", bad, "--out", out], HERE);
      expect(res.code).toBe(2);
      expect(res.contracts).toBe(0);
      expect(() => readEvidenceDoc(bad)).toThrow();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("self-scan (zero-debt proof)", () => {
  test("scanning its own source yields zero findings (fixtures excluded as test data)", () => {
    const res = scanTarget(SELF_ROOT, { ignore: ["fixtures"] });
    expect(res.findings).toEqual([]);
    expect(buildContracts(res.findings)).toEqual([]);
  });
});
