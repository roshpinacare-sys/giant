// giant DEX · גשר-סטים (server-only) — בריכות-נזילות אמת ל-STEEM ו-SBD + שסתום-הצמדה
// הוראת-הבעלים (trace 1a146513162051a5): "אני רוצה שהכל בדקס יהיה נזיל — נשתמש
// בשוק של סטימיט ועוד כדי לייצר את הזרימה הדרושה ביעילות ומהירות".
//
// חוקי-אמת (אותם-חוקי-בית כמו הסקטורים):
//  · כל-רזרבה עם רשומת-מנפק מהלדג'ר — אפס-רזרבה-ערמומית.
//  · מחיר-הבריכות מוצמד-לשוק-האמת (אורקל-חי: שוק-פנימי של סטים + סימני-USD מוצלבים).
//  · שסתום-הצמדה: כשהבריכה סוטה >0.75% מהאורקל — עסקת-תיקון-אמת (מנוע-ה-swap האחד,
//    לדג'ר-אמת) — זרימה-אמת, לא-תנועה-מבוימת.
//  · כשל-כנה: אורקל-לא-זמין → השסתום מדלג ומפרסם-זאת. לא-ממציאים.
//  · הסוכנים (fleet-loop) סוחרים-אוטומטית על הבריכות החדשות — ריבוי-בריכות קיים.

import { db } from "@/lib/db";
import { executeSwap } from "@/lib/dex-server";
import { steemMarketSnapshot, type SteemMarketSnapshot } from "@/lib/steem-feed";
import type { Timeframe } from "@/lib/dex-types";
import { TF_SECONDS } from "@/lib/dex-types";

/* ============================== הגדרות-גנזיס ============================== */

const BRIDGE_VERSION = "steem-bridge-v1-2026-10-16";

// מכשירי-הגישור: אסימוני-פנים-מנופקים-מתועדים, מחירם מוצמד-לשוק-האמת של סטים.
// לא-תביעה-על-שרשרת-סטים — החשיפה-האמתית (SP/נזיל) נמדדת-בנפרד (T93).
const STEEM_ISSUANCE = 30_000; // אסימוני-גישור STEEM
const SBD_ISSUANCE = 4_000; // אסימוני-גישור SBD

// מלאי-שסתום-ההצמדה (חשבון-BRIDGE) — דלק-לתיקוני-מחיר, מתועד-בלדג'ר
const BRIDGE_USDS = 5_000;
const BRIDGE_STEEM = 8_000;
const BRIDGE_SBD = 800;

const FEE_BPS = 30;
const PEG_TOLERANCE = 0.0075; // 0.75% סטייה → תיקון
const VALVE_MS = 10_000; // טיק-שסתום — 10 שניות (מהיר-ובטוח)
const MAX_CORRECTIVE_USDS = 400; // תקרת-עסקת-תיקון
const POOL_FRACTION_CAP = 0.006; // עד-0.6% מהרזרבה-בעסקה-אחת (קמעונאי-אמת)

/* ============================== גנזיס-הבריכות ============================== */

function bucket(tSec: number, tf: Timeframe): number {
  return Math.floor(tSec / TF_SECONDS[tf]) * TF_SECONDS[tf];
}

async function seedGenesisCandles(pairId: string, price: number, nowSec: number): Promise<void> {
  for (const tf of Object.keys(TF_SECONDS) as Timeframe[]) {
    await db.dexCandle.upsert({
      where: { pairId_tf_t: { pairId, tf, t: bucket(nowSec, tf) } },
      create: { pairId, tf, t: bucket(nowSec, tf), o: price, h: price, l: price, c: price, v: 0 },
      update: {},
    });
  }
}

