/**
 * GET /api/public/v1/markets — נתוני-שוק-ציבוריים (ללא-מפתח — כמו-בכל-בורסה)
 * זוגות-אמת מהמנוע: מחיר-חי · שינוי-24ש׳ · נזילות · ווליום.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const pairs = await db.dexPair.findMany({ orderBy: [{ isNative: "desc" }, { base: "asc" }] });
    const markets = pairs.map((p) => ({
      pairId: p.id,
      symbol: `${p.base}/${p.quote}`,
      base: p.base,
      quote: p.quote,
      chain: p.chain,
      price: p.price,
      change24hPct: p.openPrice24h > 0 ? ((p.price - p.openPrice24h) / p.openPrice24h) * 100 : null,
      high24h: p.high24h,
      low24h: p.low24h,
      vol24h: p.vol24h,
      liquidity: p.reserveBase + p.reserveQuote, // עומק-הבריכה-האמיתי (AMM x·y=k)
      native: p.isNative,
      tradable: p.isNative, // כנות: מסחר-פתוח רק על הבריכה-האמיתית; העזרים מדדי-Binance
    }));
    return NextResponse.json(
      {
        ok: true,
        version: "v1",
        markets,
        count: markets.length,
        engine: "AMM x·y=k · fee 30bps · tick 8s",
        docs: "מסך-API בממשק המאוחד",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/public/v1/markets]", err);
    return NextResponse.json({ ok: false, error: "כשל-מדידת-השוק" }, { status: 500 });
  }
}
