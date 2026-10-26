// GET /api/dex/steem/market · תמונת-שוק-סטים החיה (קריאה-פתוחה · נתוני-שוק)
// השוק-הפנימי של סטים (עומק-אמת מהשרשרת) + סימני-אורקל + מצב-הצמדת-הבריכות
// שלנו + פעילות-שסתום-ההצמדה. חוק-אמת: מה שהאורקל לא רואה — לא מוצג.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { steemMarketSnapshot } from "@/lib/steem-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const snap = await steemMarketSnapshot();
    if (!snap) {
      /* fail-closed כנה: אין-תמונת-שוק (כשל-רשת-קר) — 503, לא-המצאה. wave 19.81 */
      return NextResponse.json({ error: "תמונת-שוק-סטים אינה זמינה כרגע — נסה שוב" }, { status: 503 });
    }

    // מצב-הצמדה: בריכות-הגישור מול-האורקל (מדידה-חיה, לא-טענה)
    const pairs = await db.dexPair.findMany({
      where: { isNative: true, base: { in: ["STEEM", "SBD"] }, quote: "USDS" },
      orderBy: { sort: "asc" },
    });
    const targetBy = new Map<string, number | null>([
      ["STEEM", snap?.oracle.steemUsds ?? null],
      ["SBD", snap?.oracle.sbdUsds ?? null],
    ]);
    const pools = pairs.map((p) => {
      const target = targetBy.get(p.base) ?? null;
      const devPct = target && p.price > 0 ? (p.price / target - 1) * 100 : null;
      return {
        base: p.base,
        quote: p.quote,
        pairId: p.id,
        chain: p.chain,
        price: p.price,
        target,
        devPct,
        pegged: devPct !== null && Math.abs(devPct) <= 0.75,
        reserveBase: p.reserveBase,
        reserveQuote: p.reserveQuote,
        tvlUsds: p.reserveBase * p.price + p.reserveQuote,
        vol24h: p.vol24h,
      };
    });

    const healthRow = await db.dexConfig.findUnique({ where: { key: "steemBridgeHealth" } });
    let health: unknown = null;
    try {
      health = healthRow ? JSON.parse(healthRow.value) : null;
    } catch {
      health = null;
    }

    return NextResponse.json(
      {
        ok: true,
        snapshot: snap ?? null,
        pools,
        health,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/dex/steem/market]", err);
    return NextResponse.json({ ok: false, error: "כשל-תמונת-שוק-סטים" }, { status: 500 });
  }
}
