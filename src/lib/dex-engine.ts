// giant DEX · מנוע-השוק החי (server-only)
// זריעה-אחת + טיקר-אוטונומי-נצחי: מחירים זזים, נרות נסגרים, עסקאות זורמות — כמו בורסה אמיתית.

import { db } from "@/lib/db";
import type { Timeframe } from "@/lib/dex-types";
import { TF_SECONDS } from "@/lib/dex-types";

/* ============================== הגדרות-שוק ============================== */

const SEED_VERSION = "dex-v1.1c-2026-10-15";
const TICK_MS = 8_000;
const FEE_BPS = 30;

interface PairDef {
  base: string;
  chain: string;
  price: number;
  sigma: number; // תנודתיות-יומית ממוצעת
  dailyVol: number; // יעד-נפח-יומי ב-µ-USDS (GNT≈הארנה)
  reserveQuote: number; // עומק בצד-quote (µ-USDS)
  featured: boolean;
  isNative: boolean;
  sort: number;
}

const PAIRS: PairDef[] = [
  { base: "GNT", chain: "Giant Chain", price: 1.842, sigma: 0.042, dailyVol: 96_000, reserveQuote: 994_000, featured: true, isNative: true, sort: 1 },
  { base: "BTC", chain: "Ethereum", price: 67_418, sigma: 0.026, dailyVol: 88_000, reserveQuote: 1_092_000, featured: true, isNative: false, sort: 2 },
  { base: "ETH", chain: "Ethereum", price: 3_152.4, sigma: 0.031, dailyVol: 73_000, reserveQuote: 886_000, featured: true, isNative: false, sort: 3 },
  { base: "SOL", chain: "Solana", price: 148.6, sigma: 0.048, dailyVol: 47_000, reserveQuote: 512_000, featured: true, isNative: false, sort: 4 },
  { base: "BNB", chain: "BNB Chain", price: 585.2, sigma: 0.029, dailyVol: 38_500, reserveQuote: 428_000, featured: true, isNative: false, sort: 5 },
  { base: "XRP", chain: "Ethereum", price: 0.5242, sigma: 0.036, dailyVol: 29_000, reserveQuote: 312_000, featured: false, isNative: false, sort: 6 },
  { base: "TON", chain: "TON", price: 5.31, sigma: 0.041, dailyVol: 22_500, reserveQuote: 248_000, featured: false, isNative: false, sort: 7 },
  { base: "DOGE", chain: "BNB Chain", price: 0.1618, sigma: 0.055, dailyVol: 21_000, reserveQuote: 226_000, featured: false, isNative: false, sort: 8 },
  { base: "ADA", chain: "Ethereum", price: 0.4482, sigma: 0.044, dailyVol: 17_400, reserveQuote: 194_000, featured: false, isNative: false, sort: 9 },
  { base: "AVAX", chain: "Ethereum", price: 27.9, sigma: 0.047, dailyVol: 14_200, reserveQuote: 168_000, featured: false, isNative: false, sort: 10 },
  { base: "TRX", chain: "Tron", price: 0.1268, sigma: 0.028, dailyVol: 12_100, reserveQuote: 142_000, featured: false, isNative: false, sort: 11 },
  { base: "LINK", chain: "Ethereum", price: 14.35, sigma: 0.038, dailyVol: 11_300, reserveQuote: 128_000, featured: false, isNative: false, sort: 12 },
];

// חלונות-הזריעה לכל טיים-פריים
const SEED_WINDOWS: { tf: Timeframe; bars: number }[] = [
  { tf: "1m", bars: 240 }, // 4 שעות
  { tf: "5m", bars: 144 }, // 12 שעות
  { tf: "15m", bars: 192 }, // 48 שעות
  { tf: "1h", bars: 1080 }, // 45 יום
  { tf: "4h", bars: 270 }, // 45 יום
  { tf: "1d", bars: 120 }, // 120 יום
];

/* ============================== עזרים ============================== */

let rngState = 0x2f6e2b1;
function rand(): number {
  // xorshift דטרמיניסטי-מספיק
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return ((rngState >>> 0) % 1_000_000) / 1_000_000;
}
function randn(): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
function bucket(tSec: number, tf: Timeframe): number {
  return Math.floor(tSec / TF_SECONDS[tf]) * TF_SECONDS[tf];
}
function dayScale(daysAgo: number): number {
  // צמיחת-ארנה: ~1.0 היום → ~0.68 לפני-30-יום (עקומת-M-9 עולה)
  const t = Math.min(30, Math.max(0, daysAgo)) / 30;
  return 1.0 - 0.32 * t;
}

