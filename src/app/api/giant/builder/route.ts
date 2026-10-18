// GET /api/giant/builder — משטח-המגע של הבנאי-הריבוני (גל-18)
// ═══════════════════════════════════════════════════════════════════════════
// חוק-האם: git הוא שכבת-ההישרדות-היחידה. הבנאי חי בריפו fleet-economy
// (bootstrap/sovereign-builder) — פס-הבניה של הצי (observe→think→act→seal).
// מקור-ראשון: worktree מקומי (תמיד-טרי — המנוע-עצמו עושה pull --rebase כל-10דק').
// מקור-שני: git show origin/main (אחרי-fetch קל). מקור-שלישי: raw.githubusercontent.
// אפס-ירוק-מזויף: כשל = כנה עם סיבה מדודה.
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = "/home/z/work/fleet-economy";
const STATE_REL = "bootstrap/sovereign-builder/state";
const RAW_BASE =
  "https://raw.githubusercontent.com/roshpinacare-sys/fleet-economy/main/" + STATE_REL;

interface CacheEntry {
  at: number;
  data: BuilderPayload;
}
let cache: CacheEntry | null = null;
const CACHE_MS = 30_000;

export interface BuilderBacklogItem {
  kind?: string;
  title?: string;
  detail?: string;
  tool?: string;
  at?: string;
  by?: string;
}

export interface GrowthLogRow extends Record<string, unknown> {
  at?: string;
}

export interface BuilderPayload {
  ok: boolean;
  note?: string;
  source: "worktree" | "origin-main" | "raw" | "none";
  state: {
    schema?: string;
    createdAt?: string;
    updatedAt?: string;
    acts?: unknown;
    metrics?: unknown;
    backlog: BuilderBacklogItem[];
    [k: string]: unknown;
  } | null;
  growth: GrowthLogRow[];
  lastCommit: { sha: string; at: string; message: string } | null;
  fetchedAt: string;
}

function git(dir: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: dir, timeout: 12_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve({ ok: !err, out: ((stdout || "") + (stderr || "")).trim() })
    );
  });
}

function parseJsonl(text: string): GrowthLogRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as GrowthLogRow;
      } catch {
        return { PARSE_ERROR: true, raw: l.slice(0, 120) } as GrowthLogRow;
      }
    });
}

async function readSource(
  file: string
): Promise<{ text: string | null; source: BuilderPayload["source"] }> {
  // 1) worktree — הטרי ביותר (המנוע מריץ pull --rebase כל סבב-אטימה)
  try {
    return { text: await readFile(join(REPO, STATE_REL, file), "utf8"), source: "worktree" };
  } catch {
    /* נופל-למקור-הבא */
  }
  // 2) origin/main מקומי (אחרי-fetch קל)
  await git(REPO, ["fetch", "origin", "main"]).catch(() => null);
  const shown = await git(REPO, ["show", `origin/main:${STATE_REL}/${file}`]);
  if (shown.ok) return { text: shown.out, source: "origin-main" };
  // 3) raw CDN (גיבוי-חוץ)
  try {
    const res = await fetch(`${RAW_BASE}/${file}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) return { text: await res.text(), source: "raw" };
  } catch {
    /* כנה */
  }
  return { text: null, source: "none" };
}

async function lastBuilderCommit(): Promise<BuilderPayload["lastCommit"]> {
  const r = await git(REPO, [
    "log",
    "-3",
    "--format=%h%x1f%cI%x1f%s",
    "--",
    "bootstrap/sovereign-builder",
  ]);
  if (!r.ok) return null;
  const line = r.out.split("\n")[0];
  if (!line) return null;
  const [sha, at, ...msg] = line.split("\x1f");
  return { sha: sha ?? "", at: at ?? "", message: (msg ?? []).join("│") };
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data);
  }
  const [stateSrc, growthSrc, lastCommit] = await Promise.all([
    readSource("builder-state.json"),
    readSource("growth-log.jsonl"),
    lastBuilderCommit(),
  ]);

  let state: BuilderPayload["state"] = null;
  if (stateSrc.text) {
    try {
      const parsed = JSON.parse(stateSrc.text) as Record<string, unknown>;
      const backlogRaw = Array.isArray(parsed.backlog) ? parsed.backlog : [];
      state = {
        schema: typeof parsed.schema === "string" ? parsed.schema : undefined,
        createdAt:
          typeof parsed.createdAt === "string" ? parsed.createdAt : undefined,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
        acts: parsed.acts,
        metrics: parsed.metrics,
        backlog: backlogRaw.slice(-14) as BuilderBacklogItem[],
        ...parsed,
      };
    } catch {
      /* כנה — JSON פגום */
    }
  }

  const growth = growthSrc.text ? parseJsonl(growthSrc.text).slice(-40) : [];

  const ok = state !== null;
  const payload: BuilderPayload = {
    ok,
    note: ok
      ? undefined
      : "הבנאי-הריבוני לא-נמצא באף-מקור (worktree · origin/main · raw) — כנה, אפס-ירוק-מזויף",
    source: ok ? stateSrc.source : "none",
    state,
    growth,
    lastCommit,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return NextResponse.json(payload);
}
