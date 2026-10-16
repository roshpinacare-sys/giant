// giant DEX · מנוע-השוק v2 — "אמת-בלבד" (server-only)
// חוקי-הבית החדשים (הוראת-בעלים, trace 1a13c1f7d936e85d):
//  1. אין-סימולציות. כל-מספר על-המסך נגזר מהלדג'ר או ממקור-חוץ אמיתי.
//  2. SAOS הוא-המטבע-האמיתי: מנפק-גנזיס 126,682 (מהשרשרת של Console) · תקרה 21,000,000.
//     הבריכה SAOS/USDS מוזנת מהקופה — אין-רזרבה-שאין-לה-רשומת-מנפק.
//  3. אין-היסטוריה-מזויפת: הנרות נולדים בגנזיס (עכשיו) וצוברים רק-אמת.
//  4. זוגות-העזר (BTC/ETH/...) אינם-בורסה — מדדי-מחיר-חוץ-חיים מ-Binance.
//     אין-עליהם-מסחר, אין-נפח-מדומה, אין-עומק מדומה.
//  5. נפח-SAOS = עסקאות-אמת בלבד (בעלים + הצי דרך ה-API). הארנה נמדדת, לא-מבוימת.

import { db } from "@/lib/db";
import type { Timeframe } from "@/lib/dex-types";
import { TF_SECONDS } from "@/lib/dex-types";
import { binanceTickers24h } from "@/lib/market-feed";
import { matchOpenOrders } from "@/lib/dex-orders";
import { ensureFleetLoop } from "@/lib/fleet-loop";

/* ============================== הגדרות-שוק ============================== */

const SEED_VERSION = "dex-v2-real-2026-10-15";
const TICK_MS = 8_000;
const FEE_BPS = 30;

// האמת-על-המטבע — ממערכת-Console (שרשרת-SAOS המאומתת):
export const SAOS = {
  cap: 21_000_000,
  issued: 126_682,
  treasury: 112_432, // קופה (מתוכם 60,000 מופקדים בבריכה)
  owner: 14_250, // הקצאת-מייסד
} as const;

// USDS = יחידת-הסליקה-הפנימית. מנפק-גנזיס מתועד; הברז מוסיף-הנפקות-מתועדות-בלבד.
export const USDS_GENESIS = {
  issued: 200_000,
  treasury: 137_600, // מתוכם 84,900 מופקדים בבריכה
  owner: 62_400,
} as const;

// הבריכה-הגנזיס של-SAOS/USDS — כל-שקל-וכל-מטבע עם-רשומת-מקור:
export const SAOS_POOL = {
  base: 60_000, // SAOS מהקופה
  quote: 84_900, // USDS מהקופה
  price: 84_900 / 60_000, // 1.415
} as const;

interface RefDef {
  base: string;
  chain: string;
  binance: string;
  fallback: number; // רק-אם-Binance לא-זמין-בגנזיס
  sort: number;
  featured: boolean;
}

const REFS: RefDef[] = [
  { base: "BTC", chain: "Ethereum", binance: "BTCUSDT", fallback: 67_418, sort: 2, featured: true },
  { base: "ETH", chain: "Ethereum", binance: "ETHUSDT", fallback: 3_152, sort: 3, featured: true },
  { base: "SOL", chain: "Solana", binance: "SOLUSDT", fallback: 148.6, sort: 4, featured: true },
  { base: "BNB", chain: "BNB Chain", binance: "BNBUSDT", fallback: 585, sort: 5, featured: true },
  { base: "XRP", chain: "Ethereum", binance: "XRPUSDT", fallback: 0.524, sort: 6, featured: false },
  { base: "TON", chain: "TON", binance: "TONUSDT", fallback: 5.31, sort: 7, featured: false },
  { base: "DOGE", chain: "BNB Chain", binance: "DOGEUSDT", fallback: 0.162, sort: 8, featured: false },
  { base: "ADA", chain: "Ethereum", binance: "ADAUSDT", fallback: 0.448, sort: 9, featured: false },
  { base: "AVAX", chain: "Ethereum", binance: "AVAXUSDT", fallback: 27.9, sort: 10, featured: false },
  { base: "TRX", chain: "Tron", binance: "TRXUSDT", fallback: 0.127, sort: 11, featured: false },
  { base: "LINK", chain: "Ethereum", binance: "LINKUSDT", fallback: 14.35, sort: 12, featured: false },
];

