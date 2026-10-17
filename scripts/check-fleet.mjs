// scripts/check-fleet.mjs · בדיקת-מצב-חי של משתמשי-הפנים (הצי) מהלדג'ר-אמת
// כלי-תפעול: סוכנים · יתרות · פקודות-פתוחות · עסקאות-24ש׳ · בריאות-הלולאה.
// אפס-סודות: קריאה-בלבד מה-SQLite הקנוני (db/custom.db).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const agents = await db.fleetAgent.findMany({ orderBy: { agentId: "asc" } });
console.log(`=== FleetAgent (${agents.length}):`);
for (const a of agents) {
  console.log(
    ` ${a.agentId} | name=${a.name} | alloc=${a.allocationUsds} | active=${a.active} | lastTrade=${a.lastTradeAt?.toISOString() ?? "-"}`,
  );
}

const open = await db.dexOrder.groupBy({
  by: ["account"],
  _count: { _all: true },
  _sum: { amountIn: true },
  where: { status: "OPEN" },
});
console.log("=== OPEN orders by account:");
for (const o of open) {
  console.log(` ${o.account} | n=${o._count._all} | amountIn=${o._sum.amountIn?.toFixed(2)}`);
}

const dayAgo = new Date(Date.now() - 86_400_000);
const tr = await db.dexTrade.groupBy({
  by: ["sourceAgent"],
  _count: { _all: true },
  _sum: { total: true },
  where: { source: "FLEET", t: { gte: dayAgo } },
});
console.log("=== FLEET trades 24h:");
for (const t of tr) {
  console.log(` ${t.sourceAgent} | n=${t._count._all} | vol=${t._sum.total?.toFixed(2)}`);
}

const bal = await db.dexLedger.groupBy({
  by: ["account", "token"],
  _sum: { amount: true },
  where: {
    OR: [{ account: { startsWith: "FLEET:" } }, { account: { in: ["TREASURY", "ESCROW", "OWNER"] } }],
  },
});
console.log("=== Ledger balances:");
for (const b of bal) {
  console.log(` ${b.account} | ${b.token} = ${b._sum.amount?.toFixed(2)}`);
}

const cfg = await db.dexConfig.findMany({
  where: { key: { in: ["fleetLoopHealth", "lastTickAt", "ticks"] } },
});
console.log("=== DexConfig:");
for (const c of cfg) {
  console.log(` ${c.key} = ${c.value.slice(0, 400)}`);
}

const ft = await db.dexTrade.count({ where: { source: "FLEET" } });
const ot = await db.dexOrder.count({ where: { account: { startsWith: "FLEET:" } } });
console.log(`=== totals: fleetTrades=${ft} fleetOrdersEver=${ot}`);

await db.$disconnect();
