/**
 * GET /api/public/v1/candles?pair=&tf= — נרות-אמת-מעסקאות (ללא-מפתח)
 * מקור: DexCandle ב-DB — נרות שנבנו-מעסקאות-המנוע-בפועל, לא-נרות-תצוגה.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") ?? "";
  const tf = req.nextUrl.searchParams.get("tf") ?? "5m";
  const url = new URL("/api/dex/candles", req.nextUrl.origin);
  if (pair) url.searchParams.set("pair", pair);
  url.searchParams.set("tf", tf);
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as unknown;
  return NextResponse.json(data, { status: res.status, headers: { "cache-control": "no-store" } });
}
