// GET /api/dex/trades?pair=&limit= · סרט-עסקאות חי
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const pairId = req.nextUrl.searchParams.get("pair") ?? "";
    const limit = Math.min(120, Math.max(10, Number(req.nextUrl.searchParams.get("limit") ?? 40)));
    const pair = await db.dexPair.findUnique({ where: { id: pairId } });
    if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });

    const trades = await db.dexTrade.findMany({
      where: { pairId: pair.id },
      orderBy: { t: "desc" },
      take: limit,
    });
    return NextResponse.json({
      trades: trades.map((t) => ({
        id: t.id,
        side: t.side,
        price: t.price,
        amount: t.amount,
        total: t.total,
        source: t.source,
        t: t.t.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/dex/trades]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-העסקאות" }, { status: 500 });
  }
}
