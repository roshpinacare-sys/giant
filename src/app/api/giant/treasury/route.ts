// GET /api/giant/treasury — האוצר-החי (T77-MONEY · מנוע-הנזילות :3043)
// ═════════════════════════════════════════════════════════════════════════
// אמת-על-השרשרת מהמנוע (headcorner): שווי · ספר-SP · חריגות · קצב-רווח · תוכנית.
// fail-honest: מנוע-לא-זמין = {ok:false} כנה — אף-מספר-מזויף.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGINE = "http://127.0.0.1:3043";

async function j(path: string, timeoutMs = 20_000): Promise<any | null> {
  try {
    const r = await fetch(`${ENGINE}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null; // כנות
  }
}

export async function GET() {
  const [snap, flow, anomalies, plan, health] = await Promise.all([
    j("/snapshot", 25_000),
    j("/flow", 15_000),
    j("/anomalies", 15_000),
    j("/plan", 25_000),
    j("/health", 8_000),
  ]);

  return NextResponse.json(
    {
      ok: Boolean(health?.ok),
      engine: health ?? { ok: false },
      snapshot: snap, // null = לא-נמדד (fail-honest)
      flow: flow ?? null,
      anomalies: anomalies ?? null,
      plan: plan ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
