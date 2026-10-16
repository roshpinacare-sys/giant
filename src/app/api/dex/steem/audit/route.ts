// GET /api/dex/steem/audit · אמת-הכסף של החשבון-הריבוני (קריאה-פתוחה · נתוני-שרשרת)
// תשובה-לשאלת-הבעלים "איפה הכסף": יתרות-אמת (נזיל/תחום/SP) + פיצול-ווש מזרימה-אמת
// + פסק-כנה (מרוויחים/מפסידים/אפס). אפס-מספרים-מצוירים: מהשרשרת או null.
import { NextResponse } from "next/server";
import { steemAudit } from "@/lib/steem-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { audit, building } = await steemAudit();
    return NextResponse.json(
      { ok: true, building, audit },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/dex/steem/audit]", err);
    return NextResponse.json({ ok: false, error: "כשל-אמת-הכסף" }, { status: 500 });
  }
}
