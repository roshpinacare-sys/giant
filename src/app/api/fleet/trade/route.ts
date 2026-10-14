// POST /api/fleet/trade · עסקת-סוכן-צי אמיתית על ה-AMM של-SAOS/USDS
// אימות: אסימון-סוכן (SHA-256 נגזר, timing-safe) + סוכן-פעיל + יתרה-אמיתית-בלדג'ר.
// כל-עסקה נרשמת source=FLEET ולדג'ר FLEET:<agentId> — הארנה נמדדת, לא-מבוימת.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { executeSwap } from "@/lib/dex-server";
import { verifyFleetToken } from "@/lib/fleet-auth";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureEngine();
    const body = (await req.json().catch(() => ({}))) as {
      agentId?: string;
      token?: string;
      side?: string;
      amountIn?: number;
      slippagePct?: number;
    };
    const agentId = String(body.agentId ?? "").trim();
    const token = String(body.token ?? "").trim();
    const side = body.side === "SELL" ? "SELL" : "BUY";
    const amountIn = Number(body.amountIn ?? 0);

    if (!agentId || !token) {
      return NextResponse.json({ error: "נדרשים agentId + token" }, { status: 401 });
    }
    const agent = await db.fleetAgent.findUnique({ where: { agentId } });
    if (!agent || !agent.active || !verifyFleetToken(token, agent.tokenHash)) {
      return NextResponse.json({ error: "אימות-סוכן נכשל", authRequired: true }, { status: 401 });
    }
    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      return NextResponse.json({ error: "סכום-לא-חוקי" }, { status: 400 });
    }
    const pair = await db.dexPair.findFirst({ where: { isNative: true } });
    if (!pair) return NextResponse.json({ error: "אין-זוג-יליד" }, { status: 503 });

    const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));
    const result = await executeSwap({
      pairId: pair.id,
      side: side as TradeSide,
      amountIn,
      slippagePct: slippage,
      source: "FLEET",
      account: `FLEET:${agentId}`,
      agentId,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await db.fleetAgent.update({ where: { agentId }, data: { lastTradeAt: new Date() } });

    return NextResponse.json({
      ok: true,
      agentId,
      trade: result.trade,
      outAmount: result.quote.outAmount,
      effectivePrice: result.quote.effectivePrice,
      newPrice: result.newPrice,
    });
  } catch (err) {
    console.error("[api/fleet/trade]", err);
    return NextResponse.json({ error: "נכשלה-עסקת-הצי" }, { status: 500 });
  }
}

// GET /api/fleet/trade?agentId=&token= · יתרת-הסוכן (אימות-זהה)
export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const agentId = req.nextUrl.searchParams.get("agentId") ?? "";
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const agent = await db.fleetAgent.findUnique({ where: { agentId } });
    if (!agent || !agent.active || !verifyFleetToken(token, agent.tokenHash)) {
      return NextResponse.json({ error: "אימות-סוכן נכשל", authRequired: true }, { status: 401 });
    }
    const rows = await db.dexLedger.groupBy({
      by: ["token"],
      _sum: { amount: true },
      where: { account: `FLEET:${agentId}` },
    });
    const bal = Object.fromEntries(rows.map((r) => [r.token, r._sum.amount ?? 0]));
    const recent = await db.dexTrade.findMany({
      where: { source: "FLEET" },
      orderBy: { t: "desc" },
      take: 5,
    });
    return NextResponse.json({
      agentId,
      balances: bal,
      allocationUsds: agent.allocationUsds,
      recentTrades: recent.map((t) => ({ side: t.side, price: t.price, total: t.total, t: t.t.toISOString() })),
    });
  } catch (err) {
    console.error("[api/fleet/trade GET]", err);
    return NextResponse.json({ error: "נכשלה-קריאת-היתרה" }, { status: 500 });
  }
}
