import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * מצב-ספר-הכלכלה הקנוני — קריאה-בלבד מהגיט (origin/main:state/ledger.jsonl).
 * כנות: כשל-רשת/גיט = 502 עם-הסיבה, לעולם לא seq מאולתר. micro-cache 30ש'.
 */
export const dynamic = "force-dynamic";

const REPO = "/home/z/audit/fleet-economy";
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
