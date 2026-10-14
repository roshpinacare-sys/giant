// GET /api/dex/depth?pair= · ספר-הזמנות סינתטי סביב המחיר-האמצעי
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import type { DepthLevel } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

function levels(mid: number, dir: 1 | -1, n: number, dailyVol: number): DepthLevel[] {
  const out: DepthLevel[] = [];
  let cum = 0;
  for (let i = 1; i <= n; i++) {
    const price = mid * (1 + dir * 0.0006 * i * (1 + Math.random() * 0.3));
    // עומק גדל עם העומק-בספר; מבוסס-נפח-יומי
    const notional = (dailyVol / 900) * (0.4 + Math.random()) * i;
    const amount = notional / price;
    cum += notional;
    out.push({ price, amount, total: cum });
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const pairId = req.nextUrl.searchParams.get("pair") ?? "";
    const pair = await db.dexPair.findUnique({ where: { id: pairId } });
    if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });
    return NextResponse.json({
      pairId: pair.id,
      mid: pair.price,
      bids: levels(pair.price, -1, 12, pair.vol24h),
      asks: levels(pair.price, 1, 12, pair.vol24h),
    });
  } catch (err) {
    console.error("[api/dex/depth]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-ספר-ההזמנות" }, { status: 500 });
  }
}
