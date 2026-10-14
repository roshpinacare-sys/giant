// POST /api/dex/swap · ביצוע-החלפה אמיתית: {pairId, side, amountIn, minOut}
// מעדכן בריכות, רושם-עסקה, מזיז-לדג'ר-ארנק-הבעלים.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { buildQuote, ownerBalance } from "@/lib/dex-server";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureEngine();
    const body = (await req.json()) as {
      pairId?: string;
      side?: string;
      amountIn?: number;
      minOut?: number;
      slippagePct?: number;
    };
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "פרמטרים-חסרים" }, { status: 400 });
    }
    const side = body.side as TradeSide;
    const amountIn = Number(body.amountIn ?? 0);
    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      return NextResponse.json({ error: "סכום-לא-חוקי" }, { status: 400 });
    }
    const pair = await db.dexPair.findUnique({ where: { id: body.pairId } });
    if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });
    // חוק-אמת: מסחר-פתוח רק על המטבע-האמיתי. זוגות-העזר הם מדדי-מחיר-חוץ (Binance) — לא בורסה.
    if (!pair.isNative) {
      return NextResponse.json(
        { error: `${pair.base} הוא מדד-מחיר-חוץ (Binance) — מסחר פתוח רק ב-SAOS/USDS` },
        { status: 403 },
      );
    }

    const tokenIn = side === "BUY" ? pair.quote : pair.base;
    const tokenOut = side === "BUY" ? pair.base : pair.quote;

    const bal = await ownerBalance(tokenIn);
    if (bal < amountIn) {
      return NextResponse.json(
        { error: `אין-מספיק ${tokenIn} בארנק (יש ${bal.toLocaleString("he-IL")})` },
        { status: 400 },
      );
    }

    const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));
    const q = await buildQuote(pair.id, side, amountIn, slippage);
    if ("error" in q) {
      return NextResponse.json({ error: q.error }, { status: q.status });
    }
    const quote = q.quote;

    if (Number.isFinite(body.minOut) && (body.minOut ?? 0) > 0 && quote.outAmount < (body.minOut ?? 0)) {
      return NextResponse.json({ error: "עברת-סף-החלקה — ההחלפה-בוטלה" }, { status: 409 });
    }

    // ביצוע: רזרבות + מחיר + עסקה + לדג'ר
    const updated = await db.dexPair.update({
      where: { id: pair.id },
      data: {
        reserveBase: quote.reservesAfter.base,
        reserveQuote: quote.reservesAfter.quote,
        price: quote.reservesAfter.quote / quote.reservesAfter.base,
        high24h: Math.max(pair.high24h, quote.reservesAfter.quote / quote.reservesAfter.base),
        low24h: Math.min(pair.low24h, quote.reservesAfter.quote / quote.reservesAfter.base),
      },
    });
    const trade = await db.dexTrade.create({
      data: {
        pairId: pair.id,
        side,
        price: quote.effectivePrice,
        amount: side === "BUY" ? quote.outAmount : amountIn,
        total: side === "BUY" ? amountIn : quote.outAmount,
        source: "USER",
      },
    });
    await db.dexLedger.create({
      data: { account: "OWNER", token: tokenIn, amount: -amountIn, reason: `החלפה · ${side === "BUY" ? "קניית" : "מכירת"} ${tokenOut}`, ref: trade.id },
    });
    await db.dexLedger.create({
      data: { account: "OWNER", token: tokenOut, amount: quote.outAmount, reason: `החלפה · קבלת ${tokenOut}`, ref: trade.id },
    });
    await db.dexPair.update({
      where: { id: pair.id },
      data: { vol24h: { increment: amountIn } },
    });

    return NextResponse.json({
      trade: {
        id: trade.id,
        side,
        price: trade.price,
        amount: trade.amount,
        total: trade.total,
        source: "USER",
        t: trade.t.toISOString(),
      },
      quote,
      newPrice: updated.price,
    });
  } catch (err) {
    console.error("[api/dex/swap]", err);
    return NextResponse.json({ error: "נכשל-ביצוע-ההחלפה" }, { status: 500 });
  }
}
