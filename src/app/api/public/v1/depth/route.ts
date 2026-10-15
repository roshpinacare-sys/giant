/**
 * GET /api/public/v1/depth?pair= — ספר-הזמנות-ציבורי (ללא-מפתח)
 * זהה-באמת ל-/api/dex/depth: זוג-יליד → עומק-AMM מהרזרבות-האמת; זוג-עזר → Binance-חי.
 * נעשה-כאן-proxy-קריאה-כדי-שלמשתמש-חוץ-יהיה-נתיב-אחיד-אחד (v1).
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") ?? "";
  const url = new URL("/api/dex/depth", req.nextUrl.origin);
  if (pair) url.searchParams.set("pair", pair);
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as unknown;
  return NextResponse.json(data, { status: res.status, headers: { "cache-control": "no-store" } });
}
