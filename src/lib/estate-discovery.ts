// estate-discovery · גילוי-אמת של כל-תיקיות-הגיט בדיסק + מטא-גיט-חי לכל-אחת
// חוק-אמת: אין-רשימה-מקודדת-של-המאגרים — סריקה-אמיתית-של-השורשים בכל-קריאה.
// הבעלים (trace 1a13ca3f1160b6d1): "מחברים את הריבונות להפעלה מלאה מכל תיקיות הגיט".
//
// גל-18 · חיווט-הטופולוגיה-האמיתית: נמדד-חי-שהגילוי-הציץ-רק-אל-t35/t36-שכבר-אינם
// על-הדיסק (מחיקת-סנדבוקס-שלהם) — והמכונה-האמיתית חיה-תחת estate/ · lane/ · channels/
// · autonomy-fix. השורשים-עודכנו-למציאות; הסריקה-עצמה-נשארה-דינמית (לא-רשימת-ריפו).

import { readdir } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const ESTATE_ROOT = "/home/z/my-project";
export const ESTATE_HOME = "/home/z";

export const GENERATION_ROOTS: GenerationRoot[] = [
  { root: ESTATE_ROOT, generation: "system" as const, depth: 0 },
  { root: "/home/z/estate", generation: "live" as const, depth: 1 },      /* estate/Domain · estate/Pulse */
  { root: "/home/z/lane", generation: "live" as const, depth: 1 },         /* lane/saos-agents · Defi · Adsmarket · saos-markets */
  { root: "/home/z/channels", generation: "live" as const, depth: 1 },     /* channels/giant */
  { root: "/home/z/autonomy-fix", generation: "live" as const, depth: 0 }, /* ספר-החוקים (Autonomy) */
];

export interface GenerationRoot {
  root: string;
  generation: "system" | "live" | "archive";
  /** 0 = השורש-עצמו-ריפו; 1 = כל-בן-עם .git; 2 = גם-נכדים */
  depth: 0 | 1 | 2;
}

export interface DiscoveredRepo {
  dir: string;
  relName: string;
  generation: "system" | "live" | "archive";
}

async function hasGit(dir: string): Promise<boolean> {
  try {
    await readdir(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

/** סריקה-אמיתית: כל-תיקייה-עם .git תחת-השורשים-המוכרים — בעומק-המוכרז-לכל-שורש */
export async function discoverGitRepos(): Promise<DiscoveredRepo[]> {
  const found: DiscoveredRepo[] = [];
  for (const { root, generation, depth } of GENERATION_ROOTS) {
    if (generation === "system") {
      // המערכת-עצמה: ריפו-אחד בשורש
      if (await hasGit(root)) found.push({ dir: root, relName: ".", generation });
      continue;
    }
    if (await hasGit(root)) {
      // שורש-שהוא-בעצמו-ריפו (depth 0 — למשל autonomy-fix)
      found.push({ dir: root, relName: path.relative(ESTATE_HOME, root) || path.basename(root), generation });
      continue;
    }
    if (depth < 1) continue;
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue; // השורש-לא-קיים-בדיסק — כנות
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      if (await hasGit(dir)) {
        found.push({ dir, relName: path.relative(ESTATE_HOME, dir), generation });
        continue;
      }
      if (depth >= 2) {
        let sub;
        try {
          sub = await readdir(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const s of sub) {
          if (!s.isDirectory()) continue;
          const sdir = path.join(dir, s.name);
          if (await hasGit(sdir)) found.push({ dir: sdir, relName: path.relative(ESTATE_HOME, sdir), generation });
        }
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
  dirtyCount: number;
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
    dirtyCount: 0,
    error: null,
  };
  try {
    const [remote, branch] = await Promise.all([
      git(dir, ["remote", "get-url", "origin"]).catch(() => git(dir, ["remote", "get-url", "origin"]).catch(() => "")),
      git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
    ]);
    meta.remote = remote.trim() ? redactRemote(remote.trim()) : null;
    meta.branch = branch.trim() || null;

    // שסתום-אמת: כמה-קבצים-מוטים-בעץ-העבודה (ראיית-ריצה-כנה-למסך)
    const dirty = await git(dir, ["status", "--porcelain"]).catch(() => "");
    meta.dirtyCount = dirty.split("\n").filter((l) => l.trim()).length;

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