async function seedBridgePool(args: {
  base: string;
  chain: string;
  issuance: number;
  oraclePrice: number;
  oracleNote: string;
  sort: number;
  nowSec: number;
}): Promise<void> {
  const { base, chain, issuance, oraclePrice, oracleNote, sort, nowSec } = args;
  const quote = issuance * oraclePrice;
  const pair = await db.dexPair.create({
    data: {
      base,
      quote: "USDS",
      chain,
      price: oraclePrice,
      openPrice24h: oraclePrice,
      high24h: oraclePrice,
      low24h: oraclePrice,
      reserveBase: issuance,
      reserveQuote: quote,
      feeBps: FEE_BPS,
      featured: true,
      isNative: true,
      sort,
    },
  });
  // לדג'ר: הנפקה-מתועדת + הפקדה-לבריכה — שקל-שקל
  await db.dexLedger.create({
    data: { account: "TREASURY", token: base, amount: issuance, reason: `הנפקת-גישור ${base} · מכשיר-פנימי-מוצמד-לשוק-האמת · ${oracleNote} · לא-תביעה-על-שרשרת-חוץ` },
  });
  await db.dexLedger.create({
    data: { account: "TREASURY", token: base, amount: -issuance, reason: `הפקדת-נזילות · בריכת ${base}/USDS` },
  });
  await db.dexLedger.create({
    data: { account: "TREASURY", token: "USDS", amount: -quote, reason: `מימון-בריכה · ${base}/USDS · מחיר-אורקל-גנזיס ${oraclePrice.toFixed(6)}` },
  });
  await db.dexLpPosition.create({
    data: { pairId: pair.id, owner: "TREASURY", shares: Math.sqrt(issuance * quote), baseAmount: issuance, quoteAmount: quote },
  });
  await seedGenesisCandles(pair.id, oraclePrice, nowSec);
}

