import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const mx: Array<{ mh: unknown; c: unknown }> = await db.$queryRawUnsafe(`SELECT MAX(height) as mh, COUNT(*) as c FROM BlockHeader`);
const at: Array<{ height: unknown; stateRoot: string }> = await db.$queryRawUnsafe(`SELECT height, stateRoot FROM BlockHeader WHERE height >= 624448 ORDER BY height DESC LIMIT 3`);
const B = (x: unknown): number | null => (typeof x === "bigint" ? Number(x) : (x as number) ?? null);
console.log(JSON.stringify({ maxH: B(mx[0]?.mh), count: B(mx[0]?.c), near: at.map(r => ({ h: B(r.height), root: String(r.stateRoot).slice(0, 14) })) }));
await db.$disconnect();
