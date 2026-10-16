// /api/fleet/trade · שירות-עצמי-מלא למשתמשי-הפנים (סוכני-הצי) — גל-62
// ═════════════════════════════════════════════════════════════════════════
// דוקטרינת-הבעלים (trace 1a143782a5d9d3a1): המשתמשים-הם-פנים — הצי-והחיילים-הם
// משתמשי-הרשת כהוכחה-ומטרה. לכן כל-סוכן-מקבל-כאן יכולת-משתמש-מלאה על אותו-מנוע-אמת:
//   POST type=MARKET — החלפת-שוק (הקיימת; כעת-ממושמעת-בתקרת-קמעונאי)
//   POST type=LIMIT   — פקודת-לימיט אמת עם עיקול-לדג'ר (placeLimitOrder · account=FLEET:<id>)
//   DELETE            — ביטול-פקודה-עצמית עם שחרור-העיקול (cancelLimitOrder — בעלות-נאכפת)
//   GET               — יתרות-עצמיות · הפקודות-הפתוחות-של-עצמו · העסקאות-של-עצמו-בלבד
// אימות: אסימון-סוכן (SHA-256 נגזר, timing-safe) + סוכן-פעיל + יתרה-אמיתית-בלדג'ר.
// פרטיות-בין-משתמשי-פנים: סוכן-רואה-רק-את-שלו (תוקן-גל-62; קודם-לכן GET החזיר עסקאות-צי-כולן).
// כל-פעולה נרשמת source=FLEET · sourceAgent=<id> בלדג'ר ובעסקאות — אפס-הדמיה.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { executeSwap } from "@/lib/dex-server";
import { placeLimitOrder, cancelLimitOrder, listOrders } from "@/lib/dex-orders";
import { verifyFleetToken, FLEET_ORDER_USDS_CAP } from "@/lib/fleet-auth";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

// אימות-משותף: מחזיר-הסוכן-המאומת או-שגיאה-מוכנה
async function authAgent(agentId: string, token: string) {
  if (!agentId || !token) {
    return { error: NextResponse.json({ error: "נדרשים agentId + token" }, { status: 401 }) };
  }
  const agent = await db.fleetAgent.findUnique({ where: { agentId } });
  if (!agent || !agent.active || !verifyFleetToken(token, agent.tokenHash)) {
    return { error: NextResponse.json({ error: "אימות-סוכן נכשל", authRequired: true }, { status: 401 }) };
  }
  return { agent };
}

// תקרת-הקמעונאי: גודל-הפקודה-בשקלול-USDS (BUY: tokenIn=USDS · SELL: tokenIn=בסיס × מחיר)
function usdsWorth(side: TradeSide, amountIn: number, price: number): number {
  return side === "BUY" ? amountIn : amountIn * price;
}

