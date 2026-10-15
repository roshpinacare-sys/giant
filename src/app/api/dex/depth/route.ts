// GET /api/dex/depth?pair= · ספר-הזמנות
// חוק-אמת: זוג-יליד (SAOS/USDS) → עומק-נגזר-מהרזרבות-האמת (פונקציית-מחיר-AMM מדויקת).
//           זוג-עזר → ספר-הזמנות-אמת-מ-Binance (מיקום-ציבורי-חי).
//           אין-עומק-מדומה. אם-ההזנה-נופלת — מודים-בזה-בכנות.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { ammQuote } from "@/lib/dex-math";
import { binanceDepth, binanceSymbolFor } from "@/lib/market-feed";
import type { DepthLevel } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

// סולם-גדלים לדימות-עומק: כמה-עולה-להחליף-X דרך-הבריכה-האמיתית
const SIZES_USDS = [50, 150, 400, 1_000, 2_500, 6_000, 15_000];
const SIZES_BASE = [25, 80, 220, 600, 1_600, 4_000, 10_000];

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const pairId = req.nextUrl.searchParams.get("pair") ?? "";
    const pair = await db.dexPair.findUnique({ where: { id: pairId } });
    if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });

    // --- זוג-עזר: ספר-הזמנות-אמת מ-Binance ---
    if (!pair.isNative) {
      const symbol = binanceSymbolFor(pair.base);
      const book = symbol ? await binanceDepth(symbol, 20) : null;
      if (book) {
        return NextResponse.json({
          pairId: pair.id,
          mid: book.mid,
          bids: book.bids,
          asks: book.asks,
          refOnly: false,
          source: "binance",
        });
      }
      // ההזנה-נפלה — כנות-מלאה
      return NextResponse.json({
        pairId: pair.id,
        mid: pair.price,
        bids: [],
        asks: [],
        refOnly: true,
        source: "binance-down",
      });
    }

    // --- זוג-יליד: עומק-AMM מהרזרבות-האמת ---
    if (pair.reserveBase <= 0 || pair.reserveQuote <= 0) {
      return NextResponse.json({
        pairId: pair.id,
        mid: pair.price,
        bids: [],
        asks: [],
        refOnly: true,
        source: "giant-amm",
      });
    }

    const reserves = { base: pair.reserveBase, quote: pair.reserveQuote };
    const feeBps = pair.feeBps;

    // asks: קונים-SAOS עם-USDS (USDS-נכנס, SAOS-יוצא) — מחיר-אפקטיבי-עולה
    const asks: DepthLevel[] = [];
    let cum = 0;
    for (const usdsIn of SIZES_USDS) {
      const q = ammQuote(reserves, "BUY", usdsIn, feeBps);
      if (!Number.isFinite(q.effectivePrice) || q.effectivePrice <= 0) continue;
      cum += usdsIn;
      asks.push({ price: q.effectivePrice, amount: q.outAmount, total: cum });
    }
    // bids: מוכרים-SAOS (SAOS-נכנס, USDS-יוצא) — מחיר-אפקטיבי-יורד
    const bids: DepthLevel[] = [];
    cum = 0;
    for (const baseIn of SIZES_BASE) {
      const q = ammQuote(reserves, "SELL", baseIn, feeBps);
      if (!Number.isFinite(q.effectivePrice) || q.effectivePrice <= 0) continue;
      const notional = q.outAmount;
      cum += notional;
      bids.push({ price: q.effectivePrice, amount: baseIn, total: cum });
    }

    return NextResponse.json({
      pairId: pair.id,
      mid: pair.price,
      bids,
      asks,
      refOnly: false,
      source: "giant-amm",
    });
  } catch (err) {
    console.error("[api/dex/depth]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-ספר-ההזמנות" }, { status: 500 });
  }
}
