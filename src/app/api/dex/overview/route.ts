// GET /api/dex/overview · KPIs + movers + sparks + ארנת-M-9 + מצב-מנוע
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine, engineStatus } from "@/lib/dex-engine";
import { toPairSummary } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const pairs = await db.dexPair.findMany({ orderBy: { sort: "asc" } });
    const summaries = pairs.map(toPairSummary);

    const tvl = summaries.reduce((s, p) => s + p.liquidity, 0);
    const vol24h = summaries.reduce((s, p) => s + p.vol24h, 0);
    const vol7d = summaries.reduce((s, p) => s + p.vol7d, 0);
    const vol30d = pairs.reduce((s, p) => s + p.vol30d, 0);
    const gnt = summaries.find((p) => p.base === "GNT");

    const sorted = [...summaries].sort((a, b) => b.change24h - a.change24h);
    const moversUp = sorted
      .filter((p) => p.change24h > 0)
      .slice(0, 3)
      .map((p) => ({ pairId: p.id, base: p.base, price: p.price, change24h: p.change24h }));
    const moversDown = sorted
      .filter((p) => p.change24h < 0)
      .reverse()
      .slice(0, 3)
      .map((p) => ({ pairId: p.id, base: p.base, price: p.price, change24h: p.change24h }));

    // sparks: 24 נרות-1h אחרונים ל-3 זוגות-דגל
    const sparkPairs = pairs.filter((p) => ["GNT", "BTC", "ETH"].includes(p.base));
    const sparks: Record<string, { t: number; v: number }[]> = {};
    for (const p of sparkPairs) {
      const candles = await db.dexCandle.findMany({
        where: { pairId: p.id, tf: "1h" },
        orderBy: { t: "desc" },
        take: 24,
      });
      sparks[`${p.base}/${p.quote}`] = candles
        .reverse()
        .map((c) => ({ t: c.t, v: c.c }));
    }

    // ארנת-M-9: נפח-יומי מצטבר מנרות-1d ב-14 הימים האחרונים
    const dayAgo14 = Math.floor(Date.now() / 1000) - 14 * 86_400;
    const daily = await db.dexCandle.groupBy({
      by: ["t"],
      _sum: { v: true },
      where: { tf: "1d", t: { gte: dayAgo14 } },
      orderBy: { t: "asc" },
    });
    const days = daily.map((d) => ({
      day: new Date(d.t * 1000).toISOString().slice(0, 10),
      vol: d._sum.v ?? 0,
    }));
    const bestDayVol = days.reduce((m, d) => Math.max(m, d.vol), 0);
    const target7d = 500_000;
    const target30d = 1_000_000;

    const engine = await engineStatus();

    return NextResponse.json({
      kpis: {
        tvl,
        vol24h,
        vol7d,
        vol30d,
        fees24h: vol24h * 0.003,
        pairsCount: pairs.length,
        gntPrice: gnt?.price ?? 0,
        gntChange24h: gnt?.change24h ?? 0,
      },
      moversUp,
      moversDown,
      sparks,
      arena: {
        days,
        current24h: vol24h,
        target7d,
        target30d,
        goal7dPct: Math.min(100, (vol24h / target7d) * 100),
        goal30dPct: Math.min(100, (vol24h / target30d) * 100),
        bestDayVol,
      },
      engine,
      topPairs: [...summaries].sort((a, b) => b.vol24h - a.vol24h).slice(0, 8),
    });
  } catch (err) {
    console.error("[api/dex/overview]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-השוק" }, { status: 500 });
  }
}
