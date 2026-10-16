// GET /api/giant/dex — מצב-מנוע-הדקס האמיתי (saos-dex/db — נמדד מהגיט)
// ═════════════════════════════════════════════════════════════════════════
// מקורות: state-snapshot.json (גובה · 20 חשבונות · pools · רווחי-אוצר · feeMeter)
// · dex-metrics.json (ווליום/עסקאות יומי) · klines.json (נרות OHLCV לכל-זוג)
// · grid-public.json (ARMED-LIVE). PAT שרת-בלבד; דגימת-נרות ל-180-אחרונים.
// כשל = כנה. cache 45 שניות.
import { NextResponse } from "next/server";
import { readPat } from "@/lib/office-truth";
import { loadTruth, MU, type FileMeta, type TruthPayload } from "@/lib/giant/truth";
import { ensureMiniServices } from "@/lib/mini-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: DexPayload } | null = null;
const CACHE_MS = 45_000;
const MAX_CANDLES = 180;

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vMu: number;
  qMu: number;
  n: number;
}
export interface AccountRow {
  name: string;
  balances: Record<string, number>;
}
export interface DayMetrics {
  day: string;
  beats: number;
  ticks: number;
  fills: number;
  swaps: number;
  height: number;
  vol24QuoteMu: number;
  trades24: number;
}
export interface DexPayload {
  ok: boolean;
  note?: string;
  savedAt: string | null;
  height: number | null;
  pairs: { name: string; candles: Candle[] }[];
  accounts: AccountRow[];
  assets: string[];
  poolPairs: { pair: string; reserves: { a: string; b: string; ra: number; rb: number } }[];
  treasuryProfit: number | null;
  treasuryProfitEver: number | null;
  feeMeter: number | null;
  ordersOpen: number | null;
  metrics: DayMetrics[];
  grid: { verdict: string; engine: string; chains: string[]; armed: boolean; real: boolean; publishedAt: string | null; hive: { ok: boolean; publishedAt: string | null } | null } | null;
  /* היצע-אמת: הכל מדוד ב-mu (אלפיות) — הממשק מציג יחידות-אנוש */
  supply: {
    accountsSaosMu: number;
    poolSaosMu: number;
    totalSaosMu: number;
    totalSaosHuman: number;
    capSaosHuman: number | null;
    genesisMintSaosHuman: number | null;
    pctOfCap: number | null;
    genesisNote: string | null;
  } | null;
  truth: TruthPayload | null;
  truthMeta: { saosLive: FileMeta; honestEcon: FileMeta; money: FileMeta } | null;
  /* גל-91 · נזילות-אמת: האוצר האמיתי על-השרשרת (mainnet · קריאה-ללא-מפתחות).
   * הצהרת-אמת: הדקס-הפנימי (SAOS/USDS) הוא-הספר; זה הגיבוי-הממשי מאחוריו. */
  chainTreasury: {
    measuredAt: string;
    accounts: number;
    liquidSteem: number;
    liquidSbd: number;
    spTotal: number;
    openOrders: number;
    source: "steem-mainnet";
  } | null;
  fetchedAt: string;
}

async function ghRaw<T>(repo: string, path: string, pat: string): Promise<T | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/roshpinacare-sys/${repo}/main/${path}`, {
      headers: { authorization: `Bearer ${pat}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface SnapState {
  height?: number;
  balances?: Record<string, Record<string, number>>;
  pools?: Record<string, { a?: string; b?: string; ra?: number; rb?: number }>;
  treasuryProfit?: number;
  treasuryProfitEver?: number;
  feeMeter?: number;
  orders?: unknown[];
  assets?: Record<string, unknown>;
}
interface Snap {
  savedAt?: string;
  state?: SnapState;
}
interface KlineFile {
  savedAt?: string;
  pairs?: Record<string, Candle[]>;
}
interface MetricsFile {
  updatedAt?: string;
  days?: Record<string, Record<string, number>>;
}
interface GridPublic {
  verdict?: string;
  engine?: string;
  chains?: string[];
  armed?: boolean;
  real?: boolean;
  publishedAt?: string;
  hive?: { ok?: boolean; publishedAt?: string };
}

