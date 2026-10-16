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

/* ═══ R365-money-truth: מדידת-כסף-אמת-חיה-מהשרשרת ═══
 * הבעלים: "איפה הכסף? זה לא מוצג" — נמדד: הכרטיס הציג רק STEEM/SBD נזיל ($23)
 * והנכס-האמיתי-הגדול (SP · נעול-וסטינג) לא הוצג כלל. מדידה-חיה get_accounts +
 * get_dynamic_global_properties; מטמון 10 דק'; כשל = השורות-הישנות נשארות (fail-honest). */
interface SteemTruth {
  at: number;
  liquid: number | null;
  sbd: number | null;
  ownSp: number | null;
  delegatedOutSp: number | null;
}
let steemTruthCache: SteemTruth | null = null;
const STEEM_TRUTH_MS = 10 * 60_000;

function rpcNum(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
}

async function steemTruth(): Promise<SteemTruth | null> {
  if (steemTruthCache && Date.now() - steemTruthCache.at < STEEM_TRUTH_MS) return steemTruthCache;
  try {
    const rpc = (method: string, params: unknown[]) =>
      fetch("https://api.steemit.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      }).then((r) => (r.ok ? (r.json() as Promise<{ result?: unknown }>) : null));
    const [accRes, dgpRes] = await Promise.all([
      rpc("condenser_api.get_accounts", [["headcorner"]]),
      rpc("condenser_api.get_dynamic_global_properties", []),
    ]);
    const acc = (accRes?.result as Array<Record<string, string>> | undefined)?.[0];
    const dgp = dgpRes?.result as Record<string, string> | undefined;
    if (!acc) return steemTruthCache;
    const totalVests = rpcNum(dgp?.total_vesting_shares);
    const totalFund = rpcNum(dgp?.total_vesting_fund_steem);
    const spPerVest = Number.isFinite(totalVests) && Number.isFinite(totalFund) && totalVests > 0 ? totalFund / totalVests : NaN;
    const ownVests = rpcNum(acc.vesting_shares) - rpcNum(acc.delegated_vesting_shares) + rpcNum(acc.received_vesting_shares);
    const t: SteemTruth = {
      at: Date.now(),
      liquid: Number.isFinite(rpcNum(acc.balance)) ? rpcNum(acc.balance) : null,
      sbd: Number.isFinite(rpcNum(acc.sbd_balance)) ? rpcNum(acc.sbd_balance) : null,
      ownSp: Number.isFinite(spPerVest) && Number.isFinite(ownVests) ? ownVests * spPerVest : null,
      delegatedOutSp: Number.isFinite(spPerVest) && Number.isFinite(rpcNum(acc.delegated_vesting_shares)) ? rpcNum(acc.delegated_vesting_shares) * spPerVest : null,
    };
    steemTruthCache = t;
    return t;
  } catch {
    return steemTruthCache;
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

export async function loadDex(force = false): Promise<DexPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const pat = await readPat();
  let truth = loadTruth();
  const truthMeta = { saosLive: truth.meta.saosLive, honestEcon: truth.meta.honestEcon, money: truth.meta.money };

  /* R365-money-truth: שורות-כסף-אמת-חיות-מהשרשרת — נזיל-טרי + ה-SP (הנכס-הגדול) שלא-הוצג כלל.
   * סימוני-USD נלקחים-מהשורות-הקיימות (מטמון-המוניטור); כשל-RPC = השורות-הקיימות נשארות (fail-honest). */
  const chainMoney = await steemTruth();
  if (chainMoney && (chainMoney.liquid !== null || chainMoney.sbd !== null || chainMoney.ownSp !== null)) {
    const steemMark = truth.realMoney.lines.find((l) => l.asset.startsWith("STEEM"))?.markUsd ?? null;
    const sbdMark = truth.realMoney.lines.find((l) => l.asset.startsWith("SBD"))?.markUsd ?? null;
    const fresh: typeof truth.realMoney.lines = [];
    if (chainMoney.liquid !== null) fresh.push({ asset: "STEEM · headcorner-נזיל", amount: chainMoney.liquid, markUsd: steemMark, usd: steemMark !== null ? chainMoney.liquid * steemMark : null, source: "chain-live · get_accounts" });
    if (chainMoney.sbd !== null) fresh.push({ asset: "SBD · headcorner-נזיל", amount: chainMoney.sbd, markUsd: sbdMark, usd: sbdMark !== null ? chainMoney.sbd * sbdMark : null, source: "chain-live · get_accounts" });
    if (chainMoney.ownSp !== null) fresh.push({ asset: "SP · headcorner (נעול-וסטינג)", amount: chainMoney.ownSp, markUsd: steemMark, usd: steemMark !== null ? chainMoney.ownSp * steemMark : null, source: chainMoney.delegatedOutSp !== null ? `chain-live · מופקד-החוצה ${chainMoney.delegatedOutSp.toFixed(0)} SP` : "chain-live · get_accounts" });
    if (fresh.length > 0) {
      truth = { ...truth, realMoney: { lines: fresh, totalUsd: fresh.reduce((s, l) => s + (l.usd ?? 0), 0), marksAt: truth.realMoney.marksAt } };
    }
  }
  const empty: DexPayload = {
    ok: false, note: "מצב-המנוע לא נמדד כרגע — נסה שוב", savedAt: null, height: null,
    pairs: [], accounts: [], assets: [], poolPairs: [], treasuryProfit: null,
    treasuryProfitEver: null, feeMeter: null, ordersOpen: null, metrics: [], grid: null,
    supply: null, truth, truthMeta,
    fetchedAt: new Date().toISOString(),
  };
  if (!pat) return empty;

  const [snap, klines, metrics, grid] = await Promise.all([
    ghRaw<Snap>("saos-dex", "db/state-snapshot.json", pat),
    ghRaw<KlineFile>("saos-dex", "db/klines.json", pat),
    ghRaw<MetricsFile>("saos-dex", "db/dex-metrics.json", pat),
    ghRaw<GridPublic>("saos-dex", "db/grid-public.json", pat),
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

  /* R364-fix: היום חי-במפתח-הרשומה (המנוע כותב day:null/חסר בשורה-החיה —
   * נמדד-חי: רק 2026-10-13 נשא day, השאר חסרים → 3 שורות מפתח "" → דריסת-מפתחות-ריאקט).
   * היום נלקח-מהמפתח; שורות-חלקיות (יום-ריק) נפלטות — כנות, לא-קריסה, לא-המצאה. */
  const days = Object.entries(metrics?.days ?? {})
    .map(([dayKey, d]) => ({
      day: String(d.day ?? dayKey ?? "").trim(),
      beats: Number(d.beats ?? 0),
      ticks: Number(d.ticks ?? 0),
      fills: Number(d.fills ?? d.dFills ?? 0),
      swaps: Number(d.swaps ?? d.dSwaps ?? 0),
      height: Number(d.height ?? d.dHeight ?? 0),
      vol24QuoteMu: Number(d.vol24QuoteMu ?? 0),
      trades24: Number(d.trades24 ?? 0),
    }))
    .filter((d) => d.day.length > 0)
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
