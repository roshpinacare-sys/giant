import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows: Array<{ c: number; mh: number | null }> = await db.$queryRawUnsafe(`SELECT COUNT(*) as c, MAX(height) as mh FROM BlockHeader`);
const at: Array<{ height: number; stateRoot: string }> = await db.$queryRawUnsafe(`SELECT height, stateRoot FROM BlockHeader WHERE height >= 501760 ORDER BY height DESC LIMIT 4`);
const low: Array<{ c: number }> = await db.$queryRawUnsafe(`SELECT COUNT(*) as c FROM BlockHeader WHERE height <= 10`);
const span: Array<{ mn: number; mx: number }> = await db.$queryRawUnsafe(`SELECT MIN(height) as mn, MAX(height) as mx FROM BlockHeader`);
const B = (x: unknown): number | null => (typeof x === "bigint" ? Number(x) : (x as number) ?? null);
console.log(JSON.stringify({ total: B(rows[0]?.c), maxHeight: B(rows[0]?.mh), span: { mn: B(span[0]?.mn), mx: B(span[0]?.mx) }, near501765: at.map(r => ({ h: B(r.height), root: String(r.stateRoot).slice(0, 14) })), lowRows: B(low[0]?.c) }, null, 1));
await db.$disconnect();