/* גל-91 · קריאת-אוצר-אמת מ-Steem-מייננט (אפס-מפתחות · השמות-פומביים-על-השרשרת).
 * שמות-הצי = רוסטר-ה-custody הפומבי (14) — זהו-מידע-על-השרשרת-עצמה, לא-סוד.
 * כשל = null כנה; לעולם-לא-המצאה. */
const CHAIN_ROSTER = [
  "headcorner", "cashmachine", "haran", "israelnews", "lsa", "macrame", "siq",
  "tov", "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6",
];
async function readChainTreasury(): Promise<DexPayload["chainTreasury"]> {
  try {
    const rpc = async (method: string, params: unknown[]): Promise<{ result?: unknown }> => {
      const res = await fetch("https://api.steemit.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`rpc ${res.status}`);
      return (await res.json()) as { result?: unknown };
    };
    const [accRes, gpoRes] = await Promise.all([
      rpc("condenser_api.get_accounts", [CHAIN_ROSTER]),
      rpc("condenser_api.get_dynamic_global_properties", []),
    ]);
    const accounts = (accRes.result ?? []) as Array<Record<string, string>>;
    const gpo = (gpoRes.result ?? {}) as Record<string, string>;
    const tv = parseFloat(String(gpo.total_vesting_shares ?? "0"));
    const tf = parseFloat(String(gpo.total_vesting_fund_steem ?? "0"));
    const vestsPerSp = tf > 0 ? tv / tf : 0;
    let liquidSteem = 0;
    let liquidSbd = 0;
    let spTotal = 0;
    let openOrders = 0;
    for (const a of accounts) {
      liquidSteem += parseFloat(String(a.balance ?? "0")) || 0;
      liquidSbd += parseFloat(String(a.sbd_balance ?? "0")) || 0;
      const vests = parseFloat(String(a.vesting_shares ?? "0")) || 0;
      const delegated = parseFloat(String(a.delegated_vesting_shares ?? "0")) || 0;
      const received = parseFloat(String(a.received_vesting_shares ?? "0")) || 0;
      spTotal += vestsPerSp > 0 ? (vests - delegated + received) / vestsPerSp : 0;
      openOrders += Number(a.open_orders ?? 0) || 0;
    }
    if (!accounts.length) return null;
    return { measuredAt: new Date().toISOString(), accounts: accounts.length, liquidSteem, liquidSbd, spTotal, openOrders, source: "steem-mainnet" };
  } catch {
    return null;
  }
}

export async function loadDex(force = false): Promise<DexPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const pat = await readPat();
  const truth = loadTruth();
  const truthMeta = { saosLive: truth.meta.saosLive, honestEcon: truth.meta.honestEcon, money: truth.meta.money };
  const empty: DexPayload = {
    ok: false, note: "מצב-המנוע לא נמדד כרגע — נסה שוב", savedAt: null, height: null,
    pairs: [], accounts: [], assets: [], poolPairs: [], treasuryProfit: null,
    treasuryProfitEver: null, feeMeter: null, ordersOpen: null, metrics: [], grid: null,
    supply: null, truth, truthMeta, chainTreasury: null,
    fetchedAt: new Date().toISOString(),
  };
  if (!pat) return empty;

  const [snap, klines, metrics, grid, chainTreasury] = await Promise.all([
    ghRaw<Snap>("saos-dex", "db/state-snapshot.json", pat),
    ghRaw<KlineFile>("saos-dex", "db/klines.json", pat),
    ghRaw<MetricsFile>("saos-dex", "db/dex-metrics.json", pat),
    ghRaw<GridPublic>("saos-dex", "db/grid-public.json", pat),
    readChainTreasury(),
  ]);
  if (!snap?.state) return empty;

  const st = snap.state;
  const pairs = Object.entries(klines?.pairs ?? {}).map(([name, series]) => ({
    name,
    candles: Array.isArray(series) ? series.slice(-MAX_CANDLES) : [],
  }));
  pairs.sort((a, b) => b.candles.length - a.candles.length);

  const poolPairs = Object.entries(st.pools ?? {}).map(([pair, p]) => ({
    pair,
    reserves: { a: String(p.a ?? ""), b: String(p.b ?? ""), ra: Number(p.ra ?? 0), rb: Number(p.rb ?? 0) },
  }));

  /* היצע-אמת: SAOS בחשבונות + SAOS ב-pools — הכל mu; מוחזר גם ביחידות-אנוש */
  const accountsSaosMu = Object.values(st.balances ?? {}).reduce(
    (s, b) => s + (typeof b === "object" && b !== null && typeof (b as Record<string, unknown>).SAOS === "number" ? ((b as Record<string, number>).SAOS as number) : 0), 0,
  );
  const poolSaosMu = poolPairs.reduce(
    (s, p) => s + (p.reserves.a === "SAOS" ? p.reserves.ra : p.reserves.b === "SAOS" ? p.reserves.rb : 0), 0,
  );
  const totalSaosMu = accountsSaosMu + poolSaosMu;
  const capHuman = truth.genesis?.maxSupplyHuman ?? null;
  const mintHuman = truth.genesis?.initialMintHuman ?? null;
  const supply = {
    accountsSaosMu,
    poolSaosMu,
    totalSaosMu,
    totalSaosHuman: totalSaosMu / MU,
    capSaosHuman: capHuman,
    genesisMintSaosHuman: mintHuman,
    pctOfCap: capHuman && capHuman > 0 ? (totalSaosMu / MU / capHuman) * 100 : null,
    genesisNote: truth.genesis?.note ?? null,
  };

  /* תיקון-מפתחות-כפולים (גל-89, הוצהר-מחדש-גל-90 אחרי-clobber-ההתכנסות):
   * התאריך הוא מפתח-המפה ב-dex-metrics.json — בונה-המדדים לא מטמיע שדה-day,
   * והקריאה-הישנה d.day החזירה "" לכל-השורות → מפתחות-React כפולים.
   * מעתה: היום-נגזר-ממפתח-המפה; שורות-שלא-נפתרות-לתאריך מושמטות — כנות. */
  const days = Object.entries(metrics?.days ?? {})
    .map(([dayKey, d]) => ({
      day: String(d.day ?? "") || String(dayKey ?? ""),
      beats: Number(d.beats ?? 0),
      ticks: Number(d.ticks ?? 0),
      fills: Number(d.fills ?? d.dFills ?? 0),
      swaps: Number(d.swaps ?? d.dSwaps ?? 0),
      height: Number(d.height ?? d.dHeight ?? 0),
      vol24QuoteMu: Number(d.vol24QuoteMu ?? 0),
      trades24: Number(d.trades24 ?? 0),
    }))
    .filter((d) => d.day !== "")
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-7);

  const payload: DexPayload = {
    ok: true,
    savedAt: snap.savedAt ?? klines?.savedAt ?? null,
    height: typeof st.height === "number" ? st.height : null,
    pairs,
    accounts: Object.entries(st.balances ?? {}).map(([name, balances]) => ({ name, balances })),
    assets: Object.keys(st.assets ?? {}),
    poolPairs,
    treasuryProfit: typeof st.treasuryProfit === "number" ? st.treasuryProfit : null,
    treasuryProfitEver: typeof st.treasuryProfitEver === "number" ? st.treasuryProfitEver : null,
    feeMeter: typeof st.feeMeter === "number" ? st.feeMeter : null,
    ordersOpen: Array.isArray(st.orders) ? st.orders.length : null,
    metrics: days,
    grid: grid
      ? {
          verdict: grid.verdict ?? "",
          engine: grid.engine ?? "",
          chains: Array.isArray(grid.chains) ? grid.chains : [],
          armed: Boolean(grid.armed),
          real: Boolean(grid.real),
          publishedAt: grid.publishedAt ?? null,
          hive: grid.hive ? { ok: Boolean(grid.hive.ok), publishedAt: grid.hive.publishedAt ?? null } : null,
        }
      : null,
    supply,
    truth,
    truthMeta,
    chainTreasury,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  void ensureMiniServices(); /* המשגיחה-הפנימית — מחייה-מיני-שירותים-מתים (fire-and-forget, זול) */
  const data = await loadDex();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
