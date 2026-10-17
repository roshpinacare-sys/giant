// POST /api/dex/quote · הצעת-מחיר AMM
// מצב-1 (ישן): {pairId, side, amountIn, slippagePct?} — זוג-בודד
// מצב-2 (נתב · הוראת-הבעלים "הכל נזיל"): {from, to, amountIn, slippagePct?} —
//        כל-אסימון→כל-אסימון, קפיצה-ישירה או שתיים דרך-USDS (מסלול-אמת בלבד)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { buildQuote, buildRouteQuote } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureEngine();
    const body = (await req.json()) as {
      pairId?: string;
      side?: string;
      from?: string;
      to?: string;
      amountIn?: number;
      slippagePct?: number;
    };
    const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));

    // --- מצב-נתב: from/to ---
    if (body.from || body.to) {
      const from = String(body.from ?? "").trim().toUpperCase();
      const to = String(body.to ?? "").trim().toUpperCase();
      if (!from || !to) {
        return NextResponse.json({ error: "פרמטרים-חסרים (from/to)" }, { status: 400 });
      }
      const result = await buildRouteQuote(from, to, Number(body.amountIn ?? 0), slippage);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ quote: result.quote, legs: result.legs });
    }

    // --- מצב-זוג: pairId/side ---
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "פרמטרים-חסרים" }, { status: 400 });
    }
    // חוק-אמת: הצעות-מחיר רק על זוגות-ילידים; זוגות-עזר הם מדדי-מחיר-חוץ
    const refCheck = await db.dexPair.findUnique({ where: { id: body.pairId } });
    if (refCheck && !refCheck.isNative) {
      return NextResponse.json(
        { error: `${refCheck.base} הוא מדד-מחיר-חוץ (Binance) — מסחר פתוח רק בבריכות-הילידות` },
        { status: 403 },
      );
    }
    const result = await buildQuote(body.pairId, body.side, Number(body.amountIn ?? 0), slippage);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ quote: result.quote });
  } catch (err) {
    console.error("[api/dex/quote]", err);
    return NextResponse.json({ error: "נכשלה-בניית-ההצעה" }, { status: 500 });
  }
}
