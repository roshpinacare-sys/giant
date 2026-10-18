import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import fsp from "fs/promises";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ═══ לב-ריבוני · גל-92 · agent-2 ═══
 * מקור-אמת-כפול: הספר-החי (mini-service על עץ-ה-giant, seq 246K+) והפעימה-הקנונית (ריפו fleet-economy).
 * עד-היום הקוקפיט הציג את עותק-ה-audit (ספר-boot שריד) — הלב החי האמיתי לא נראה לבעלים. זה נסגר כאן.
 * כספת-steem: מטא-דאטה בלבד (pushed_at · size · דגלי-קיום · CI) — אפס תוכן-סודות בתגובה.
 * כישלון = null כנה. אף מספר מזויף. */

const BOOK_LIVE = "/home/z/my-project/mini-services/fleet-economy/state";
const AUDIT = "/home/z/audit";
const BEAT_ROOT = `${AUDIT}/fleet-economy`;
const COORD = "/home/z/coord-work";

let __cache: { at: number; data: unknown } | null = null;
let __steemCache: { at: number; data: unknown } | null = null;

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ספר-החי — קריאה בטוחה בלבד: snapshot (קובץ-שלם קטן) + stat של הפנקס. אפס כתיבה, אפס קריאת-50MB. */
function liveBook() {
  const snap = readJson(`${BOOK_LIVE}/snapshot.json`);
  if (!snap) return null;
  let ledger: { size: number; mtime: string } | null = null;
  try {
    const st = fs.statSync(`${BOOK_LIVE}/ledger.jsonl`);
    ledger = { size: st.size, mtime: st.mtime.toISOString() };
  } catch {}
  const balances = (snap.balances ?? {}) as Record<string, Record<string, number>>;
  const byKind = (snap.byKind ?? {}) as Record<string, number>;
  const topKinds = Object.entries(byKind)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => ({ kind: k, count: v }));
  return {
    seq: typeof snap.seq === "number" ? snap.seq : null,
    savedAt: typeof snap.savedAt === "number" ? new Date(snap.savedAt).toISOString() : null,
    version: snap.v ?? null,
    ledger,
    treasury: {
      usds: balances.treasury?.usds ?? null,
      saos: balances.treasury?.saos ?? null,
    },
    pool: {
      usds: balances.pool?.usds ?? null,
      saos: balances.pool?.saos ?? null,
    },
    topKinds,
    rejected: typeof snap.rejected === "number" ? snap.rejected : null,
    errors: typeof snap.errors === "number" ? snap.errors : null,
  };
}

/* פעימת-ה-audit (הקנונית מהריפו-הנפרד) — הטלמטריה הקיימת */
function beatTelemetry() {
  const status = readJson(`${AUDIT}/economy-beat-service-status.json`);
  if (!status) return null;
  return {
    startedAt: status.startedAt ?? null,
    beatCount: typeof status.beatCount === "number" ? status.beatCount : null,
    running: status.running === true,
    lastRc: typeof status.lastRc === "number" ? status.lastRc : null,
    nextRunAt: status.nextRunAt ?? null,
    summary: Array.isArray(status.lastSummary) ? (status.lastSummary as string[]).slice(0, 5) : [],
  };
}

/* git מקומי — מדידת-האיטום-האחרון של כל עותק-קנוני */
async function gitOne(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", cwd, ...args], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function repoSync() {
  const [giantTip, giantHead, beatTip, coordTip] = await Promise.all([
    gitOne("/home/z/my-project", ["rev-parse", "--short", "origin/main"]),
    gitOne("/home/z/my-project", ["log", "-1", "--format=%h|%cI|%s"]),
    gitOne(BEAT_ROOT, ["log", "-1", "--format=%h|%cI|%s"]),
    gitOne(COORD, ["log", "-1", "--format=%h|%cI|%s"]),
  ]);
  const parse = (s: string | null) => {
    if (!s) return null;
    const [sha, date, ...rest] = s.split("|");
    return { sha, date, subject: rest.join("|").slice(0, 90) };
  };
  return {
    giant: { canonicalTip: giantTip, localHead: parse(giantHead) },
    fleetEconomy: { localHead: parse(beatTip) },
    coordination: { localHead: parse(coordTip) },
  };
}