interface RawCandle {
  tf: Timeframe;
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/* ============================== זריעה ============================== */

async function seedPair(def: PairDef, nowSec: number): Promise<void> {
  const reserveQuote = def.reserveQuote;
  const reserveBase = reserveQuote / def.price;
  const pair = await db.dexPair.create({
    data: {
      base: def.base,
      quote: "USDS",
      chain: def.chain,
      price: def.price,
      openPrice24h: def.price,
      high24h: def.price,
      low24h: def.price,
      reserveBase,
      reserveQuote,
      feeBps: FEE_BPS,
      featured: def.featured,
      isNative: def.isNative,
      sort: def.sort,
    },
  });

  // --- 1h ל-45 יום: הליכה-אקראית לאחור מהמחיר-הנוכחי ---
  const hours = SEED_WINDOWS.find((w) => w.tf === "1h")!.bars;
  const sigmaH = def.sigma / Math.sqrt(24);
  const closes: number[] = new Array(hours);
  closes[hours - 1] = def.price;
  for (let i = hours - 2; i >= 0; i--) {
    closes[i] = closes[i + 1] / (1 + sigmaH * randn());
  }
  const curHour = bucket(nowSec, "1h");
  const hourCandles: RawCandle[] = [];
  for (let i = 0; i < hours; i++) {
    const t = curHour - (hours - 1 - i) * 3600;
    const c = closes[i];
    const o = i > 0 ? closes[i - 1] : c / (1 + sigmaH * randn());
    const wick = Math.abs(randn()) * sigmaH * 0.6 + 1e-6;
    const h = Math.max(o, c) * (1 + wick);
    const l = Math.min(o, c) * (1 - wick);
    const daysAgo = (nowSec - t) / 86_400;
    const dayVol =
      def.dailyVol * dayScale(daysAgo) * (0.8 + rand() * 0.4);
    const hourWeight = 0.4 + rand() * 1.2;
    const v = (dayVol / 24) * hourWeight;
    hourCandles.push({ tf: "1h", t, o, h, l, c, v });
  }

  // --- 4h ו-1d מתוך-1h (עקביות-מלאה) ---
  const fourH = aggregate(hourCandles, "4h", nowSec);
  const oneD = aggregate(hourCandles, "1d", nowSec);

  // --- 15m/5m/1m בתוך-חלון-ההורה ---
  const m15 = subdivide(hourCandles.slice(-48), "15m", nowSec, sigmaH / 4);
  const m5 = subdivide(hourCandles.slice(-12), "5m", nowSec, sigmaH / 12);
  const m1 = subdivide(hourCandles.slice(-4), "1m", nowSec, sigmaH / 60);

  const all: RawCandle[] = [...m1, ...m5, ...m15, ...hourCandles, ...fourH, ...oneD];
  // הגנת-יתר: דה-דופ פנימי על (tf,t) — לעולם לא נכשל P2002 בזריעה
  const seen = new Set<string>();
  const unique: RawCandle[] = [];
  for (const c of all) {
    const k = `${c.tf}:${c.t}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
  }
  const rows = unique.map((c) => ({
    pairId: pair.id,
    tf: c.tf,
    t: c.t,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
    v: c.v,
  }));
  for (let i = 0; i < rows.length; i += 900) {
    const chunk = rows.slice(i, i + 900);
    try {
      await db.dexCandle.createMany({ data: chunk });
    } catch {
      // נפילה-מבוקרת: הזרקה שורה-שורה (מתעלם-מקיימים)
      for (const r of chunk) {
        await db.dexCandle.upsert({
          where: { pairId_tf_t: { pairId: r.pairId, tf: r.tf, t: r.t } },
          create: r,
          update: {},
        });
      }
    }
  }

  // --- צבירי-הזוג ---
  const last24 = hourCandles.slice(-24);
  const high24 = Math.max(...last24.map((c) => c.h));
  const low24 = Math.min(...last24.map((c) => c.l));
  const open24 = last24[0].o;
  const vol7d = oneD.slice(-7).reduce((s, c) => s + c.v, 0);
  const vol30d = oneD.slice(-30).reduce((s, c) => s + c.v, 0);
  await db.dexPair.update({
    where: { id: pair.id },
    data: {
      openPrice24h: open24,
      high24h: high24,
      low24h: low24,
      vol24h: last24.reduce((s, c) => s + c.v, 0),
      vol7d,
      vol30d,
    },
  });

  // --- עסקאות-24 שעות (סרט-חי מוכן מראש) ---
  const dayVolNow = last24.reduce((s, c) => s + c.v, 0);
  const nTrades = Math.max(90, Math.round(dayVolNow / 320));
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < nTrades; i++) {
    const w = Math.pow(rand(), 2.2) + 0.02;
    weights.push(w);
    wSum += w;
  }
  const tradeRows: {
    pairId: string;
    side: string;
    price: number;
    amount: number;
    total: number;
    source: string;
    t: Date;
  }[] = [];
  for (let i = 0; i < nTrades; i++) {
    const frac = rand(); // מקום ב-24h
    const idx = Math.min(23, Math.floor((1 - frac) * 24));
    const cn = hourCandles[hourCandles.length - 24 + idx];
    const price = cn.l + rand() * (cn.h - cn.l);
    const total = (dayVolNow * weights[i]) / wSum;
    const side = rand() > 0.5 ? "BUY" : "SELL";
    tradeRows.push({
      pairId: pair.id,
      side,
      price,
      amount: total / price,
      total,
      source: "SEED",
      t: new Date((cn.t + rand() * 3600) * 1000),
    });
  }
  // 12 עסקאות-טריות לסרט
  for (let i = 0; i < 12; i++) {
    const price = def.price * (1 + randn() * 0.0006);
    const total = def.dailyVol * 0.004 * (0.3 + rand());
    tradeRows.push({
      pairId: pair.id,
      side: rand() > 0.5 ? "BUY" : "SELL",
      price,
      amount: total / price,
      total,
      source: "AMBIENT",
      t: new Date(nowSec * 1000 - i * 22_000),
    });
  }
  for (let i = 0; i < tradeRows.length; i += 900) {
    await db.dexTrade.createMany({ data: tradeRows.slice(i, i + 900) });
  }

  // --- LP של-הקופה (85%) ---
  await db.dexLpPosition.create({
    data: {
      pairId: pair.id,
      owner: "TREASURY",
      shares: Math.sqrt(reserveBase * reserveQuote) * 0.85,
      baseAmount: reserveBase * 0.85,
      quoteAmount: reserveQuote * 0.85,
    },
  });
}

function aggregate(
  src: RawCandle[],
  tf: Timeframe,
  nowSec: number,
): RawCandle[] {
  const map = new Map<number, RawCandle>();
  for (const c of src) {
    const b = bucket(c.t, tf);
    const cur = map.get(b);
    if (!cur) {
      map.set(b, { ...c, tf, t: b });
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
    }
  }
  return [...map.values()].filter((c) => c.t < bucket(nowSec, tf));
}

function subdivide(
  parents: RawCandle[],
  tf: Timeframe,
  nowSec: number,
  sigma: number,
): RawCandle[] {
  const sec = TF_SECONDS[tf];
  const out: RawCandle[] = [];
  for (const p of parents) {
    const n = Math.max(1, Math.floor(3600 / sec));
    let price = p.o;
    for (let i = 0; i < n; i++) {
      const t = p.t + i * sec;
      if (t >= bucket(nowSec, tf)) break;
      const target = p.c;
      const drift = (target - price) / (n - i);
      const step = drift + price * sigma * randn();
      const c = Math.max(price + step, 1e-9);
      const wick = Math.abs(randn()) * sigma * 0.5 + 1e-7;
      const h = Math.min(p.h * 1.002, Math.max(price, c) * (1 + wick));
      const l = Math.max(p.l * 0.998, Math.min(price, c) * (1 - wick));
      out.push({ tf, t, o: price, h, l, c, v: (p.v / n) * (0.5 + rand()) });
      price = c;
    }
  }
  return out;
}

async function seedWallet(): Promise<void> {
  const entries = [
    { token: "USDS", amount: 62_400, reason: "טעינה-ראשונית · ארנק-הבעלים" },
    { token: "GNT", amount: 14_250, reason: "הקצאת-מייסד · Giant Chain" },
    { token: "BTC", amount: 0.125, reason: "העברה-נכנסת · Ethereum" },
    { token: "ETH", amount: 2.8, reason: "העברה-נכנסת · Ethereum" },
    { token: "SOL", amount: 96.5, reason: "העברה-נכנסת · Solana" },
  ];
  for (const e of entries) {
    await db.dexLedger.create({ data: { ...e, account: "OWNER" } });
  }
  // LP אישי של הבעלים ב-GNT/USDS
  const gnt = await db.dexPair.findFirst({ where: { base: "GNT" } });
  if (gnt) {
    await db.dexLpPosition.create({
      data: {
        pairId: gnt.id,
        owner: "OWNER",
        shares: 34_800,
        baseAmount: 8_650,
        quoteAmount: 15_930,
      },
    });
  }
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

async function tick(): Promise<void> {
  const st = tickerState();
  if (st.busy) return;
  st.busy = true;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    st.ticks += 1;
    const pairs = await db.dexPair.findMany();
    const defs = new Map(PAIRS.map((p) => [p.base, p]));

    for (const pair of pairs) {
      const def = defs.get(pair.base);
      const sigmaTick = (def?.sigma ?? 0.04) / Math.sqrt(86_400 / (TICK_MS / 1000));
      const drift = (def ? (def.price - pair.price) / def.price * 0.02 : 0); // משיכה-עדינה-אל-עוגן
      const step = pair.price * (sigmaTick * randn() + drift);
      const newPrice = Math.max(pair.price + step, 1e-9);

      // עסקאות-סביבה
      const nTr = rand() < 0.75 ? 1 + Math.floor(rand() * 3) : 0;
      const tradeData: {
        pairId: string;
        side: string;
        price: number;
        amount: number;
        total: number;
        source: string;
        t: Date;
      }[] = [];
      for (let i = 0; i < nTr; i++) {
        const whale = rand() < 0.03;
        const base = def?.dailyVol ?? 20_000;
        const total = whale
          ? base * (0.015 + rand() * 0.05)
          : base * (0.0008 + rand() * 0.004);
        const p = newPrice * (1 + randn() * 0.0004);
        tradeData.push({
          pairId: pair.id,
          side: rand() > 0.5 ? "BUY" : "SELL",
          price: p,
          amount: total / p,
          total,
          source: whale ? "WHALE" : "AMBIENT",
          t: new Date(),
        });
      }
      const tickVol = tradeData.reduce((s, t) => s + t.total, 0);
      if (tradeData.length) await db.dexTrade.createMany({ data: tradeData });

      // נרות: עדכון/יצירת-הנר-הנוכחי בכל-tf
      for (const tf of Object.keys(TF_SECONDS) as Timeframe[]) {
        const b = bucket(nowSec, tf);
        const existing = await db.dexCandle.findUnique({
          where: { pairId_tf_t: { pairId: pair.id, tf, t: b } },
        });
        if (!existing) {
          await db.dexCandle.create({
            data: {
              pairId: pair.id,
              tf,
              t: b,
              o: pair.price,
              h: Math.max(pair.price, newPrice),
              l: Math.min(pair.price, newPrice),
              c: newPrice,
              v: tickVol,
            },
          });
        } else {
          await db.dexCandle.update({
            where: { id: existing.id },
            data: {
              h: Math.max(existing.h, newPrice),
              l: Math.min(existing.l, newPrice),
              c: newPrice,
              v: existing.v + tickVol,
            },
          });
        }
      }

      await db.dexPair.update({
        where: { id: pair.id },
        data: {
          price: newPrice,
          high24h: Math.max(pair.high24h, newPrice),
          low24h: Math.min(pair.low24h, newPrice),
        },
      });
    }

    // כל-75-טיקים (~10 דק׳): חישוב-מחדש-כנה של נפחים ו-open24h
    if (st.ticks % 75 === 0) {
      const dayAgo = new Date(Date.now() - 86_400_000);
      for (const pair of pairs) {
        const agg = await db.dexTrade.aggregate({
          _sum: { total: true },
          where: { pairId: pair.id, t: { gte: dayAgo } },
        });
        const vol24h = agg._sum.total ?? pair.vol24h;
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
            vol24h,
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
  } finally {
    st.busy = false;
  }
}

async function sumDays(n: number): Promise<number> {
  const from = Math.floor((Date.now() - n * 86_400_000) / 1000);
  const agg = await db.dexCandle.aggregate({
    _sum: { v: true },
    where: { tf: "1d", t: { gte: from } },
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
      // איפוס-וזריעה-מלאה
      await db.dexTrade.deleteMany();
      await db.dexCandle.deleteMany();
      await db.dexLpPosition.deleteMany();
      await db.dexLedger.deleteMany();
      await db.dexPair.deleteMany();
      const nowSec = Math.floor(Date.now() / 1000);
      for (const def of PAIRS) {
        await seedPair(def, nowSec);
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
      console.log("[dex-engine] seeded:", SEED_VERSION);
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
