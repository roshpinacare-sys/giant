// POST /api/dex/quote · הצעת-מחיר AMM {pairId, side, amountIn, slippagePct?}
import { NextRequest, NextResponse } from "next/server";
import { ensureEngine } from "@/lib/dex-engine";
import { buildQuote } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureEngine();
    const body = (await req.json()) as {
      pairId?: string;
      side?: string;
      amountIn?: number;
      slippagePct?: number;
    };
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "פרמטרים-חסרים" }, { status: 400 });
    }
    const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));
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