/* כספת-steem — GitHub API, מטא-דאטה בלבד. קיום-תיקיות-סודות מדווח כדגל-בוליאני, לעולם לא תוכן. */
async function steemVault() {
  if (__steemCache && Date.now() - __steemCache.at < 10 * 60_000) {
    return __steemCache.data as Record<string, unknown> | null;
  }
  try {
    const pat = fs.readFileSync("/home/z/my-project/upload/pat.env", "utf8").trim();
    const headers: Record<string, string> = {
      "User-Agent": "saos-heartbeat",
      Accept: "application/vnd.github+json",
      ...(pat ? { Authorization: `Bearer ${pat}` } : {}),
    };
    const repoRes = await fetch("https://api.github.com/repos/roshpinacare-sys/steem", {
      headers,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!repoRes.ok) {
      __steemCache = { at: Date.now(), data: null };
      return null;
    }
    const repo = (await repoRes.json()) as { pushed_at?: string; size?: number; default_branch?: string };
    const branch = repo.default_branch ?? "saos-cockpit";
    const treeRes = await fetch(`https://api.github.com/repos/roshpinacare-sys/steem/contents?ref=${branch}`, {
      headers,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    let hasSecrets = false;
    let hasAgent = false;
    let hasRecovery = false;
    let hasColdStart = false;
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as Array<{ name: string; type: string }>;
      hasSecrets = tree.some((e) => e.name === ".secrets" && e.type === "dir");
      hasAgent = tree.some((e) => e.name === "agent" && e.type === "dir");
      hasRecovery = tree.some((e) => e.name === "recovery" && e.type === "dir");
      hasColdStart = tree.some((e) => e.name === "AGENT-BRIEFING.md" || e.name === "AGENTS.md");
    }
    const runsRes = await fetch("https://api.github.com/repos/roshpinacare-sys/steem/actions/runs?per_page=5", {
      headers,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    let runs: Array<{ name: string; conclusion: string | null; createdAt: string }> = [];
    if (runsRes.ok) {
      const rj = (await runsRes.json()) as {
        workflow_runs?: Array<{ name: string; conclusion: string | null; created_at: string }>;
      };
      runs = (rj.workflow_runs ?? []).slice(0, 5).map((r) => ({
        name: r.name,
        conclusion: r.conclusion,
        createdAt: r.created_at,
      }));
    }
    const data = {
      pushedAt: repo.pushed_at ?? null,
      sizeKb: typeof repo.size === "number" ? repo.size : null,
      branch,
      flags: { hasSecrets, hasAgent, hasRecovery, hasColdStart },
      runs,
    };
    __steemCache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

/* ארסנל-ההישרדות — לכל כלי: קיום + עדכניות (האוטונומיה רואה את הכלים שלה חיים) */
async function arsenal() {
  const tools: Array<{ id: string; path: string; note: string }> = [
    { id: "restore-lane-a", path: `${COORD}/restore-lane-a.sh`, note: "שחזור-אחוזה-בפקודה-אחת" },
    { id: "run-economy-beat", path: `${BEAT_ROOT}/run-economy-beat.mjs`, note: "הפעימה-הקנונית (חוק-מירוץ a3d73fa)" },
    { id: "economy-beat-host", path: `${BEAT_ROOT}/bootstrap/economy-beat-host.mjs`, note: "מארח-הפעימה (child-of-house)" },
    { id: "sovereign-builder", path: `${BEAT_ROOT}/bootstrap/sovereign-builder/host.mjs`, note: "מארח-הבנאי" },
    { id: "supervise-economy", path: `${BEAT_ROOT}/supervise-economy.sh`, note: "השגחה-מקומית" },
  ];
  return Promise.all(
    tools.map(async (t) => {
      try {
        const st = await fsp.stat(t.path);
        return { ...t, exists: true, mtime: st.mtime.toISOString(), size: st.size };
      } catch {
        return { ...t, exists: false, mtime: null, size: null };
      }
    }),
  );
}

export async function GET() {
  try {
    if (__cache && Date.now() - __cache.at < 30_000) {
      return NextResponse.json(__cache.data, { headers: { "Cache-Control": "no-store" } });
    }
    const [repo, vault, tools, localBehind] = await Promise.all([
      repoSync(),
      steemVault(),
      arsenal(),
      // דגל-כנות: כמה קומיטים הקנוני מקדים את עץ-ה-giant המקומי (מדידה-זולה)
      (async () => {
        try {
          const { stdout } = await exec(
            "git",
            ["-C", "/home/z/my-project", "rev-list", "--count", "HEAD..origin/main"],
            { timeout: 5000 },
          );
          return Number(stdout.trim()) || 0;
        } catch {
          return null;
        }
      })(),
    ]);
    const data = {
      at: new Date().toISOString(),
      liveBook: liveBook(),
      beat: beatTelemetry(),
      repo,
      vault,
      tools,
      integrity: {
        localBehindCanonical: localBehind,
        note:
          localBehind && localBehind > 0
            ? "עץ-ה-giant המקומי מאחורי הקנוני (קומיטי-vault-seal של עמיתים) — החומר החי נאטם לגיט בסנפשוט גל-92"
            : "עץ-מקומי זהה-לקנוני",
      },
      safety: "מטא-דאטה בלבד · אפס תוכן-סודות · אפס כתיבה לעצים-חיים",
    };
    __cache = { at: Date.now(), data };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { at: new Date().toISOString(), error: e instanceof Error ? e.message : "שגיאת-לב" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
