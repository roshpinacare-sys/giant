/* collect.ts — REAL git metadata collector (the only I/O layer).
 *
 * Walks `git log` once from HEAD, first-sighting per file = last commit.
 * Deterministic given a repo state; zero mocks — real child_process git.
 */
import { spawnSync } from "node:child_process";

import type { FileFact } from "./census.ts";

/** Normalize git iso-strict output (may carry +03:00-style offsets) to UTC Z. */
function toUtcZ(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso; // classifier's fail-closed law will reject honestly
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export interface CollectResult {
  readonly facts: FileFact[];
  readonly walkedCommits: number;
  /** files resolved via per-file git log -1 (untouched inside the walk window) */
  readonly fallbackQueries: number;
  readonly historyComplete: boolean;
}

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

export async function collectFileFacts(repoRoot: string, maxCommits = 400): Promise<CollectResult> {
  const probe = git(["rev-parse", "--is-inside-work-tree"], repoRoot);
  if (!probe.ok) throw new Error(`collect: ${repoRoot} is not a git work tree (${probe.err.trim()})`);

  const roots = git(["rev-list", "--max-parents=0", "HEAD"], repoRoot);
  const rootShas = new Set(roots.ok ? roots.out.trim().split("\n").filter(Boolean) : []);

  const log = git(
    ["log", `--max-count=${maxCommits}`, "--date=iso-strict", "--format=%x01%H%x02%aI%x03%an", "--name-only"],
    repoRoot,
  );
  if (!log.ok) throw new Error(`collect: git log failed: ${log.err.trim()}`);

  const facts = new Map<string, FileFact>();
  let walked = 0;
  let sawRoot = false;
  let current: { iso: string; author: string } | null = null;
  for (const line of log.out.split("\n")) {
    if (line.startsWith("\u0001")) {
      walked++;
      const rest = line.slice(1);
      const sepIso = rest.indexOf("\u0002");
      const sepAuthor = rest.indexOf("\u0003");
      current = { iso: rest.slice(sepIso + 1, sepAuthor), author: rest.slice(sepAuthor + 1) };
      if (rootShas.has(rest.slice(0, sepIso))) sawRoot = true;
      continue;
    }
    const path = line.trim();
    if (path.length === 0 || current === null || facts.has(path)) continue;
    facts.set(path, { path, lastCommitIso: toUtcZ(current.iso), author: current.author });
  }

  // Completeness law: a file NOT touched inside the walk window is the MOST
  // dormant kind — it must still appear. Union with git ls-files and query
  // the unseen ones individually (git log -1 -- <path>).
  const ls = git(["ls-files"], repoRoot);
  if (!ls.ok) throw new Error(`collect: git ls-files failed: ${ls.err.trim()}`);
  let fallbackQueries = 0;
  for (const path of ls.out.split("\n")) {
    const p = path.trim();
    if (p.length === 0 || facts.has(p)) continue;
    const one = git(["log", "-1", "--date=iso-strict", "--format=%aI%x09%an", "--", p], repoRoot);
    fallbackQueries++;
    const firstLine = one.out.split("\n")[0] ?? "";
    const sep = firstLine.indexOf("\t");
    if (one.ok && sep > 0) {
      facts.set(p, { path: p, lastCommitIso: toUtcZ(firstLine.slice(0, sep)), author: firstLine.slice(sep + 1) });
    } else {
      // No resolvable commit (e.g., sparse checkout): record honestly with an
      // epoch-past author-less marker? NO — fail-closed honesty: skip silently
      // would hide it. Record with iso "1970-01-01T00:00:00Z" + author
      // "unresolvable" so the census shows it maximally stale, visibly.
      facts.set(p, { path: p, lastCommitIso: "1970-01-01T00:00:00Z", author: "unresolvable" });
    }
  }
  return { facts: [...facts.values()], walkedCommits: walked, fallbackQueries, historyComplete: sawRoot };
}
