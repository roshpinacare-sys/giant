// GET /api/giant/league — ליגת-הענקים · המופע-החי של שולחן-הענקים (R75, קנון Console/Domain)
// ═════════════════════════════════════════════════════════════════════════════════
// אותו-אמת של הקנון, נמדדת-חי: DefiLlama keyless (overview/fees + overview/dexs) —
// אפס-מפתחות · אפס-המצאות · fail-closed. השורה-שלנו נמדדת מספר-המנוע החי
// (loadDex) עם כנות-מלאה: יחידות-פנימיות, אין ערך-חוץ. cache 5 דקות.
import { NextResponse } from "next/server";
import { loadDex } from "@/app/api/giant/dex/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FEES_URL =
  "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const DEXS_URL =
  "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";

let cache: { at: number; data: LeaguePayload } | null = null;
const CACHE_MS = 300_000;

/** הליגה הקנונית — אותן-משפחות של שולחן-הענקים (R75). שום-משפחה לא מומצאת:
 *  מי שלא נמצא בפיד — פשוט לא מופיע. */
const GIANT_NAMES = [
  "Uniswap", "Hyperliquid", "Meteora", "Lido", "Aave", "Sky", "Raydium",
  "Morpho", "Ethena", "Jupiter", "PancakeSwap", "Aerodrome", "Orca", "Phantom",
  "GMX", "Kamino", "MetaMask", "Curve", "OKX", "THORChain", "CoW Protocol",
  "Trust Wallet", "Pendle", "dYdX", "1inch",
] as const;

function tierHe(category: unknown): string {
  const c = String(category ?? "").toLowerCase();
  if (c.includes("dex")) return "DEX";
  if (c.includes("derivatives") || c.includes("perpetual") || c.includes("basis")) return "נגזרים";
  if (c.includes("staking")) return "סטייקינג";
  if (c.includes("lending") || c.includes("cdp")) return "הלוואות";
  if (c.includes("yield")) return "תשואות";
  if (c.includes("aggregator")) return "אגרגטור";
  if (c.includes("wallet") || c.includes("wallets")) return "ארנק";
  if (c.includes("bridge")) return "גשר";
  if (c.includes("options")) return "אופציות";
  if (c.includes("liquidity")) return "נזילות";
  if (c.includes("chain")) return "שרשרת";
  return category ? String(category) : "—";
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface LlamaRow {
  name?: string;
  slug?: string;
  category?: string;
  total24h?: number | null;
  total30d?: number | null;
  totalAllTime?: number | null;
  tvl?: number | null;
}

async function fetchLlama(url: string): Promise<LlamaRow[]> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const d = (await res.json()) as { protocols?: LlamaRow[] };
    return d.protocols ?? [];
  } catch {
    return [];
  }
}

export interface LeagueRow {
  name: string;
  tier: string;
  fees24: number | null;
  fees30: number | null;
  vol24: number | null;
  allTime: number | null;
}
export interface OursRow {
  vol24Mu: number | null;
  trades24: number | null;
  externalValueUsd: number;
  height: number | null;
  armed: boolean;
}
export interface LeaguePayload {
  ok: boolean;
  note?: string;
  rows: LeagueRow[];
  ours: OursRow | null;
  source: string;
  fetchedAt: string;
}

export async function loadLeague(force = false): Promise<LeaguePayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const [feesRows, dexRows] = await Promise.all([fetchLlama(FEES_URL), fetchLlama(DEXS_URL)]);
  // פידים-נפרדים לחלוטין: ב-overview/dexs ה-total30d הוא ווליום — אסור לערבב
  // אותו עם עמלות (נמדד: הערבוב ייצר "Jupiterz" עם ווליום-חודש כעמלות).
  const feesBySlug = new Map<string, LlamaRow>();
  for (const r of feesRows) {
    const s = normName(String(r.slug ?? r.name ?? ""));
    if (s && !feesBySlug.has(s)) feesBySlug.set(s, r);
  }
  const dexsBySlug = new Map<string, LlamaRow>();
  for (const r of dexRows) {
    const s = normName(String(r.slug ?? r.name ?? ""));
    if (s && !dexsBySlug.has(s)) dexsBySlug.set(s, r);
  }

  /** הפיד מכיל תת-רשומות (Uniswap V4 · Aave V3 · Hyperliquid Perps…) —
   *  דיוק-קנון: התאמה-מדויקת של ההורה קודמת; בלעדיה — הגדולה לפי עמלות-30-יום. */
  function pickParent(map: Map<string, LlamaRow>, giant: string): LlamaRow | null {
    const g = normName(giant);
    const alias = giant === "CoW Protocol" ? "cow" : null; // פיד: CoW Swap / CoW Protocol
    const exact = map.get(g) ?? (alias ? map.get(alias) : undefined);
    if (exact) return exact;
    const candidates = [...map.entries()].filter(
      ([k]) => k.startsWith(g) || (alias ? k.includes(alias) : false),
    );
    if (candidates.length === 0) return null;
    return candidates.reduce(
      (best, [, r]) => ((r.total30d ?? r.totalAllTime ?? 0) > (best.total30d ?? best.totalAllTime ?? 0) ? r : best),
      candidates[0][1],
    );
  }

  const rows: LeagueRow[] = [];
  for (const giant of GIANT_NAMES) {
    const feesHit = pickParent(feesBySlug, giant);
    const dexHit = pickParent(dexsBySlug, giant);
    if (!feesHit && !dexHit) continue; // כנות: לא נמצא בפיד = לא מופיע
    const name = String(feesHit?.name ?? dexHit?.name ?? giant);
    const volFromDex = dexHit && typeof dexHit.total24h === "number" ? dexHit.total24h : null;
    rows.push({
      name,
      tier: tierHe(feesHit?.category ?? dexHit?.category),
      fees24: feesHit && typeof feesHit.total24h === "number" ? feesHit.total24h : null,
      fees30: feesHit && typeof feesHit.total30d === "number" ? feesHit.total30d : null,
      vol24: volFromDex,
      allTime: feesHit && typeof feesHit.totalAllTime === "number" ? feesHit.totalAllTime : null,
    });
  }

  // השורה-שלנו — נמדדת מספר-המנוע החי · כנות-מלאה: יחידות-פנימיות, אין ערך-חוץ
  let ours: OursRow | null = null;
  try {
    const dex = await loadDex();
    const day = dex.metrics?.[0] ?? null;
    ours = {
      vol24Mu: day ? day.vol24QuoteMu : null,
      trades24: day ? day.trades24 : null,
      externalValueUsd: 0, // האמת-המלאה: ספר-סגור, אין ביד-חוץ
      height: dex.height,
      armed: Boolean(dex.grid?.armed),
    };
  } catch {
    ours = null;
  }

  rows.sort((a, b) => (b.fees30 ?? 0) - (a.fees30 ?? 0));
  const payload: LeaguePayload = {
    ok: rows.length > 0,
    note: rows.length > 0 ? undefined : "הליגה לא נמדדה כרגע — הפיד הציבורי לא נגיש (fail-closed, אפס-המצאה)",
    rows,
    ours,
    source: "api.llama.fi · keyless · daily feeds",
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadLeague();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
