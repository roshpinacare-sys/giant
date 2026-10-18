import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const S = (o: any) => JSON.stringify(o, (_k, v) => typeof v === 'bigint' ? Number(v) : v);
async function main() {
  for (const a of await db.fleetAgent.findMany()) {
    console.log('AGENT', a.agentId, 'alloc', a.allocationUsds, 'active', a.active, 'lastTrade', a.lastTradeAt ? new Date(a.lastTradeAt).toISOString() : 'NEVER');
  }
  const bySource = await db.dexTrade.groupBy({ by: ['source'], _count: true, _sum: { total: true } });
  console.log('TRADES_BY_SOURCE:', S(bySource));
  const fleetTrades = await db.dexTrade.findMany({ where: { source: 'FLEET' }, orderBy: { t: 'desc' }, take: 6 });
  console.log('FLEET_TRADES_RECENT:');
  for (const t of fleetTrades) console.log(' ', new Date(t.t).toISOString(), t.sourceAgent, t.side, t.amount, '@', t.price.toFixed(4), 'total', t.total.toFixed(2));
  const lastFleet = await db.dexTrade.findFirst({ where: { source: 'FLEET' }, orderBy: { t: 'desc' } });
  const ageH = lastFleet ? (Date.now() - new Date(lastFleet.t).getTime()) / 3600000 : null;
  console.log('LAST_FLEET_TRADE_AGE_HOURS:', ageH === null ? 'NO_FLEET_TRADES_EVER' : ageH.toFixed(1));
  const orders = await db.dexOrder.groupBy({ by: ['status', 'source'], _count: true });
  console.log('ORDERS:', S(orders));
  const accts = await db.dexLedger.groupBy({ by: ['account'], _count: true, _sum: { amount: true } }).catch(e => [String(e).slice(0, 120)]);
  console.log('LEDGER_ACCOUNTS:', S(accts));
  const apiKeys = await db.dexApiKey.count();
  const activeKeys = await db.dexApiKey.count({ where: { revokedAt: null } });
  console.log('API_KEYS total/active:', apiKeys, '/', activeKeys);
  const lastKey = await db.dexApiKey.findFirst({ orderBy: { lastUsedAt: 'desc' } });
  console.log('LAST_API_KEY_USED:', lastKey ? `${lastKey.label} at ${lastKey.lastUsedAt ? new Date(lastKey.lastUsedAt).toISOString() : 'never'}` : 'no keys');
}
main().finally(() => db.$disconnect());
