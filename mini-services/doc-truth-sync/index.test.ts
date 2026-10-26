import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCensusWith, globToRegex } from "./index.ts";

describe("doc-truth include globs", () => {
  test("*.md matches root-level only", () => {
    const re = globToRegex("*.md");
    expect(re.test("README.md")).toBe(true);
    expect(re.test("docs/a.md")).toBe(false);
    expect(re.test("README.md.bak")).toBe(false);
  });

  test("docs/**/*.md matches nested docs and docs root", () => {
    const re = globToRegex("docs/**/*.md");
    expect(re.test("docs/a.md")).toBe(true);
    expect(re.test("docs/deep/b.md")).toBe(true);
    expect(re.test("src/a.md")).toBe(false);
  });

  test("literal names match exactly", () => {
    expect(globToRegex("SWARM_STATE.md").test("SWARM_STATE.md")).toBe(true);
    expect(globToRegex("SWARM_STATE.md").test("SWARM_STATE.md.tmp")).toBe(false);
  });

  test("regex metacharacters in filenames are escaped, not interpreted", () => {
    expect(globToRegex("a+b.md").test("a+b.md")).toBe(true);
    expect(globToRegex("a+b.md").test("aab.md")).toBe(false);
  });
});

/** REAL organ surface — parameterized census over a real temp git repo. */
describe("doc-truth-sync organ :3062 — real census surface", () => {
  let repo: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "doc-truth-organ-"));
    execSync("mkdir -p docs", { cwd: repo });
    writeFileSync(join(repo, "README.md"), "r\n");
    writeFileSync(join(repo, "docs/deep.md"), "d\n");
    const git = (cmd: string) => execSync(cmd, { cwd: repo, stdio: "ignore" });
    git("git init -q . && git config user.email t@t && git config user.name t");
    git("git add . && git commit -qm seed");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("census over the real fixture: docs census scoping works", async () => {
    const c = await runCensusWith(repo, ["*.md", "docs/**/*.md"], 7);
    expect(c.summary.total).toBe(2);
    expect(c.rows.some((r) => r.path === "README.md")).toBe(true);
    expect(c.rows.some((r) => r.path === "docs/deep.md")).toBe(true);
    expect(c.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("dormancy threshold is honored by the parameterized census", async () => {
    const c = await runCensusWith(repo, ["*.md"], 7);
    expect(c.rows[0].status).toBe("LIVE"); // committed just now in the fixture
    expect(c.summary.dormant).toBe(0);
  });
});
