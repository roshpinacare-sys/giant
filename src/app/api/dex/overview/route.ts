// GET /api/dex/overview · KPIs + movers + sparks + ארנת-M-9 (אמת) + אספקת-המטבע + מצב-מנוע
// חוק-אמת: KPIs-הבורסה = ילידים-בלבד (מה-DB). השוק-העולמי = נתוני-Binance-אמת-נפרדים.
// אין-ערבוב: נפח-עולמי-של-מיליארדים-לא-מתלכד-עם-נפח-אמת-פנימי.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine, engineStatus, SAOS, USDS_GENESIS } from "@/lib/dex-engine";
import { toPairSummary } from "@/lib/dex-server";
import { binanceKlines, binanceSymbolFor, binanceTickers24h } from "@/lib/market-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const pairs = await db.dexPair.findMany({ orderBy: { sort: "asc" } });
    const summaries = pairs.map(toPairSummary);
    const native = summaries.filter((p) => p.isNative);

    // --- KPIs-הבורסה: ילידים-בלבד (SAOS/USDS — המסחר-האמיתי-שלנו) ---
    const tvl = native.reduce((s, p) => s + p.liquidity, 0);
    const vol24h = native.reduce((s, p) => s + p.vol24h, 0);
    const vol7d = native.reduce((s, p) => s + p.vol7d, 0);
    const vol30d = pairs.filter((p) => p.isNative).reduce((s, p) => s + p.vol30d, 0);
    const saos = summaries.find((p) => p.base === "SAOS");

    // --- השוק-העולמי-החי: נתוני-24h-אמת מ-Binance לזוגות-העזר ---
    const refSymbols = pairs
      .filter((p) => !p.isNative)
      .map((p) => binanceSymbolFor(p.base))
      .filter((s): s is string => Boolean(s));
    const tickers = refSymbols.length ? await binanceTickers24h(refSymbols) : null;
    const world = pairs
      .filter((p) => !p.isNative)
      .map((p) => {
        const symbol = binanceSymbolFor(p.base);
        const t = symbol ? tickers?.get(symbol) : undefined;
        return {
          pairId: p.id,
          symbol: symbol ?? p.base,
          base: p.base,
          price: t ? t.last : p.price,
          change24h: t ? t.changePct : ((p.price - p.openPrice24h) / (p.openPrice24h || 1)) * 100,
          high24h: t ? t.high : p.high24h,
          low24h: t ? t.low : p.low24h,
          quoteVolume24h: t ? t.quoteVolume : p.vol24h,
          live: Boolean(t),
        };
      })
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

    // --- movers: מהשוק-כולו (אמת), עם-דגל-מקור ---
    const sorted = [...summaries].sort((a, b) => b.change24h - a.change24h);
    const toMover = (p: (typeof summaries)[number]) => ({
      pairId: p.id,
      base: p.base,
      price: p.price,
      change24h: p.change24h,
      isNative: p.isNative,
    });
    const moversUp = sorted.filter((p) => p.change24h > 0).slice(0, 3).map(toMover);
    const moversDown = sorted
      .filter((p) => p.change24h < 0)
      .reverse()
      .slice(0, 3)
      .map(toMover);

    // --- sparks: SAOS מה-DB-האמת · BTC/ETH מהקרניים-האמת-של-Binance ---
    const sparks: Record<string, { t: number; v: number }[]> = {};
    const saosPair = pairs.find((p) => p.base === "SAOS");
    if (saosPair) {
      const candles = await db.dexCandle.findMany({
        where: { pairId: saosPair.id, tf: "1h" },
        orderBy: { t: "desc" },
        take: 24,
      });
      sparks["SAOS/USDS"] = candles.reverse().map((c) => ({ t: c.t, v: c.c }));
    }
    for (const base of ["BTC", "ETH"]) {
      const symbol = binanceSymbolFor(base);
      const k = symbol ? await binanceKlines(symbol, "1h", 24) : null;
      if (k) sparks[`${base}/USDS`] = k.map((c) => ({ t: c.t, v: c.c }));
    }

    // ארנת-M-9 — נפח-אמת-פנימי בלבד (מנרות-1d שנצברו מעסקאות-אמת מאז-הגנזיס)
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

    // --- אספקת-המטבע: נגזר-מהלדג'ר בלבד ---
    const byToken = await db.dexLedger.groupBy({ by: ["token", "account"], _sum: { amount: true } });
    const sumFor = (token: string, account?: string) =>
      byToken
        .filter((r) => r.token === token && (!account || r.account === account))
        .reduce((s, r) => s + (r._sum.amount ?? 0), 0);
    const saosIssued = sumFor("SAOS");
    const saosTreasury = sumFor("SAOS", "TREASURY");
    const saosOwner = sumFor("SAOS", "OWNER");
    const usdsIssued = sumFor("USDS");
    const usdsTreasury = sumFor("USDS", "TREASURY");
    const usdsOwner = sumFor("USDS", "OWNER");
    const saosInPool = saosPairBase(pairs);
    const usdsInPool = usdsPairQuote(pairs);

    // --- צי-הסוכנים: נפח-אמת-של-הצי ב-24h ---
    const dayAgoFleet = new Date(Date.now() - 86_400_000);
    const fleetAgg = await db.dexTrade.aggregate({
      _sum: { total: true },
      _count: true,
      where: { source: "FLEET", t: { gte: dayAgoFleet } },
    });
    const [fleetVol24h, fleetTrades24h] = [fleetAgg._sum.total ?? 0, fleetAgg._count ?? 0];
    const fleetAgents = await db.fleetAgent.count({ where: { active: true } });

    const engine = await engineStatus();
    const seededAt = engine.seededAt ? new Date(engine.seededAt).getTime() : null;
    const marketAgeSec = seededAt ? Math.max(0, Math.floor(Date.now() / 1000) - Math.floor(seededAt / 1000)) : null;

    return NextResponse.json({
      kpis: {
        tvl,
        vol24h,
        vol7d,
        vol30d,
        fees24h: vol24h * 0.003,
        pairsCount: pairs.length,
        saosPrice: saos?.price ?? 0,
        saosChange24h: saos?.change24h ?? 0,
      },
      moversUp,
      moversDown,
      sparks,
      world,
      arena: {
        days,
        current24h: vol24h,
        target7d,
        target30d,
        goal7dPct: Math.min(100, (vol24h / target7d) * 100),
        goal30dPct: Math.min(100, (vol24h / target30d) * 100),
        bestDayVol,
      },
      fleet: {
        vol24h: fleetVol24h,
        trades24h: fleetTrades24h,
        activeAgents: fleetAgents,
      },
      // פאנל-האמת: מה-באמת-קיים. תקרה-לא-מנופקת-מוצגת-בנפרד. אפס-הבטחות.
      supply: {
        saos: {
          cap: SAOS.cap,
          issued: saosIssued + saosInPool,
          issuedByGenesis: SAOS.issued,
          treasury: saosTreasury,
          owner: saosOwner,
          inPool: saosInPool,
          notYetIssued: Math.max(0, SAOS.cap - (saosIssued + saosInPool)),
        },
        usds: {
          genesisIssued: USDS_GENESIS.issued,
          issued: usdsIssued + usdsInPool,
          treasury: usdsTreasury,
          owner: usdsOwner,
          inPool: usdsInPool,
        },
        marketAgeSec,
        realOnly: true,
        priceSource: "SAOS: AMM אמת · עזרים: Binance חי",
      },
      engine,
      topPairs: [...native].sort((a, b) => b.vol24h - a.vol24h).slice(0, 8),
    });
  } catch (err) {
    console.error("[api/dex/overview]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-השוק" }, { status: 500 });
  }
}

function saosPairBase(pairs: { base: string; reserveBase: number }[]): number {
  const p = pairs.find((x) => x.base === "SAOS");
  return p ? p.reserveBase : 0;
}

function usdsPairQuote(pairs: { base: string; reserveQuote: number }[]): number {
  const p = pairs.find((x) => x.base === "SAOS");
  return p ? p.reserveQuote : 0;
}
