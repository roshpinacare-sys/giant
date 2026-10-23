/**
 * meta-planner.test.ts — סוויטת-אימות מלאה, אופליין ודטרמיניסטית (R365).
 *
 * כיסוי: גרף-ייבוא · פתרון-מסלולים · כל-חמשת הכללים · שרשרת-קבלות
 * (בנייה+אימות+טמפר) · דטרמיניזם · CLI (קודי-יציאה + דוחות) ·
 * סריקה-עצמית-נקייה (הוכחת אפס-חוב על המודול עצמו, פיקסצ'ות נשללות).
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "fs";
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
import { buildContracts, verifyChain, renderMarkdown } from "../lib/issues";
import { runCli } from "../index";

const HERE = import.meta.dir;
const FIXTURES = join(HERE, "fixtures");
const DIRTY = join(FIXTURES, "dirty");
const CLEAN = join(FIXTURES, "clean");
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
      expect(parsed.schema).toBe("meta-planner/issues@1");
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

describe("self-scan (zero-debt proof)", () => {
  test("scanning its own source yields zero findings (fixtures excluded as test data)", () => {
    const res = scanTarget(SELF_ROOT, { ignore: ["fixtures"] });
    expect(res.findings).toEqual([]);
    expect(buildContracts(res.findings)).toEqual([]);
  });
});