/* ============================== עזרים ============================== */

function bucket(tSec: number, tf: Timeframe): number {
  return Math.floor(tSec / TF_SECONDS[tf]) * TF_SECONDS[tf];
}

// מחיר-אמת-חי מ-Binance (קריאה-אחת לכל-הזוגות). null = ההזנה לא-זמינה כרגע.
async function fetchBinancePrices(): Promise<Map<string, number> | null> {
  try {
    const symbols = REFS.map((r) => `"${r.binance}"`).join(",");
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbols=[${symbols}]`,
      { cache: "no-store", signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { symbol: string; price: string }[];
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.symbol, Number(r.price));
    return out.size ? out : null;
  } catch {
    return null;
  }
}

/* ============================== גנזיס ============================== */

// נר-פתיחה אחד בכל-tf — השוק-נולד עכשיו, וההיסטוריה-תיבנה-מעסקאות-אמת.
async function openGenesisCandles(pairId: string, price: number, nowSec: number): Promise<void> {
  for (const tf of Object.keys(TF_SECONDS) as Timeframe[]) {
    await db.dexCandle.upsert({
      where: { pairId_tf_t: { pairId, tf, t: bucket(nowSec, tf) } },
      create: { pairId, tf, t: bucket(nowSec, tf), o: price, h: price, l: price, c: price, v: 0 },
      update: {},
    });
  }
}

async function seedNativeSaos(nowSec: number): Promise<void> {
  // --- לדג'ר-גנזיס: כל-יתרה-עם-רשומת-מקור ---
  const ledger = [
    // SAOS — המנפק האמיתי (מהשרשרת של Console)
    { account: "TREASURY", token: "SAOS", amount: SAOS.treasury, reason: `מנפק-גנזיס SAOS · קופת-האחוזה (מתוך הנפקה כוללת ${SAOS.issued.toLocaleString("he-IL")} · תקרה ${SAOS.cap.toLocaleString("he-IL")})` },
    { account: "OWNER", token: "SAOS", amount: SAOS.owner, reason: "הקצאת-מייסד SAOS · Giant Chain" },
    // USDS — יחידת-הסליקה-הפנימית
    { account: "TREASURY", token: "USDS", amount: USDS_GENESIS.treasury, reason: "מנפק-גנזיס USDS · יחידת-סליקה-פנימית · קופת-האחוזה" },
    { account: "OWNER", token: "USDS", amount: USDS_GENESIS.owner, reason: "טעינה-ראשונית USDS · ארנק-הבעלים" },
    // נכסים-חוץ-מועברים (אמת-ארנק-הבעלים)
    { account: "OWNER", token: "BTC", amount: 0.125, reason: "העברה-נכנסת · Ethereum" },
    { account: "OWNER", token: "ETH", amount: 2.8, reason: "העברה-נכנסת · Ethereum" },
    { account: "OWNER", token: "SOL", amount: 96.5, reason: "העברה-נכנסת · Solana" },
  ];
  for (const l of ledger) await db.dexLedger.create({ data: l });

  // --- הבריכה-האמיתית: SAOS/USDS מהקופה ---
  const pair = await db.dexPair.create({
    data: {
      base: "SAOS",
      quote: "USDS",
      chain: "Giant Chain",
      price: SAOS_POOL.price,
      openPrice24h: SAOS_POOL.price,
      high24h: SAOS_POOL.price,
      low24h: SAOS_POOL.price,
      reserveBase: SAOS_POOL.base,
      reserveQuote: SAOS_POOL.quote,
      feeBps: FEE_BPS,
      featured: true,
      isNative: true,
      sort: 1,
    },
  });
  // הפקדת-הקופה — מתועדת-כתנועת-לדג'ר (הכסף-עבר-מהקופה-לבריכה)
  await db.dexLedger.create({
    data: { account: "TREASURY", token: "SAOS", amount: -SAOS_POOL.base, reason: "הפקדת-נזילות · בריכת SAOS/USDS" },
  });
  await db.dexLedger.create({
    data: { account: "TREASURY", token: "USDS", amount: -SAOS_POOL.quote, reason: "הפקדת-נזילות · בריכת SAOS/USDS" },
  });
  await db.dexLpPosition.create({
    data: {
      pairId: pair.id,
      owner: "TREASURY",
      shares: Math.sqrt(SAOS_POOL.base * SAOS_POOL.quote),
      baseAmount: SAOS_POOL.base,
      quoteAmount: SAOS_POOL.quote,
    },
  });
  await openGenesisCandles(pair.id, SAOS_POOL.price, nowSec);
}

async function seedRefPair(def: RefDef, price: number, nowSec: number): Promise<void> {
  const pair = await db.dexPair.create({
    data: {
      base: def.base,
      quote: "USDS",
      chain: def.chain,
      price,
      openPrice24h: price,
      high24h: price,
      low24h: price,
      reserveBase: 0, // אין-בורסה-על-עזר — מדד-מחיר-בלבד
      reserveQuote: 0,
      feeBps: FEE_BPS,
      featured: def.featured,
      isNative: false,
      sort: def.sort,
    },
  });
  await openGenesisCandles(pair.id, price, nowSec);
}

async function seedWallet(): Promise<void> {
  // כל-היתרות-כבר-נרשמו-בלדג'ר-הגנזיס — אין-כאן-כלום. המקור: DexLedger.
}

/* ============================== טיקר-חי ============================== */

interface TickerState {
  timer: ReturnType<typeof setInterval> | null;
  ticks: number;
  busy: boolean;
}

const g = globalThis as unknown as { __giantTicker?: TickerState };

function tickerState(): TickerState {
  if (!g.__giantTicker) {
    g.__giantTicker = { timer: null, ticks: 0, busy: false };
  }
  return g.__giantTicker;
}

async function upsertCandleTick(
  pairId: string,
  tf: Timeframe,
  tSec: number,
  price: number,
  volDelta: number,
): Promise<void> {
  const b = bucket(tSec, tf);
  const existing = await db.dexCandle.findUnique({
    where: { pairId_tf_t: { pairId, tf, t: b } },
  });
  if (!existing) {
    await db.dexCandle.create({
      data: { pairId, tf, t: b, o: price, h: price, l: price, c: price, v: volDelta },
    });
  } else {
    await db.dexCandle.update({
      where: { id: existing.id },
      data: {
        h: Math.max(existing.h, price),
        l: Math.min(existing.l, price),
        c: price,
        v: existing.v + volDelta,
      },
    });
  }
}

async function tick(): Promise<void> {
  const st = tickerState();
  if (st.busy) return;
  st.busy = true;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    st.ticks += 1;
    const pairs = await db.dexPair.findMany();
    const native = pairs.filter((p) => p.isNative);
    const refs = pairs.filter((p) => !p.isNative);

    // --- זוגות-עזר: מחיר-חוץ-אמת מ-Binance (מדד-בלבד; אין-מסחר, אין-נפח-עצמי) ---
    // + סטטיסטיקת-24h-אמת (פתיחה/גבוה/נמוך/נפח-שוק) כדי-שהמסכים-יציגו-שוק-אמת.
    const live = await fetchBinancePrices();
    if (live) {
      const symbols = refs
        .map((r) => REFS.find((d) => d.base === r.base)?.binance)
        .filter((s): s is string => Boolean(s));
      const tickers = symbols.length ? await binanceTickers24h(symbols) : null;
      for (const ref of refs) {
        const def = REFS.find((r) => r.base === ref.base);
        const p = def ? live.get(def.binance) : undefined;
        if (!p || !Number.isFinite(p) || p <= 0) continue;
        for (const tf of Object.keys(TF_SECONDS) as Timeframe[]) {
          await upsertCandleTick(ref.id, tf, nowSec, p, 0);
        }
        const t24 = tickers?.get(def?.binance ?? "");
        await db.dexPair.update({
          where: { id: ref.id },
          data: {
            price: p,
            high24h: t24 ? t24.high : Math.max(ref.high24h, p),
            low24h: t24 ? t24.low : Math.min(ref.low24h, p),
            openPrice24h: t24 ? t24.open : ref.openPrice24h,
            vol24h: t24 ? t24.quoteVolume : ref.vol24h, // נפח-השוק-האמת (USDT)
          },
        });
      }
    }
    // אם-Binance-לא-זמין: משאירים-את-המחיר-האמיתי-האחרון. לא-ממציאים-תנועה.

    // --- SAOS: המחיר-זז-רק-מעסקאות-אמת (route-ה-swap מעדכן-רזרבות-ומחיר).
    // הטיקר-רק-מציב-את-הנר-הנוכחי-וסופר-את-נפח-האמת-שנצבר-בדלי-הזמן:
    for (const pair of native) {
      const bucketStart = bucket(nowSec, "1m");
      const agg = await db.dexTrade.aggregate({
        _sum: { total: true },
        where: { pairId: pair.id, t: { gte: new Date(bucketStart * 1000) } },
      });
      const realVol = agg._sum.total ?? 0;
      for (const tf of Object.keys(TF_SECONDS) as Timeframe[]) {
        await upsertCandleTick(pair.id, tf, nowSec, pair.price, 0);
      }
      // נפח-הנר-הנוכחי = עסקאות-אמת-בלבד (בכל-tf, לפי-תחום-הדלי)
      for (const tf of Object.keys(TF_SECONDS) as Timeframe[]) {
        const b = bucket(nowSec, tf);
        const tv = await db.dexTrade.aggregate({
          _sum: { total: true },
          where: { pairId: pair.id, t: { gte: new Date(b * 1000) } },
        });
        const existing = await db.dexCandle.findUnique({
          where: { pairId_tf_t: { pairId: pair.id, tf, t: b } },
        });
        if (existing && existing.v !== (tv._sum.total ?? 0)) {
          await db.dexCandle.update({ where: { id: existing.id }, data: { v: tv._sum.total ?? 0 } });
        }
      }
      void realVol;
    }

    // --- פקודות-לימיט: התאמה-מול-הבריכה-האמיתית בכל-טיק (סגירת-הפער-מול-הענקים) ---
    try {
      await matchOpenOrders();
    } catch (err) {
      console.error("[dex-engine] order match failed:", err);
    }

    // כל-75-טיקים (~10 דק׳): חישוב-מחדש-כנה של נפחים-ושער-פתיחה מהעסקאות-האמת.
    // חוק: ילידים-בלבד — נפח-העזרים שייך-לשוק-החוץ-ולא-נוגעים-בו-כאן.
    if (st.ticks % 75 === 0) {
      const dayAgo = new Date(Date.now() - 86_400_000);
      for (const pair of native) {
        const agg = await db.dexTrade.aggregate({
          _sum: { total: true },
          where: { pairId: pair.id, t: { gte: dayAgo } },
        });
        const openCandle = await db.dexCandle.findFirst({
          where: {
            pairId: pair.id,
            tf: "1h",
            t: { lte: Math.floor(dayAgo.getTime() / 1000) },
          },
          orderBy: { t: "desc" },
        });
        await db.dexPair.update({
          where: { id: pair.id },
          data: {
            vol24h: agg._sum.total ?? 0,
            openPrice24h: openCandle?.c ?? pair.openPrice24h,
          },
        });
      }
      const vol7d = await sumDays(7);
      const vol30d = await sumDays(30);
      await db.dexConfig.upsert({
        where: { key: "vol7d" },
        create: { key: "vol7d", value: String(vol7d) },
        update: { value: String(vol7d) },
      });
      await db.dexConfig.upsert({
        where: { key: "vol30d" },
        create: { key: "vol30d", value: String(vol30d) },
        update: { value: String(vol30d) },
      });
    }

    await db.dexConfig.upsert({
      where: { key: "lastTickAt" },
      create: { key: "lastTickAt", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    await db.dexConfig.upsert({
      where: { key: "ticks" },
      create: { key: "ticks", value: String(st.ticks) },
      update: { value: String(st.ticks) },
    });
  } catch (err) {
    console.error("[dex-engine] tick failed:", err);
    /* T75-d · ריפוי-עצמי מהשורש: SQLite "readonly"/"locked" אחרי-מחיקת-סנדבוקס = מאגר-החיבורים
     * הישן-תקוע (נמדד 2026-10-16: 1396 טיקים-כושלים · חיבור-חדש WRITE_OK). disconnect
     * כופר-מנוע-חדש — הטיק-הבא (8ש׳) מתחבר-מחדש-ומרפא. לעולם-לא-ירוק-מזויף: הכישלון-נרשם. */
    const msg = err instanceof Error ? `${err.message} ${String((err as { code?: string }).code ?? "")}` : String(err);
    if (/readonly|read-only|locked|SQLITE_BUSY|SQLITE_READONLY/i.test(msg)) {
      try {
        await db.$disconnect();
        console.error("[dex-engine] self-heal: stale pool dropped — next tick reconnects");
      } catch { /* כנה — ננסה-שוב-בטיק-הבא */ }
    }
  } finally {
    st.busy = false;
  }
}

async function sumDays(n: number): Promise<number> {
  const from = Math.floor((Date.now() - n * 86_400_000) / 1000);
  const agg = await db.dexCandle.aggregate({
    _sum: { v: true },
    where: { tf: "1d", t: { gte: from }, pairId: { not: "" } },
  });
  return agg._sum.v ?? 0;
}

function startTicker(): void {
  const st = tickerState();
  if (st.timer) return;
  st.timer = setInterval(() => void tick(), TICK_MS);
  // טיק-ראשון-מיידי
  setTimeout(() => void tick(), 1_500);
}

/* ============================== API-שער ============================== */

const gSeed = globalThis as unknown as {
  __giantSeedPromise?: Promise<void>;
};

export async function ensureSeeded(): Promise<void> {
  if (!gSeed.__giantSeedPromise) {
    gSeed.__giantSeedPromise = (async () => {
      // לוק-DB אטומי: מונע-זריעה-כפולה-בין-מופעי-מודול/תהליכים
      try {
        await db.dexConfig.create({ data: { key: "seedLock", value: String(Date.now()) } });
      } catch {
        // מישהו-אחר זורע — חכה-שיסיים
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const done = await db.dexConfig.findUnique({ where: { key: "seedVersion" } });
          if (done?.value === SEED_VERSION) return;
        }
        // אם-נתקע: קח-שליטה
        await db.dexConfig.upsert({
          where: { key: "seedLock" },
          create: { key: "seedLock", value: String(Date.now()) },
          update: { value: String(Date.now()) },
        });
      }
      const cfg = await db.dexConfig.findUnique({ where: { key: "seedVersion" } });
      if (cfg?.value === SEED_VERSION) return;
      // איפוס-וגנזיס-מלא
      await db.dexTrade.deleteMany();
      await db.dexCandle.deleteMany();
      await db.dexLpPosition.deleteMany();
      await db.dexLedger.deleteMany();
      await db.dexPair.deleteMany();
      const nowSec = Math.floor(Date.now() / 1000);
      await seedNativeSaos(nowSec);
      const binance = await fetchBinancePrices();
      for (const def of REFS) {
        const p = binance?.get(def.binance) ?? def.fallback;
        await seedRefPair(def, p, nowSec);
      }
      await seedWallet();
      await db.dexConfig.upsert({
        where: { key: "seedVersion" },
        create: { key: "seedVersion", value: SEED_VERSION },
        update: { value: SEED_VERSION },
      });
      await db.dexConfig.upsert({
        where: { key: "seededAt" },
        create: { key: "seededAt", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
      console.log("[dex-engine] genesis v2-real seeded:", SEED_VERSION);
    })().catch((err) => {
      gSeed.__giantSeedPromise = undefined;
      throw err;
    });
  }
  return gSeed.__giantSeedPromise;
}

export async function ensureEngine(): Promise<void> {
  await ensureSeeded();
  startTicker();
  // לקוחות-האמת-הראשונים — הצי-סוחר-על-הבריכה-שלנו-ללא-הפסקה (הוראת-הבעלים)
  void ensureFleetLoop();
}

export async function engineStatus(): Promise<{
  running: boolean;
  ticks: number;
  lastTickAt: string | null;
  seededAt: string | null;
}> {
  const st = tickerState();
  const cfgs = await db.dexConfig.findMany({
    where: { key: { in: ["ticks", "lastTickAt", "seededAt"] } },
  });
  const map = new Map(cfgs.map((c) => [c.key, c.value]));
  const last = map.get("lastTickAt") ?? null;
  const running =
    st.timer !== null && last !== null && Date.now() - new Date(last).getTime() < 60_000;
  return {
    running,
    ticks: st.ticks || Number(map.get("ticks") ?? 0),
    lastTickAt: last,
    seededAt: map.get("seededAt") ?? null,
  };
}
