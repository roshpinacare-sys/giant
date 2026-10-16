// GET /api/sectors · שוק-הסקטורים (M-11) — זוגות + יסודות-אמת-חיים (ציבורי)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSectors, sectorFundamentals } from "@/lib/sectors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSectors();
    const bases = ["SC-CONSOLE", "SC-DOMAIN", "SC-ROSH", "SC-FLEET"];
    const pairs = await db.dexPair.findMany({
      where: { base: { in: bases } },
      orderBy: { sort: "asc" },
    });
    const fundamentals = await sectorFundamentals();
    return NextResponse.json({
      sectors: pairs.map((p) => {
        const f = fundamentals.find((x) => x.base === p.base);
        return {
          pairId: p.id,
          base: p.base,
          name: f?.name ?? p.base,
          system: f?.system ?? "",
          description: f?.description ?? "",
          price: p.price,
          change24h: p.openPrice24h > 0 ? ((p.price - p.openPrice24h) / p.openPrice24h) * 100 : 0,
          vol24h: p.vol24h,
          liquidity: p.reserveBase * p.price + p.reserveQuote,
          reserveBase: p.reserveBase,
          reserveQuote: p.reserveQuote,
          metrics: f?.metrics ?? [],
          measuredAt: f?.measuredAt ?? null,
        };
      }),
      truth: "כל-סקטור = מערכת-אמיתית · יסודות נמדדים-חי מהדיסק/DB · מחיר זז-רק-מעסקאות-AMM-אמת",
    });
  } catch (err) {
    console.error("[api/sectors]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-הסקטורים" }, { status: 500 });
  }
}
