import { afterAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectFileFacts } from "./collect.ts";

/** REAL git fixture — a genuine repository with deterministic commit dates.
 * No mocks: the collector is tested against actual git behavior. */
const repo = mkdtempSync(join(tmpdir(), "doc-truth-collect-"));
const run = (cmd: string, env: Record<string, string> = {}) =>
  execSync(cmd, { cwd: repo, env: { ...process.env, ...env }, stdio: "ignore" });

// 40 days before the census clock 2026-10-24T18:00:00Z → 2026-09-14T18:00:00Z
run(`git init -q .`);
run(`git config user.email t@t && git config user.name t`);
writeFileSync(join(repo, "old.md"), "old\n");
run(`git add . && git commit -qm "old doc"`, {
  GIT_AUTHOR_DATE: "2026-09-14T18:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-09-14T18:00:00+00:00",
});
execSync("mkdir -p docs", { cwd: repo });
writeFileSync(join(repo, "docs/nested.md"), "nested\n");
writeFileSync(join(repo, "fresh.md"), "fresh\n");
run(`git add . && git commit -qm "fresh docs"`, {
  GIT_AUTHOR_DATE: "2026-10-23T18:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-10-23T18:00:00+00:00",
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("doc-truth collector — real git metadata", () => {
  test("first-sighting per file = last commit, real ISO dates and authors", async () => {
    const r = await collectFileFacts(repo);
    const byPath = new Map(r.facts.map((f) => [f.path, f]));
    const old = byPath.get("old.md");
    const fresh = byPath.get("fresh.md");
    const nested = byPath.get("docs/nested.md");
    expect(old).toBeDefined();
    expect(fresh).toBeDefined();
    expect(nested).toBeDefined();
    expect(old?.lastCommitIso).toBe("2026-09-14T18:00:00Z");
    expect(fresh?.lastCommitIso).toBe("2026-10-23T18:00:00Z");
    expect(old?.author).toBe("t");
    expect(r.walkedCommits).toBe(2);
    expect(r.historyComplete).toBe(true); // 2 commits, both walked → root seen
  });

  test("non-git directory fails closed with an honest error", async () => {
    const empty = mkdtempSync(join(tmpdir(), "doc-truth-nogit-"));
    try {
      await expect(collectFileFacts(empty)).rejects.toThrow(/not a git work tree/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("doc-truth collector — completeness law (ls-files union)", () => {
  test("a file untouched inside the walk window is still reported (not invisible)", async () => {
    // default maxCommits=400 covers the fixture, so pass a tiny window to
    // force the untouched file through the per-file fallback path
    const r = await collectFileFacts(repo, 1);
    const byPath = new Map(r.facts.map((f) => [f.path, f]));
    // walked only 1 commit (fresh docs); old.md was NOT in that window
    expect(r.walkedCommits).toBe(1);
    expect(r.fallbackQueries).toBeGreaterThanOrEqual(1);
    expect(byPath.get("old.md")).toBeDefined();
    expect(byPath.get("old.md")?.lastCommitIso).toBe("2026-09-14T18:00:00Z");
  });

  test("full walk (window >= history) needs zero fallbacks", async () => {
    const r = await collectFileFacts(repo, 400);
    expect(r.fallbackQueries).toBe(0);
    expect(r.historyComplete).toBe(true);
  });
});
