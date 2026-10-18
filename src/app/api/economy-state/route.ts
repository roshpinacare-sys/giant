import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * מצב-ספר-הכלכלה הקנוני — קריאה-בלבד מהגיט (origin/main:state/ledger.jsonl).
 * כנות: כשל-רשת/גיט = 502 עם-הסיבה, לעולם לא seq מאולתר. micro-cache 30ש'.
 */
export const dynamic = "force-dynamic";

// G10: קלון-הקנוני-החי ב-repos/ (RECOVERY.md) — ותיקון-הצבעה-לקלון-ישן (seq-עתיק שנתגלה-מדיד)
const REPO_CANDIDATES = ["/home/z/audit/repos/fleet-economy", "/home/z/audit/fleet-economy"];
async function pickRepo(): Promise<string | null> {
  for (const c of REPO_CANDIDATES) {
    try { await exec("git", ["rev-parse", "--git-dir"], { cwd: c, timeout: 5_000 }); return c; } catch { /* next */ }
  }
  return null;
}
const TTL_MS = 30_000;

const g = globalThis as unknown as {
  __economyState?: { at: number; value: Record<string, unknown> | null };
};

export async function GET() {
  const box = (g.__economyState ??= { at: 0, value: null });
  if (box.value && Date.now() - box.at < TTL_MS) {
    return NextResponse.json(box.value);
  }
  try {
    const REPO = await pickRepo();
    if (!REPO) throw new Error("no fleet-economy clone found (repos/ וגם שורש-audit)");
    await exec("git", ["fetch", "origin", "main"], { cwd: REPO, timeout: 20_000 });
    const { stdout } = await exec(
      "sh",
      ["-c", "git show origin/main:state/ledger.jsonl | tail -n 1"],
      { cwd: REPO, timeout: 20_000 }
    );
    const last = JSON.parse(stdout.trim()) as {
      seq?: number; ts?: number; kind?: string; asset?: string; amount?: number; reason?: string;
    };
    const value = {
      ok: true as const,
      seq: last.seq ?? null,
      lastTs: last.ts ?? null,
      lastKind: last.kind ?? null,
      lastReason: typeof last.reason === "string" ? last.reason.slice(0, 120) : null,
      measuredAt: new Date().toISOString(),
    };
    box.value = value;
    box.at = Date.now();
    return NextResponse.json(value);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "economy-state-failed" },
      { status: 502 }
    );
  }
}
