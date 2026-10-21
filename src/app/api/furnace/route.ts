// GET /api/furnace — תנור-השוק-החריף (:3045 · market-furnace)
// ═══════════════════════════════════════════════════════════════════════════
// proxy-שרת-בלבד לשירות-התנור — הצתת-עמלות-אמת · ארביטראז' בריכה↔ספר ·
// עומק-Maker · קציר (msg-8) · סקר-מסילות-חוץ-ללא-KYC.
// כשל = כנה (אף-מספר-מזויף). אפס-קאש (מדידה-חיה).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const r = await fetch("http://127.0.0.1:3045/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    return NextResponse.json(d, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "furnace-unreachable",
        detail: String(e).slice(0, 120),
        note: "התנור-לא-נענה — כנה. שרשרת-התחייה (resurrect-fleet) תאמץ-אותו-חזרה בעלייה-הבאה.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
