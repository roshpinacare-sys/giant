import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const dynamic = "force-dynamic";

/**
 * מצב-ספר-הכלכלה-החי (git-first) — הקנון: ענף-ה-origin של fleet-economy
 * =====================================================================
 * מדידה-מהמקור-הקנוני: `git show origin/main:state/ledger.jsonl` במחסן-הכלכלה
 * (חוק-git-first: מקומי-מפוצל = נופל-בכנות ל-origin). טעינת-זנב-בלבד —
 * הספר-ענק, קוראים-רק-את-האירוע-האחרון. אפס-סודות, אפס-סינתזה.
 * micro-cache 15ש' כדי-לא-להעמיס-על-ה-git-בכל-פעימת-דסק.
 */

const REPO = "/home/z/audit/repos/fleet-economy";
const LEDGER = "state/ledger.jsonl";
const TTL_MS = 15_000;

const g = globalThis as unknown as {
  __economyState?: { at: number; value: Record<string, unknown> | null };
};

function readTail(lines: string): { seq: number; ts: number; kind: string; reason: string } | null {
  const arr = lines.trim().split("\n").filter(Boolean);
  for (let i = arr.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(arr[i]) as { seq?: number; ts?: number; kind?: string; reason?: string };
      if (typeof e.seq === "number") {
        return { seq: e.seq, ts: e.ts ?? 0, kind: e.kind ?? "?", reason: e.reason ?? "" };
      }
    } catch {
      /* next */
    }
  }
  return null;
}

export async function GET() {
  const cached = g.__economyState;
  if (cached && Date.now() - cached.at < TTL_MS && cached.value) {
    return NextResponse.json(cached.value);
  }
  let last: { seq: number; ts: number; kind: string; reason: string } | null = null;
  let source = "origin-git";
  try {
    const out = execFileSync("git", ["-C", REPO, "show", `origin/main:${LEDGER}`], {
      maxBuffer: 256 * 1024 * 1024,
      timeout: 20_000,
    }).toString();
    last = readTail(out.slice(-400_000));
  } catch {
    /* origin failed — try local, fail honest */
  }
  if (!last) {
    try {
      if (existsSync(`${REPO}/${LEDGER}`)) {
        const out = readFileSync(`${REPO}/${LEDGER}`, "utf8");
        last = readTail(out.slice(-400_000));
        source = "local-fallback";
      }
    } catch {
      /* fail honest */
    }
  }
  if (!last) {
    return NextResponse.json({ ok: false, error: "ledger-unreadable", source }, { status: 502 });
  }
  const value = {
    ok: true,
    seq: last.seq,
    lastTs: last.ts,
    lastKind: last.kind,
    lastReason: last.reason,
    source,
    measuredAt: new Date().toISOString(),
  };
  g.__economyState = { at: Date.now(), value };
  return NextResponse.json(value);
}
