/**
 * fixers.ts — deterministic fixers for the issue-to-PR runner.
 *
 * v1 fixer: trunkTypesCure — the trunk-level types cure filed claimable by
 * the meta-planner v2 receipt ("installing the two standard type packages +
 * types field — claimable, needs trunk-owner coordination (bun.lock churn)").
 * With the owner's full-authorization directive (trace 1a16e9871c9c9db1),
 * this lane claimed it in giant/SWARM_STATE.md (claim 76ccb8d) and executes it.
 *
 * Laws:
 *  - applicable() is a pure read (package.json probe).
 *  - apply() captures original bytes FIRST; edits are surgical.
 *  - revert() restores the captured bytes exactly (fail-closed gate).
 *  - install (bun install) only runs in live mode (opts.install === true);
 *    unit tests stay offline/deterministic.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Contract, FixResult, Fixer, FixSnapshot } from "./planner-feed";

interface PackageJson {
  name?: string;
  types?: string;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

function readPkg(repoRoot: string): PackageJson | null {
  const p = join(repoRoot, "package.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

export const trunkTypesCure: Fixer = {
  name: "trunk-types-cure",
  kinds: ["type-debt"],

  applicable(repoRoot: string): boolean {
    const pkg = readPkg(repoRoot);
    if (!pkg) return false;
    return !pkg.devDependencies?.["@types/node"];
  },

  claims(_contract: Contract, repoRoot: string): boolean {
    return this.applicable!(repoRoot);
  },

  /** Pure preview: what WOULD change. Returns null when not applicable. */
  plan(repoRoot: string): { addDevDeps: string[]; after: PackageJson } | null {
    const pkg = readPkg(repoRoot);
    if (!pkg || pkg.devDependencies?.["@types/node"]) return null;
    const existing = Object.keys(pkg.devDependencies ?? {});
    if (!existing.includes("@types/node")) existing.push("@types/node");
    existing.sort();
    const rebuilt: Record<string, string> = {};
    for (const k of existing) rebuilt[k] = pkg.devDependencies?.[k] ?? "latest";
    return { addDevDeps: ["@types/node"], after: { ...pkg, devDependencies: rebuilt } };
  },

  apply(repoRoot: string, _contract: Contract, opts?: { install?: boolean }): FixResult {
    const pkgPath = join(repoRoot, "package.json");
    const originalBytes = readFileSync(pkgPath);
    const pkg = JSON.parse(originalBytes.toString("utf8")) as PackageJson;
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}) };
    // Deterministic placement: alphabetical position inside devDependencies.
    const existing = Object.keys(pkg.devDependencies);
    if (!existing.includes("@types/node")) {
      existing.push("@types/node");
      existing.sort();
      const rebuilt: Record<string, string> = {};
      for (const k of existing) rebuilt[k] = pkg.devDependencies[k] ?? "latest";
      pkg.devDependencies = rebuilt;
    }
    const after = `${JSON.stringify(pkg, null, 2)}\n`;
    writeFileSync(pkgPath, after);

    const snapshot: FixSnapshot = { "package.json": originalBytes };

    if (opts?.install === true) {
      const proc = Bun.spawnSync(["bun", "install"], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
      if (proc.exitCode !== 0) {
        writeFileSync(pkgPath, originalBytes); // revert on failed install — fail closed
        return {
          changed: false,
          proof: { fixer: this.name, error: "bun-install-failed", stderr: proc.stderr.toString().slice(0, 400) },
          snapshot,
        };
      }
    }

    return {
      changed: true,
      proof: {
        fixer: this.name,
        added: ["@types/node"],
        installed: opts?.install === true,
      },
      snapshot,
    };
  },

  revert(repoRoot: string, snapshot: FixSnapshot): void {
    const bytes = snapshot["package.json"];
    if (bytes instanceof Uint8Array) {
      writeFileSync(join(repoRoot, "package.json"), bytes);
    }
  },
};

/** Deterministic test-double fixer (injection seam for the TDD suite). */
export function fakeFixer(claims: boolean, result = "fake"): Fixer {
  return {
    name: "fake-fixer",
    kinds: ["silent-catch", "type-debt", "placeholder-code", "orphan-module"],
    claims: () => claims,
    apply: () => ({ changed: true, proof: { result } }),
  };
}
