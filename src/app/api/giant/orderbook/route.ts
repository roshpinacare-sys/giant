/**
 * GET /api/giant/orderbook — ספר-הפקודות-החוץ (עומק-שוק אמיתי · BTC/USDT)
 * מאז T74: המדידה-עצמה חיה-בספרייה-המשותפת lib/giant/external-book.ts — מקור-אחד
 * (גם-מנוע-ההתאמה-הפנימי ב-/api/giant/customer-orders נזקק-למחיר-הייחוס-מאותו-מקור).
 */
import { NextResponse } from "next/server";
import { measureExternalBook, type ExternalBook } from "@/lib/giant/external-book";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const book: ExternalBook = await measureExternalBook();
  if (!book.ok) {
    return NextResponse.json(
      {
        ...book,
        error: "לא נמדד — Kraken (XBTUSDT / XXBTZUSD) ו-Binance לא ענו; אפס-ספר-מצויר (fail-honest)",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(book, { headers: { "cache-control": "no-store" } });
}
