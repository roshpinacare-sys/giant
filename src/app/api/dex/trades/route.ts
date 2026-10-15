// GET /api/dex/trades?pair=&limit= · סרט-עסקאות חי
// חוק-אמת: זוג-יליד → עסקאות-הבורסה-שלנו מה-DB (בעלים + הצי).
//           זוג-עזר → סרט-העסקאות-הציבורי-האמת-מ-Binance. אין-עסקה-מדומה.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { binancePublicTrades, binanceSymbolFor } from "@/lib/market-feed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const pairId = req.nextUrl.searchParams.get("pair") ?? "";
    const limit = Math.min(120, Math.max(10, Number(req.nextUrl.searchParams.get("limit") ?? 40)));
    const pair = await db.dexPair.findUnique({ where: { id: pairId } });
    if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });

    // --- זוג-עזר: הסרט-הציבורי-האמת מ-Binance ---
    if (!pair.isNative) {
      const symbol = binanceSymbolFor(pair.base);
      const trades = symbol ? await binancePublicTrades(symbol, limit) : null;
      if (trades) {
        return NextResponse.json({
          trades: trades.map((t) => ({
            id: t.id,
            side: t.side,
            price: t.price,
            amount: t.amount,
            total: t.total,
            source: "binance",
            t: t.t,
          })),
          source: "binance",
        });
      }
      // ההזנה-נפלה — כנות: סרט-ריק-מוצהר
      return NextResponse.json({ trades: [], source: "binance-down" });
    }

    const trades = await db.dexTrade.findMany({
      where: { pairId: pair.id },
      orderBy: { t: "desc" },
      take: limit,
    });
    return NextResponse.json({
      trades: trades.map((t) => ({
        id: t.id,
        side: t.side,
        price: t.price,
        amount: t.amount,
        total: t.total,
        source: t.source,
        t: t.t.toISOString(),
      })),
      source: "giant-amm",
    });
  } catch (err) {
    console.error("[api/dex/trades]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-העסקאות" }, { status: 500 });
  }
}
