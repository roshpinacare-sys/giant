// /api/dex/orders · פקודות-לימיט אמת על בריכת-האמת SAOS/USDS
// GET    — רשימת-הפקודות (פתוחות-ראשון) + מחיר-חי · קריאה-פתוחה (נתוני-שוק)
// POST   — הצבת-פקודה {pairId, side, limitPrice, amountIn} · שער-בעלים (הכסף-נעול!)
// DELETE — ביטול {id} עם שחרור-העיקול בשלמותו · שער-בעלים
// התאמה: בטיקר-המנוע (8 שניות) + מיידית-אם-הפקודה-ניתנת-למילוי-עכשיו.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { cancelLimitOrder, listOrders, placeLimitOrder } from "@/lib/dex-orders";
import { isOwnerReq } from "@/lib/sovereign-auth";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const [orders, pair] = await Promise.all([
      listOrders(null),
      db.dexPair.findFirst({ where: { isNative: true } }),
    ]);
    return NextResponse.json(
      {
        ok: true,
        orders,
        market: pair ? { pairId: pair.id, base: pair.base, quote: pair.quote, price: pair.price } : null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/dex/orders GET]", err);
    return NextResponse.json({ ok: false, error: "כשל-רישום-הפקודות" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "הצבת-פקודת-לימיט נועלת-כספים-אמיתיים — דורש-אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    await ensureEngine();
    const body = (await req.json()) as {
      pairId?: string;
      side?: string;
      limitPrice?: number;
      amountIn?: number;
    };
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "פרמטרים-חסרים (pairId/side)" }, { status: 400 });
    }
    const res = await placeLimitOrder({
      pairId: body.pairId,
      side: body.side as TradeSide,
      limitPrice: Number(body.limitPrice),
      amountIn: Number(body.amountIn),
      account: "OWNER",
      source: "USER",
    });
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res);
  } catch (err) {
    console.error("[api/dex/orders POST]", err);
    return NextResponse.json({ error: "כשל-הצבת-הפקודה" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "ביטול-פקודה דורש-אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "חסר-id-הפקודה" }, { status: 400 });
    const res = await cancelLimitOrder(body.id, "OWNER");
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/dex/orders DELETE]", err);
    return NextResponse.json({ error: "כשל-ביטול-הפקודה" }, { status: 500 });
  }
}
