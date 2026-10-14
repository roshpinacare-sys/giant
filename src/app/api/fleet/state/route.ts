// GET /api/fleet/state · מצב-הצי — קריאה-ציבורית-חיה (ללא-סודות: אין-אסימונים, אין-hash-ים)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { FLEET_LIMITS } from "@/lib/fleet-auth";

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
        lastTradeAt: a.lastTradeAt?.toISOString() ?? null,
      })),
      recentTrades: recent.map((t) => ({
        side: t.side,
        price: t.price,
        amount: t.amount,
        total: t.total,
        t: t.t.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/fleet/state]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-מצב-הצי" }, { status: 500 });
  }
}
