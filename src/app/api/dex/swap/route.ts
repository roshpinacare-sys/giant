// POST /api/dex/swap · ביצוע-החלפה אמיתית
// מצב-1 (ישן): {pairId, side, amountIn, minOut?}
// מצב-2 (נתב · הוראת-הבעלים "הכל נזיל"): {from, to, amountIn} —
//        כל-אסימון→כל-אסימון דרך-ה-USDS; כל-קפיצה = executeSwap אמת (לדג'ר-אמת).
// חוק-שער: המסחר מזיז-כסף-אמת מארנק-הבעלים — חייב-אימות-headcorner (401 בלעדיו).
import { NextRequest, NextResponse } from "next/server";
import { ensureEngine } from "@/lib/dex-engine";
import { executeSwap, executeRouteSwap } from "@/lib/dex-server";
import { isOwnerReq } from "@/lib/sovereign-auth";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "מסחר-בארנק-הבעלים דורש-אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    await ensureEngine();
    const body = (await req.json()) as {
      pairId?: string;
      side?: string;
      from?: string;
      to?: string;
      amountIn?: number;
      minOut?: number;
      slippagePct?: number;
    };
    const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));
    const amountIn = Number(body.amountIn ?? 0);
    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      return NextResponse.json({ error: "סכום-לא-חוקי" }, { status: 400 });
    }

    // --- מצב-נתב: from/to ---
    if (body.from || body.to) {
      const from = String(body.from ?? "").trim().toUpperCase();
      const to = String(body.to ?? "").trim().toUpperCase();
      if (!from || !to) {
        return NextResponse.json({ error: "פרמטרים-חסרים (from/to)" }, { status: 400 });
      }
      const result = await executeRouteSwap({
        from,
        to,
        amountIn,
        slippagePct: slippage,
        source: "USER",
        account: "OWNER",
      });
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      const out = result.quote.outAmount;
      if (Number.isFinite(body.minOut) && (body.minOut ?? 0) > 0 && out < (body.minOut ?? 0)) {
        return NextResponse.json(
          { error: "עברת-סף-החלקה (המסלול בוצע-חלקית — הביניים בארנקך, כנה)", partial: true },
          { status: 409 },
        );
      }
      return NextResponse.json({
        trades: result.trades,
        legs: result.legs,
        route: result.quote.route,
        quote: result.quote,
        newPrice: result.newPrice,
      });
    }

    // --- מצב-זוג: pairId/side ---
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "פרמטרים-חסרים" }, { status: 400 });
    }
    const side = body.side as TradeSide;
    const result = await executeSwap({
      pairId: body.pairId,
      side,
      amountIn,
      slippagePct: slippage,
      source: "USER",
      account: "OWNER",
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (Number.isFinite(body.minOut) && (body.minOut ?? 0) > 0 && result.quote.outAmount < (body.minOut ?? 0)) {
      return NextResponse.json({ error: "עברת-סף-החלקה — ההחלפה-בוטלה" }, { status: 409 });
    }

    return NextResponse.json({
      trade: result.trade,
      quote: result.quote,
      newPrice: result.newPrice,
    });
  } catch (err) {
    console.error("[api/dex/swap]", err);
    return NextResponse.json({ error: "נכשל-ביצוע-ההחלפה" }, { status: 500 });
  }
}