export async function POST(req: NextRequest) {
  try {
    await ensureEngine();
    const body = (await req.json().catch(() => ({}))) as {
      agentId?: string;
      token?: string;
      side?: string;
      amountIn?: number;
      slippagePct?: number;
      type?: string;
      limitPrice?: number;
    };
    const agentId = String(body.agentId ?? "").trim();
    const token = String(body.token ?? "").trim();
    const side: TradeSide = body.side === "SELL" ? "SELL" : "BUY";
    const amountIn = Number(body.amountIn ?? 0);
    const type = body.type === "LIMIT" ? "LIMIT" : "MARKET";
    const limitPrice = Number(body.limitPrice ?? 0);

    const auth = await authAgent(agentId, token);
    if ("error" in auth) return auth.error;
    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      return NextResponse.json({ error: "סכום-לא-חוקי" }, { status: 400 });
    }
    if (type === "LIMIT" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
      return NextResponse.json({ error: "לפקודת-לימיט נדרש limitPrice חיובי" }, { status: 400 });
    }

    // הצי סוחר על המטבע-האמיתי — SAOS/USDS מזוהה-מפורשות (לא findFirst עמום)
    const pair = await db.dexPair.findFirst({ where: { isNative: true, base: "SAOS" } });
    if (!pair) return NextResponse.json({ error: "אין-זוג-יליד" }, { status: 503 });

    // משמעת-הקמעונאי (גל-62): גם-ה-API-העצמי-של-הסוכן-כפוף-לאותה-תקרה-כמו-הלולאה
    const worth = usdsWorth(side, amountIn, type === "LIMIT" ? limitPrice : pair.price);
    if (worth > FLEET_ORDER_USDS_CAP) {
      return NextResponse.json(
        { error: `תקרת-פקודה-לסוכן-פנים היא ${FLEET_ORDER_USDS_CAP} USDS (ביקשת בשקלול ${worth.toLocaleString("he-IL", { maximumFractionDigits: 2 })})` },
        { status: 400 },
      );
    }

    const account = `FLEET:${agentId}`;

    if (type === "LIMIT") {
      const res = await placeLimitOrder({
        pairId: pair.id,
        side,
        limitPrice,
        amountIn,
        account,
        source: "FLEET",
        agentId,
      });
      if ("error" in res) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      await db.fleetAgent.update({ where: { agentId }, data: { lastTradeAt: new Date() } });
      return NextResponse.json({
        ok: true,
        type: "LIMIT",
        agentId,
        order: res.order,
        immediateFill: res.immediateFill,
        escrowLocked: res.order.status === "OPEN",
      });
    }

    // MARKET — הנתיב-ההיסטורי (החלפת-שוק על הבריכה-החיה)
    const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));
    const result = await executeSwap({
      pairId: pair.id,
      side,
      amountIn,
      slippagePct: slippage,
      source: "FLEET",
      account,
      agentId,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await db.fleetAgent.update({ where: { agentId }, data: { lastTradeAt: new Date() } });

    return NextResponse.json({
      ok: true,
      type: "MARKET",
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

// GET /api/fleet/trade?agentId=&token= · עולמו-של-הסוכן-בלבד (פרטיות-פנימית)
export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const agentId = req.nextUrl.searchParams.get("agentId") ?? "";
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const auth = await authAgent(agentId, token);
    if ("error" in auth) return auth.error;

    const rows = await db.dexLedger.groupBy({
      by: ["token"],
      _sum: { amount: true },
      where: { account: `FLEET:${agentId}` },
    });
    const bal = Object.fromEntries(rows.map((r) => [r.token, r._sum.amount ?? 0]));

    // רק-הפקודות-שלו (פתוחות-ראשון; אף-חשבון-אחר-לא-נחשף)
    const ownOrders = await listOrders(`FLEET:${agentId}`, 30);
    // רק-העסקאות-שלו (תיקון-פרטיות-גל-62: קודם-הוחזרו-עסקאות-כל-הצי)
    const recent = await db.dexTrade.findMany({
      where: { source: "FLEET", sourceAgent: agentId },
      orderBy: { t: "desc" },
      take: 5,
    });
    return NextResponse.json({
      agentId,
      balances: bal,
      allocationUsds: auth.agent.allocationUsds,
      ownOrders,
      openOrders: ownOrders.filter((o) => o.status === "OPEN").length,
      recentTrades: recent.map((t) => ({ side: t.side, price: t.price, total: t.total, t: t.t.toISOString() })),
    });
  } catch (err) {
    console.error("[api/fleet/trade GET]", err);
    return NextResponse.json({ error: "נכשלה-קריאת-היתרה" }, { status: 500 });
  }
}

// DELETE /api/fleet/trade · ביטול-פקודה-עצמית (רק-של-עצמו — הבעלות-נאכפת-במנוע)
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { agentId?: string; token?: string; orderId?: string };
    const agentId = String(body.agentId ?? req.nextUrl.searchParams.get("agentId") ?? "").trim();
    const token = String(body.token ?? req.nextUrl.searchParams.get("token") ?? "").trim();
    const orderId = String(body.orderId ?? req.nextUrl.searchParams.get("orderId") ?? "").trim();

    const auth = await authAgent(agentId, token);
    if ("error" in auth) return auth.error;
    if (!orderId) return NextResponse.json({ error: "נדרש orderId" }, { status: 400 });

    const res = await cancelLimitOrder(orderId, `FLEET:${agentId}`);
    if ("error" in res) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    return NextResponse.json({
      ok: true,
      agentId,
      orderId,
      note: "הפקודה בוטלה · העיקול שוחרר בשלמותו לארנק-הסוכן",
    });
  } catch (err) {
    console.error("[api/fleet/trade DELETE]", err);
    return NextResponse.json({ error: "נכשל-ביטול-הפקודה" }, { status: 500 });
  }
}
