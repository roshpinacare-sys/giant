import { SAOS_PROJECT_ROOT } from "@/lib/saos-paths";
// giant · שוק-הסקטורים (M-11) — כלי-הון-פנימיים-מגובים-ביסודות-אמת
// חוק-אמת: כל-סקטור מייצג מערכת-אחת-אמיתית באחוזה; היסודות נמדדים-חי-מהדיסק
// ומה-DB. ההנפקה והבריכות מתועדות-בלדג'ר, מהקופה, בתחום-מוצהר. אפס-המצאה.

import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";

const ESTATE_ROOT = `${SAOS_PROJECT_ROOT}/estate/work/t33-fresh`; // גל-86 · ניידות
const ROSH_ROOT = `${SAOS_PROJECT_ROOT}/estate/work/t30-fresh/roshpina`;

export interface SectorDef {
  base: string;
  name: string;
  system: string;
  description: string;
  poolUsds: number; // מימון-הבריכה מהקופה → מחיר-פתיחה = poolUsds/10,000
  tokens: 10_000;
  sort: number;
}

export const SECTOR_DEFS: SectorDef[] = [
  {
    base: "SC-CONSOLE",
    name: "קונסולה",
    system: "Console",
    description: "השרשרת-המאומתת · עמודים-מוצפנים · המערכת-שהוכחה",
    poolUsds: 9_000,
    tokens: 10_000,
    sort: 20,
  },
  {
    base: "SC-DOMAIN",
    name: "דומיין",
    system: "Domain",
    description: "worldbeat + office3d · ספריית-התלת-ממד של האחוזה",
    poolUsds: 6_000,
    tokens: 10_000,
    sort: 21,
  },
  {
    base: "SC-ROSH",
    name: "ראש-פינה",
    system: "roshpina",
    description: "מערכת-הווב הפנימית · מכונת-הבנייה-החיה",
    poolUsds: 4_500,
    tokens: 10_000,
    sort: 22,
  },
  {
    base: "SC-FLEET",
    name: "הצי",
    system: "Fleet",
    description: "כלכלת-הסוכנים · היסוד: נפח-מסחר-אמיתי שנמדד",
    poolUsds: 3_000,
    tokens: 10_000,
    sort: 23,
  },
];

const SECTORS_VERSION = "sectors-v1-2026-10-15";

/* ==================== גנזיס-מתועד של הסקטורים ==================== */

export async function ensureSectors(): Promise<void> {
  await ensureEngine();
  const cfg = await db.dexConfig.findUnique({ where: { key: "sectorsVersion" } });
  if (cfg?.value === SECTORS_VERSION) return;

  const nowSec = Math.floor(Date.now() / 1000);
  for (const def of SECTOR_DEFS) {
    const existing = await db.dexPair.findUnique({
      where: { base_quote: { base: def.base, quote: "USDS" } },
    });
    if (existing) continue;

    const price = def.poolUsds / def.tokens;
    const pair = await db.dexPair.create({
      data: {
        base: def.base,
        quote: "USDS",
        chain: "Giant Chain",
        price,
        openPrice24h: price,
        high24h: price,
        low24h: price,
        reserveBase: def.tokens,
        reserveQuote: def.poolUsds,
        feeBps: 30,
        featured: false,
        isNative: true, // כלי-הון-שלנו — סחירים, מחיר-זז-רק-מעסקאות-אמת
        sort: def.sort,
      },
    });
    // לדג'ר: הנפקה-מהקופה + הפקדה לבריכה — שקל-שקל מתועד
    await db.dexLedger.create({
      data: { account: "TREASURY", token: def.base, amount: def.tokens, reason: `הנפקת-גנזיס · סקטור ${def.name} (${def.system}) · מגובה ביסודות-אמת-חיים` },
    });
    await db.dexLedger.create({
      data: { account: "TREASURY", token: def.base, amount: -def.tokens, reason: `הפקדת-נזילות · בריכת ${def.base}/USDS` },
    });
    await db.dexLedger.create({
      data: { account: "TREASURY", token: "USDS", amount: -def.poolUsds, reason: `מימון-בריכה · ${def.base}/USDS · סקטור ${def.name}` },
    });
    await db.dexLpPosition.create({
      data: { pairId: pair.id, owner: "TREASURY", shares: Math.sqrt(def.tokens * def.poolUsds), baseAmount: def.tokens, quoteAmount: def.poolUsds },
    });
    // נר-גנזיס בכל-tf — ההיסטוריה תיבנה-מעסקאות-אמת-בלבד
    for (const tf of ["1m", "5m", "15m", "1h", "4h", "1d"] as const) {
      const secs = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 }[tf];
      const b = Math.floor(nowSec / secs) * secs;
      await db.dexCandle.upsert({
        where: { pairId_tf_t: { pairId: pair.id, tf, t: b } },
        create: { pairId: pair.id, tf, t: b, o: price, h: price, l: price, c: price, v: 0 },
        update: {},
      });
    }
  }
  await db.dexConfig.upsert({
    where: { key: "sectorsVersion" },
    create: { key: "sectorsVersion", value: SECTORS_VERSION },
    update: { value: SECTORS_VERSION },
  });
  await db.dexConfig.upsert({
    where: { key: "sectorsLaunchedAt" },
    create: { key: "sectorsLaunchedAt", value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
}

/* ==================== יסודות-אמת-חיים (מהדיסק ומה-DB) ==================== */

async function dirMetrics(root: string): Promise<{ files: number; bytes: number } | null> {
  try {
    await stat(root);
  } catch {
    return null;
  }
  let files = 0;
  let bytes = 0;
  const skip = new Set(["node_modules", ".git", ".next", ".turbo"]);
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 5 || files > 20_000) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        files += 1;
        try {
          const s = await stat(full);
          bytes += s.size;
        } catch {
          // קובץ-נעלם — ממשיכים
        }
      }
    }
  };
  await walk(root, 0);
  return { files, bytes };
}

