// GET /api/dex/candles?pair=&tf=&limit= · נרות OHLCV
// חוק-אמת: זוג-יליד (SAOS/USDS) → נרות-AMM-מה-DB (נולדו-בגנזיס, צוברים-עסקאות-אמת).
//           זוג-עזר (BTC/ETH/...) → קרניים-אמת-מ-Binance (היסטוריית-שוק-אמת).
//           אם-Binance-נופל — מחזירים-את-הנרות-המקומיים-האמת-האחרונה + דגל-כנה.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { binanceKlines, binanceSymbolFor } from "@/lib/market-feed";
import type { Timeframe } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

const TFS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const pairId = req.nextUrl.searchParams.get("pair") ?? "";
    const tfParam = req.nextUrl.searchParams.get("tf") ?? "1h";
    const limit = Math.min(500, Math.max(30, Number(req.nextUrl.searchParams.get("limit") ?? 300)));
    if (!TFS.has(tfParam)) {
      return NextResponse.json({ error: "טיים-פריים-לא-חוקי" }, { status: 400 });
    }
    const tf = tfParam as Timeframe;
    const pair = await db.dexPair.findUnique({ where: { id: pairId } });
    if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });

    // --- זוג-עזר: היסטוריית-שוק-אמת מ-Binance ---
    if (!pair.isNative) {
      const symbol = binanceSymbolFor(pair.base);
      const klines = symbol ? await binanceKlines(symbol, tf, limit) : null;
      if (klines) {
        return NextResponse.json({
          candles: klines.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })),
          tf,
          source: "binance",
        });
      }
      // ההזנה-נפלה — מציגים-את-האמת-המקומית-האחרונה-בדגל-כנה (לא-ממציאים)
    }

    const candles = await db.dexCandle.findMany({
      where: { pairId: pair.id, tf },
      orderBy: { t: "asc" },
      take: limit,
    });
    const trimmed = candles.length === limit ? candles : candles.slice(-limit);
    return NextResponse.json({
      candles: trimmed.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })),
      tf,
      source: pair.isNative ? "giant-amm" : "binance-down",
    });
  } catch (err) {
    console.error("[api/dex/candles]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-הנרות" }, { status: 500 });
  }
}
