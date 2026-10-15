// GET /api/fleet/state · מצב-הצי — קריאה-ציבורית-חיה (ללא-סודות: אין-אסימונים, אין-hash-ים)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { FLEET_LIMITS } from "@/lib/fleet-auth";
import { fleetLoopStatus } from "@/lib/fleet-loop";

interface LoopCfg {
  sweeps?: number;
  lastError?: string | null;
  lastSweepAt?: string | null;
  lastActionAt?: string | null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const agents = await db.fleetAgent.findMany({ orderBy: { createdAt: "asc" } });
    const dayAgo = new Date(Date.now() - 86_400_000);

    const volAgg = await db.dexTrade.aggregate({
      _sum: { total: true },
      _count: true,
      where: { source: "FLEET", t: { gte: dayAgo } },
    });
    const recent = await db.dexTrade.findMany({
      where: { source: "FLEET" },
      orderBy: { t: "desc" },
      take: 12,
    });

    const balances = await db.dexLedger.groupBy({
      by: ["account"],
      _sum: { amount: true },
      where: { account: { startsWith: "FLEET:" }, token: "USDS" },
    });
    const balMap = new Map(balances.map((b) => [b.account, b._sum.amount ?? 0]));

    // לוח-הובלה: נפח-אמת-פר-סוכן ב-24h (מהעסקאות עצמן)
    const perAgent = await db.dexTrade.groupBy({
      by: ["sourceAgent"],
      _sum: { total: true },
      _count: true,
      where: { source: "FLEET", sourceAgent: { not: null }, t: { gte: dayAgo } },
    });
    const volMap = new Map(perAgent.map((r) => [r.sourceAgent as string, { vol: r._sum.total ?? 0, trades: r._count }]));

    // בריאות-הלולאה-מה-DexConfig (העדות-המתפרסמת — עמידה-לריסטרטים)
    let loopCfg: LoopCfg | null = null;
    try {
      const hc = await db.dexConfig.findUnique({ where: { key: "fleetLoopHealth" } });
      loopCfg = hc ? (JSON.parse(hc.value) as LoopCfg) : null;
    } catch {
      loopCfg = null;
    }

    return NextResponse.json({
      limits: FLEET_LIMITS,
      fleetVol24h: volAgg._sum.total ?? 0,
      fleetTrades24h: volAgg._count ?? 0,
      totalAllocated: agents.reduce((s, a) => s + a.allocationUsds, 0),
      agents: agents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        active: a.active,
        allocationUsds: a.allocationUsds,
        balanceUsds: balMap.get(`FLEET:${a.agentId}`) ?? 0,
        vol24h: volMap.get(a.agentId)?.vol ?? 0,
        trades24h: volMap.get(a.agentId)?.trades ?? 0,
        lastTradeAt: a.lastTradeAt?.toISOString() ?? null,
      })),
      recentTrades: recent.map((t) => ({
        side: t.side,
        price: t.price,
        amount: t.amount,
        total: t.total,
        t: t.t.toISOString(),
      })),
      // בריאות-לולאת-לקוחות-האמת — מדידה-כנה (כולל-כשלים) ולא-ירוק-מזויף
      loop: (() => {
        const s = fleetLoopStatus();
        const cfg = loopCfg;
        const lastSweep = s.lastSweepAt ? Date.parse(s.lastSweepAt) : 0;
        const lastAction = s.lastActionAt ? Date.parse(s.lastActionAt) : 0;
        const sweepAgoSec = lastSweep ? Math.round((Date.now() - lastSweep) / 1000) : null;
        const running =
          (sweepAgoSec !== null && sweepAgoSec <= 60) ||
          (lastAction && Date.now() - lastAction < 600_000) ||
          Boolean(cfg?.lastSweepAt && Date.now() - Date.parse(cfg.lastSweepAt) < 180_000);
        return {
          running,
          sweeps: s.sweeps || cfg?.sweeps || 0,
          trades: s.trades || 0,
          orders: s.orders || 0,
          cancels: s.cancels || 0,
          errors: s.errors || 0,
          lastError: s.lastError ?? cfg?.lastError ?? null,
          lastSweepAt: s.lastSweepAt ?? cfg?.lastSweepAt ?? null,
          lastActionAt: s.lastActionAt ?? cfg?.lastActionAt ?? null,
        };
      })(),
    });
  } catch (err) {
    console.error("[api/fleet/state]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-מצב-הצי" }, { status: 500 });
  }
}
