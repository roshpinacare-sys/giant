/**
 * /api/public/v1/orders — המסחר-הציבורי-האמיתי (מפתח-API חובה)
 *  GET    — פקודות-המפתח-שלי (status=OPEN|FILLED|CANCELLED|all)
 *  POST   — הצבת-פקודה {type:"market"|"limit", pairId, side, amountIn, limitPrice?, slippagePct?}
 *  DELETE — ביטול {id} (רק-פקודה-של-החשבון-שלי)
 * חוקי-אמת:
 *  · כל-פקודה רצה-דרך-אותו-מנוע-אמת של-הבעלים-והצי (executeSwap/placeLimitOrder) — אפס-מסלול-צד.
 *  · המסחר-מהחשבון-של-המפתח-בלבד (API:<prefix>) — אי-אפשר-לגעת-בכסף-של-אחר.
 *  · מקור-הרישום בלדג'ר: source="API", sourceAgent=prefix — כל-פעולה-חוץ-חתומה.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey, KEY_ACCOUNT_PREFIX } from "@/lib/public-api";
import { ensureEngine } from "@/lib/dex-engine";
import { cancelLimitOrder, listOrders, placeLimitOrder } from "@/lib/dex-orders";
import { executeSwap } from "@/lib/dex-server";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

function deny(auth: Extract<Awaited<ReturnType<typeof authenticateApiKey>>, { ok: false }>) {
  return NextResponse.json(
    { ok: false, error: auth.error },
    { status: auth.status, headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return deny(auth);
  try {
    await ensureEngine();
    const status = req.nextUrl.searchParams.get("status") ?? "all";
    const rows = await listOrders(auth.key.account, 200); // רק-החשבון-שלי — מה-DB-עצמו
    const mine = rows.filter((o) => (status === "all" ? true : o.status === status));
    const pair = await db.dexPair.findFirst({ where: { isNative: true } });
    return NextResponse.json(
      {
        ok: true,
        orders: mine,
        count: mine.length,
        market: pair ? { pairId: pair.id, base: pair.base, quote: pair.quote, price: pair.price } : null,
      },
      { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/public/v1/orders GET]", err);
    return NextResponse.json({ ok: false, error: "כשל-רישום-הפקודות" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return deny(auth);
  try {
    await ensureEngine();
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      pairId?: string;
      side?: string;
      amountIn?: number;
      limitPrice?: number;
      slippagePct?: number;
    };
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json(
        { ok: false, error: "פרמטרים-חסרים: pairId + side (BUY|SELL)" },
        { status: 400, headers: auth.rateHeaders },
      );
    }
    const side = body.side as TradeSide;
    const amountIn = Number(body.amountIn ?? 0);
    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      return NextResponse.json(
        { ok: false, error: "amountIn חייב-להיות-מספר-חיובי" },
        { status: 400, headers: auth.rateHeaders },
      );
    }
    const account = `${KEY_ACCOUNT_PREFIX}${auth.key.prefix}`;
    const sourceAgent = `${auth.key.label} (${auth.key.prefix})`;

    if (body.type === "market" || body.type === undefined) {
      const slippage = Math.min(50, Math.max(0.1, Number(body.slippagePct ?? 0.5)));
      const result = await executeSwap({
        pairId: body.pairId,
        side,
        amountIn,
        slippagePct: slippage,
        source: "API",
        account,
        agentId: sourceAgent,
      });
      if ("error" in result) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: result.status, headers: auth.rateHeaders },
        );
      }
      return NextResponse.json(
        {
          ok: true,
          type: "market",
          trade: result.trade,
          quote: result.quote,
          newPrice: result.newPrice,
          account,
        },
        { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
      );
    }

    if (body.type === "limit") {
      const res = await placeLimitOrder({
        pairId: body.pairId,
        side,
        limitPrice: Number(body.limitPrice),
        amountIn,
        account,
        source: "API",
        agentId: sourceAgent,
      });
      if ("error" in res) {
        return NextResponse.json(
          { ok: false, error: res.error },
          { status: res.status, headers: auth.rateHeaders },
        );
      }
      return NextResponse.json(
        { ok: true, type: "limit", order: res.order, immediateFill: res.immediateFill, account },
        { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: false, error: "type חייב-להיות market או limit" },
      { status: 400, headers: auth.rateHeaders },
    );
  } catch (err) {
    console.error("[api/public/v1/orders POST]", err);
    return NextResponse.json({ ok: false, error: "כשל-ביצוע-הפקודה" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return deny(auth);
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { ok: false, error: "חסר-id-הפקודה" },
        { status: 400, headers: auth.rateHeaders },
      );
    }
    // חוק-בעלות: מותר-לבטל-רק-פקודה-של-החשבון-שלי
    const order = await db.dexOrder.findUnique({ where: { id: body.id } });
    if (!order || order.account !== auth.key.account) {
      return NextResponse.json(
        { ok: false, error: "פקודה-לא-נמצאה-או-שאינה-שלך" },
        { status: 404, headers: auth.rateHeaders },
      );
    }
    const res = await cancelLimitOrder(body.id, auth.key.account);
    if ("error" in res) {
      return NextResponse.json(
        { ok: false, error: res.error },
        { status: res.status, headers: auth.rateHeaders },
      );
    }
    return NextResponse.json(
      { ok: true, cancelled: body.id },
      { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/public/v1/orders DELETE]", err);
    return NextResponse.json({ ok: false, error: "כשל-ביטול-הפקודה" }, { status: 500 });
  }
}