export async function ensureSteemBridge(): Promise<void> {
  const cfg = await db.dexConfig.findUnique({ where: { key: "steemBridgeVersion" } });
  if (cfg?.value === BRIDGE_VERSION) return;

  // האורקל חייב-להיות-חי-בגנזיס — בלי-מחיר-אמת לא-זורעים (מנסה-שוב-בקריאה-הבאה)
  const snap = await steemMarketSnapshot();
  if (!snap.oracle.fresh || snap.oracle.steemUsds === null || snap.oracle.sbdUsds === null) {
    await publishHealth({ lastError: "גנזיס-נדחה: אורקל-סטים-לא-זמין-כרגע (ניסיון-חוזר-בקריאה-הבאה)" });
    return;
  }
  const snapNote = `אורקל ${snap.usd.source ?? "?"} · STEEM=$${snap.oracle.steemUsds.toFixed(4)} · SBD=$${snap.oracle.sbdUsds.toFixed(4)}`;
  const nowSec = Math.floor(Date.now() / 1000);

  // --- בריכת STEEM/USDS ---
  const steemExisting = await db.dexPair.findUnique({ where: { base_quote: { base: "STEEM", quote: "USDS" } } });
  if (!steemExisting) {
    await seedBridgePool({
      base: "STEEM",
      chain: "Steem · oracle-peg",
      issuance: STEEM_ISSUANCE,
      oraclePrice: snap.oracle.steemUsds,
      oracleNote: snapNote,
      sort: 30,
      nowSec,
    });
  }
  // --- בריכת SBD/USDS ---
  const sbdExisting = await db.dexPair.findUnique({ where: { base_quote: { base: "SBD", quote: "USDS" } } });
  if (!sbdExisting) {
    await seedBridgePool({
      base: "SBD",
      chain: "Steem · oracle-peg",
      issuance: SBD_ISSUANCE,
      oraclePrice: snap.oracle.sbdUsds,
      oracleNote: snapNote,
      sort: 31,
      nowSec,
    });
  }

  // --- מלאי-שסתום-ההצמדה (פעם-אחת, מתועד) ---
  const bridgeMarked = await db.dexConfig.findUnique({ where: { key: "steemBridgeInventoryAt" } });
  if (!bridgeMarked) {
    const inv = [
      { token: "USDS", amount: BRIDGE_USDS },
      { token: "STEEM", amount: BRIDGE_STEEM },
      { token: "SBD", amount: BRIDGE_SBD },
    ];
    for (const i of inv) {
      await db.dexLedger.create({
        data: { account: "BRIDGE", token: i.token, amount: i.amount, reason: `מלאי-שסתום-הצמדה · גשר-סטים · דלק-לתיקוני-מחיר-אמת · ${snapNote}` },
      });
    }
    await db.dexConfig.upsert({
      where: { key: "steemBridgeInventoryAt" },
      create: { key: "steemBridgeInventoryAt", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
  }

  await db.dexConfig.upsert({
    where: { key: "steemBridgeVersion" },
    create: { key: "steemBridgeVersion", value: BRIDGE_VERSION },
    update: { value: BRIDGE_VERSION },
  });
  await db.dexConfig.upsert({
    where: { key: "steemBridgeLaunchedAt" },
    create: { key: "steemBridgeLaunchedAt", value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  console.log("[steem-bridge] genesis seeded:", BRIDGE_VERSION, "·", snapNote);
}

/* ============================== שסתום-ההצמדה ============================== */

interface ValveAction {
  pair: string;
  side: "BUY" | "SELL";
  amountIn: number;
  outAmount: number;
  devPct: number;
  poolPrice: number;
  target: number;
  at: string;
}

export interface SteemBridgeHealth {
  valveRunning: boolean;
  runs: number;
  actions: number;
  skippedOracle: number;
  lastRunAt: string | null;
  lastAction: ValveAction | null;
  lastError: string | null;
  genesisNote?: string;
}

const gV = globalThis as unknown as { __steemValve?: { timer: ReturnType<typeof setInterval> | null; busy: boolean; health: SteemBridgeHealth } };

function valveState() {
  if (!gV.__steemValve) {
    gV.__steemValve = {
      timer: null,
      busy: false,
      health: { valveRunning: false, runs: 0, actions: 0, skippedOracle: 0, lastRunAt: null, lastAction: null, lastError: null },
    };
  }
  return gV.__steemValve;
}

async function publishHealth(patch?: Partial<SteemBridgeHealth>): Promise<void> {
  const st = valveState();
  if (patch) st.health = { ...st.health, ...patch };
  try {
    await db.dexConfig.upsert({
      where: { key: "steemBridgeHealth" },
      create: { key: "steemBridgeHealth", value: JSON.stringify(st.health) },
      update: { value: JSON.stringify(st.health) },
    });
  } catch { /* פרסום-נכשל — השסתום ממשיך */ }
}

interface BridgeBalances { USDS: number; STEEM: number; SBD: number }

async function bridgeBalances(): Promise<BridgeBalances> {
  const rows = await db.dexLedger.groupBy({
    by: ["token"],
    _sum: { amount: true },
    where: { account: "BRIDGE", token: { in: ["USDS", "STEEM", "SBD"] } },
  });
  const m = new Map(rows.map((r) => [r.token, r._sum.amount ?? 0]));
  return { USDS: m.get("USDS") ?? 0, STEEM: m.get("STEEM") ?? 0, SBD: m.get("SBD") ?? 0 };
}

async function correctPool(args: {
  pairId: string;
  base: string;
  price: number;
  reserveBase: number;
  reserveQuote: number;
  target: number;
  balances: BridgeBalances;
}): Promise<ValveAction | { skip: string }> {
  const { pairId, base, price, reserveBase, reserveQuote, target, balances } = args;
  const devPct = price / target - 1; // >0 = הבריכה-יקרה · <0 = זולה
  if (Math.abs(devPct) < PEG_TOLERANCE) return { skip: "בטווח-הצמדה" };
  if (!Number.isFinite(target) || target <= 0) return { skip: "יעד-לא-חוקי" };

  const cap = Math.min(reserveQuote * POOL_FRACTION_CAP, MAX_CORRECTIVE_USDS);
  if (cap < 1) return { skip: "בריכה-קטנה-מכדי-תיקון" };

  if (devPct < 0) {
    // הבריכה-זולה-מהשוק → קונים-STEEM מהבריכה (דוחף-את-המחיר-מעלה)
    const amountIn = Math.min(cap, balances.USDS * 0.5);
    if (amountIn < 1) return { skip: "אין-דלק-USDS" };
    const res = await executeSwap({
      pairId, side: "BUY", amountIn, slippagePct: 1.5, source: "BRIDGE", account: "BRIDGE",
    });
    if ("error" in res) return { skip: `BUY: ${res.error}` };
    return { pair: `${base}/USDS`, side: "BUY", amountIn, outAmount: res.quote.outAmount, devPct, poolPrice: price, target, at: new Date().toISOString() };
  }
  // הבריכה-יקרה-מהשוק → מוכרים-STEEM לבריכה (מוריד-את-המחיר)
  const baseSellCap = cap / price; // שווה-ערך-בבסיס
  const amountIn = Math.min(baseSellCap, balances[base as "STEEM" | "SBD"] * 0.5);
  if (amountIn * price < 1) return { skip: "אין-דלק-בסיס" };
  const res = await executeSwap({
    pairId, side: "SELL", amountIn, slippagePct: 1.5, source: "BRIDGE", account: "BRIDGE",
  });
  if ("error" in res) return { skip: `SELL: ${res.error}` };
  return { pair: `${base}/USDS`, side: "SELL", amountIn, outAmount: res.quote.outAmount, devPct, poolPrice: price, target, at: new Date().toISOString() };
}

async function valveTick(): Promise<void> {
  const st = valveState();
  if (st.busy) return;
  st.busy = true;
  try {
    const snap: SteemMarketSnapshot | null = await steemMarketSnapshot();
    st.health.lastRunAt = new Date().toISOString();
    if (!snap?.oracle.fresh || snap.oracle.steemUsds === null || snap.oracle.sbdUsds === null) {
      st.health.skippedOracle += 1;
      st.health.lastError = null; // אורקל-לא-זמין זה-לא-שגיאה — זה-מצב-כנה
      await publishHealth();
      return;
    }
    const targets = new Map<string, number>([
      ["STEEM", snap.oracle.steemUsds],
      ["SBD", snap.oracle.sbdUsds],
    ]);
    const pairs = await db.dexPair.findMany({
      where: { isNative: true, base: { in: ["STEEM", "SBD"] }, quote: "USDS" },
    });
    const balances = await bridgeBalances();
    for (const pair of pairs) {
      const target = targets.get(pair.base);
      if (!target || !Number.isFinite(pair.price) || pair.price <= 0) continue;
      if (Date.now() - snap.at > 120_000) break; // אורקל-מזדקן — מדלגים-בכנות
      const r = await correctPool({
        pairId: pair.id,
        base: pair.base,
        price: pair.price,
        reserveBase: pair.reserveBase,
        reserveQuote: pair.reserveQuote,
        target,
        balances,
      });
      if ("skip" in r) continue;
      st.health.actions += 1;
      st.health.lastAction = r;
      // הדלק-התעדכן אחרי-עסקה
      const fresh = await bridgeBalances();
      balances.USDS = fresh.USDS;
      balances.STEEM = fresh.STEEM;
      balances.SBD = fresh.SBD;
    }
    await publishHealth();
  } catch (err) {
    st.health.lastError = err instanceof Error ? err.message : String(err);
    await publishHealth();
  } finally {
    st.busy = false;
  }
}

export function startSteemValve(): void {
  const st = valveState();
  if (st.timer) return;
  st.health.valveRunning = true;
  st.timer = setInterval(() => void valveTick(), VALVE_MS);
  setTimeout(() => void valveTick(), 4_000);
}

export function steemValveStatus(): SteemBridgeHealth {
  return { ...valveState().health };
}
