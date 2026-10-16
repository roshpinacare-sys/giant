/**
 * GET /api/public/v1/ping — בדיקת-חיות-מאומתת-של-מפתח-API
 * מאשר-מפתח · מדווח מגבלת-קצב · זמן-שרת. זה-הראשון-שכל-משתמש-חוץ-מריץ.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      version: "v1",
      key: { prefix: auth.key.prefix, label: auth.key.label, account: auth.key.account },
      rateLimit: { limit: auth.rate.limit, remaining: auth.rate.remaining, resetSec: auth.rate.resetSec },
      serverTime: new Date().toISOString(),
    },
    { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
  );
}