async function fleetFundamentals() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const agg = await db.dexTrade.aggregate({
    _sum: { total: true },
    _count: true,
    where: { source: "FLEET", t: { gte: dayAgo } },
  });
  const agents = await db.fleetAgent.count({ where: { active: true } });
  const ledger = await db.dexLedger.count();
  return { fleetVol24h: agg._sum.total ?? 0, fleetTrades: agg._count ?? 0, activeAgents: agents, ledgerEntries: ledger };
}

export interface SectorFundamentals {
  base: string;
  name: string;
  system: string;
  description: string;
  metrics: { label: string; value: string }[];
  measuredAt: string;
}

export async function sectorFundamentals(): Promise<SectorFundamentals[]> {
  const [consoleM, domainM, roshM, fleet] = await Promise.all([
    dirMetrics(path.join(ESTATE_ROOT, "Console")),
    dirMetrics(path.join(ESTATE_ROOT, "Domain")),
    dirMetrics(ROSH_ROOT),
    fleetFundamentals(),
  ]);
  const fmtBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
  const now = new Date().toISOString();

  return [
    {
      base: "SC-CONSOLE",
      name: "קונסולה",
      system: "Console",
      description: SECTOR_DEFS[0].description,
      metrics: [
        { label: "קבצים-אמיתיים", value: consoleM ? consoleM.files.toLocaleString("he-IL") : "אין-נתון" },
        { label: "נפח-מערכת", value: consoleM ? fmtBytes(consoleM.bytes) : "אין-נתון" },
        { label: "מצב", value: consoleM ? "מאומת" : "לא-נמצא-בדיסק" },
      ],
      measuredAt: now,
    },
    {
      base: "SC-DOMAIN",
      name: "דומיין",
      system: "Domain",
      description: SECTOR_DEFS[1].description,
      metrics: [
        { label: "קבצים-אמיתיים", value: domainM ? domainM.files.toLocaleString("he-IL") : "אין-נתון" },
        { label: "נפח-מערכת", value: domainM ? fmtBytes(domainM.bytes) : "אין-נתון" },
        { label: "מצב", value: domainM ? "חיצוני-חי" : "לא-נמצא-בדיסק" },
      ],
      measuredAt: now,
    },
    {
      base: "SC-ROSH",
      name: "ראש-פינה",
      system: "roshpina",
      description: SECTOR_DEFS[2].description,
      metrics: [
        { label: "קבצים-אמיתיים", value: roshM ? roshM.files.toLocaleString("he-IL") : "אין-נתון" },
        { label: "נפח-מערכת", value: roshM ? fmtBytes(roshM.bytes) : "אין-נתון" },
        { label: "מצב", value: roshM ? "פנימי-חי" : "לא-נמצא-בדיסק" },
      ],
      measuredAt: now,
    },
    {
      base: "SC-FLEET",
      name: "הצי",
      system: "Fleet",
      description: SECTOR_DEFS[3].description,
      metrics: [
        { label: "נפח-צי · 24h", value: `${fleet.fleetVol24h.toLocaleString("he-IL", { maximumFractionDigits: 2 })} USDS` },
        { label: "עסקאות-צי", value: fleet.fleetTrades.toLocaleString("he-IL") },
        { label: "סוכנים-פעילים", value: fleet.activeAgents.toLocaleString("he-IL") },
      ],
      measuredAt: now,
    },
  ];
}
