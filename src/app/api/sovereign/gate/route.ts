/**
 * POST /api/sovereign/gate — the owner's gate (מפתח-מנהל → session token).
 * Mirrors FleetHQ unlock: key compared against a salted sha256 hash stored OUTSIDE
 * all repos (/home/z/.operator/config.json); never logged/echoed/persisted;
 * rate-limited 5/min per process; memory-only session token (10 min TTL).
 * Every owner write in the channel requires this gate. No agent writes in the owner's name.
 */
import { NextResponse } from "next/server";
import { checkKey, issueToken } from "@/lib/sovereign/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* per-process 5/min window (attempts counted, never stored) */
let _windowStart = Date.now();
let _attempts = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - _windowStart > 60_000) {
    _windowStart = now;
    _attempts = 0;
  }
  _attempts += 1;
  return _attempts > 5;
}

export async function POST(req: Request) {
  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    if (typeof body.key === "string") key = body.key;
  } catch {
    // fallthrough → generic failure below
  }

  if (!key || key.length > 256) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (rateLimited()) {
    return NextResponse.json({ ok: false, error: "too-many-attempts" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  const ok = await checkKey(key);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const { token, ttlMs } = issueToken();
  return NextResponse.json({ ok: true, token, ttlMs, label: "owner" }, { headers: { "cache-control": "no-store" } });
}
