import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFileFacts } from "./collect.ts";

/** Offset dates (the fleet's real +03:00 commits) must normalize to UTC Z. */
describe("doc-truth collector — offset-date normalization", () => {
  test("+03:00 commit timestamps are normalized to Z at the I/O boundary", async () => {
    const repo = mkdtempSync(join(tmpdir(), "doc-truth-tz-"));
    try {
      const run = (cmd: string, env: Record<string, string> = {}) =>
        execSync(cmd, { cwd: repo, env: { ...process.env, ...env }, stdio: "ignore" });
      run("git init -q . && git config user.email t@t && git config user.name fleet");
      writeFileSync(join(repo, "a.md"), "a\n");
      run('git add . && git commit -qm tz', {
        GIT_AUTHOR_DATE: "2026-10-14T20:23:34+03:00",
        GIT_COMMITTER_DATE: "2026-10-14T20:23:34+03:00",
      });
      const r = await collectFileFacts(repo);
      expect(r.facts).toHaveLength(1);
      expect(r.facts[0].lastCommitIso).toBe("2026-10-14T17:23:34Z");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
