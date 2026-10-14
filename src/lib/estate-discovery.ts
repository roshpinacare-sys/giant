// estate-discovery · גילוי-אמת של כל-תיקיות-הגיט בדיסק + מטא-גיט-חי לכל-אחת
// חוק-אמת: אין-רשימה-מקודדת-של-המאגרים — סריקה-אמיתית-של-השורשים בכל-קריאה.
// הבעלים (trace 1a13ca3f1160b6d1): "מחברים את הריבונות להפעלה מלאה מכל תיקיות הגיט".

import { readdir } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const ESTATE_ROOT = "/home/z/my-project";
export const GENERATION_ROOTS = [
  { root: ESTATE_ROOT, generation: "system" as const, depth: 0 },
  { root: path.join(ESTATE_ROOT, "t36"), generation: "live" as const, depth: 1 },
  { root: path.join(ESTATE_ROOT, "t35"), generation: "archive" as const, depth: 1 },
];

export interface DiscoveredRepo {
  dir: string;
  relName: string;
  generation: "system" | "live" | "archive";
}

/** סריקה-אמיתית: כל-תיקייה-עם .git תחת-השורשים המוכרים */
export async function discoverGitRepos(): Promise<DiscoveredRepo[]> {
  const found: DiscoveredRepo[] = [];
  for (const { root, generation } of GENERATION_ROOTS) {
    if (generation === "system") {
      // המערכת-עצמה: ריפו-אחד בשורש
      try {
        await readdir(path.join(root, ".git"));
        found.push({ dir: root, relName: ".", generation });
      } catch {
        // אין-גיט-בשורש — מדווחים-בכנות-בהמשך
      }
      continue;
    }
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue; // הדור-לא-קיים-בדיסק — כנות
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      try {
        await readdir(path.join(dir, ".git"));
        found.push({ dir, relName: e.name, generation });
      } catch {
        // לא-ריפו
      }
    }
  }
  return found;
}

export interface GitAuthorCount {
  name: string;
  commits: number;
}

export interface GitMeta {
  remote: string | null;
  branch: string | null;
  headHash: string | null;
  headShort: string | null;
  headSubject: string | null;
  lastCommitAt: string | null;
  commitCount: number;
  authors: GitAuthorCount[];
  authorCount: number;
  error: string | null;
}

/** מסנן-טוקנים: אף-פרטי-גישה-לא-עוזב-את-השרת */
export function redactRemote(url: string): string {
  return url
    .replace(/x-access-token:[^@]+@/g, "x-access-token:***@")
    .replace(/(https?:\/\/)[^@/\s]+@/g, "$1***@")
    .replace(/gh[pousr]_[A-Za-z0-9]+/g, "***");
}

async function git(dir: string, args: string[], timeoutMs = 8_000): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", dir, ...args], { timeout: timeoutMs });
  return stdout;
}

/** מטא-גיט-חי לריפו-אחד: remote/HEAD/ספירת-קומיטים/ספירת-מחברים-מלאה */
export async function gitMeta(dir: string): Promise<GitMeta> {
  const meta: GitMeta = {
    remote: null,
    branch: null,
    headHash: null,
    headShort: null,
    headSubject: null,
    lastCommitAt: null,
    commitCount: 0,
    authors: [],
    authorCount: 0,
    error: null,
  };
  try {
    const [remote, branch] = await Promise.all([
      git(dir, ["remote", "get-url", "origin"]).catch(() => git(dir, ["remote", "get-url", "origin"]).catch(() => "")),
      git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
    ]);
    meta.remote = remote.trim() ? redactRemote(remote.trim()) : null;
    meta.branch = branch.trim() || null;

    const [head, count, authorsRaw] = await Promise.all([
      git(dir, ["log", "-1", "--format=%H|%h|%cI|%s"]).catch(() => ""),
      git(dir, ["rev-list", "--count", "HEAD"]).catch(() => ""),
      git(dir, ["log", "--format=%an"]).catch(() => ""),
    ]);

    if (head.trim()) {
      const [hash, short, date, ...subjectParts] = head.trim().split("|");
      meta.headHash = hash || null;
      meta.headShort = short || null;
      meta.lastCommitAt = date || null;
      meta.headSubject = subjectParts.join("|").slice(0, 120) || null;
    }
    meta.commitCount = Number.parseInt(count.trim(), 10) || 0;

    const counts = new Map<string, number>();
    for (const line of authorsRaw.split("\n")) {
      const name = line.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    meta.authors = [...counts.entries()]
      .map(([name, commits]) => ({ name, commits }))
      .sort((a, b) => b.commits - a.commits);
    meta.authorCount = meta.authors.length;
  } catch (err) {
    meta.error = err instanceof Error ? err.message.slice(0, 120) : "git-failure";
  }
  return meta;
}

/* ------------------- סיווג-משפחות-הסוכנים (מגיט-אמת) ------------------- */

export type AgentFamily = "owner" | "zai" | "organ" | "automation";

const OWNER_NAMES = new Set(["roshpinacare-sys", "Z User", "z-user", "Z"]);

export function classifyAgent(name: string): AgentFamily {
  if (OWNER_NAMES.has(name) || /^Z-\d/.test(name)) return "owner";
  if (/^zai[-_]/i.test(name) || /z\.ai/i.test(name) || /^AGENT-Z/i.test(name)) return "zai";
  if (/\[bot\]$/i.test(name) || /-bot$/i.test(name) || /\bbot\b/i.test(name) || /cron/i.test(name) || /actions\[/i.test(name) || /twin|pacemaker|watchdog/i.test(name)) return "automation";
  return "organ";
}

export const FAMILY_LABEL: Record<AgentFamily, string> = {
  owner: "הבעלים",
  zai: "סוכני-Z.ai",
  organ: "איברי-הריבונות",
  automation: "אוטומציה-ובוטים",
};
