/**
 * git-law.test.ts — TDD RED (written before implementation, §6 zero-slop gate)
 * חוקת-הגיט בתוך-הדימון עצמו: כל-commit שהארכיטקט-נוחת חייב-חתימת-GPG
 * גם-אם-ה-runner שכח-את-החוק-בקונפיג-הגלובלי. אפס-אמון בסביבה.
 */
import { describe, test, expect } from "bun:test";

import { commitArgs, rebaseArgs } from "../git-law.ts";

describe("git-law — the constitution enforced inside the daemon", () => {
  test("commit argv forces GPG signing regardless of ambient config", () => {
    const args = commitArgs("fix(architect): x cured");
    expect(args).toEqual(["-c", "commit.gpgsign=true", "commit", "-m", "fix(architect): x cured"]);
  });

  test("commit argv keeps message byte-exact (no shell, no quoting drift)", () => {
    const msg = 'fix(architect): quote-test " --amend --no-verify';
    const args = commitArgs(msg);
    expect(args[args.length - 1]).toBe(msg);
  });

  test("rebase argv auto-stashes over live writers and targets origin/main", () => {
    expect(rebaseArgs()).toEqual(["-c", "rebase.autoStash=true", "rebase", "origin/main"]);
  });
});
