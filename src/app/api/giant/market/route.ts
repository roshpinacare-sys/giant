/**
 * GET /api/giant/market — דקס: מרכז-הכובד (GIANT · R360)
 *
 * מטבעות-גדולים ורשתות-מוכרות (BTC·ETH·SOL·USDT — CoinGecko ציבורי, מדיד-חי).
 * הדק-הריבוני: essentials מהגיט המקומי (Domain/dex/state.json) — גובה, fills,
 * swaps, סולמות, הזמנות-חיות, רווח-ספר (SIM מתויג R74), היפוך, דחיות-בלוק-אחרון.
 * steem/hive = שכבת-עגין-מושתקת בלבד.
 * כשל = כנה (fail-honest); אפס מספרים-מצוירים. cache-זיכרון 60 שניות.
 */
import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileMeta, type FileMeta } from "@/lib/sovereign/channel";
import { DOMAIN_DIR, DATA_DIR } from "@/lib/giant/truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; data: MarketPayload } | null = null;
const CACHE_MS = 60_000;

export interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  vol24hUsd: number | null;
}

export interface AssetRow {
  symbol: string;
  refPrice: number | null;
  listed: number | null;
}

export interface DexEssentials {
  engine: string | null;
  publishedAt: string | null;
  runAt: string | null;
  ticks: number | null;
  cadenceMin: number | null;
  height: number | null;
  tps: number | null;
  opsTotal: number | null;
  fills: number | null;
  swaps: number | null;
  ladders: number | null;
  liveOrders: number | null;
  treasuryProfitSim: number | null;
  feeMeterMu: number | null;
  gasFundedMu: number | null;
  halted: boolean | null;
  haltReason: string | null;
  dbOk: boolean | null;
  rejectedLastHeight: number | null;
  rejectedLastCount: number | null;
  tickMs: number | null;
  backingWsteem: number | null;
  backingWsbd: number | null;
}

export interface MarketPayload {
  ok: boolean;
  note?: string;
  source: string | null;
  cachedAgeMin: number | null;
  coins: CoinRow[];
  anchors: { name: string; note: string }[];
  dex: DexEssentials | null;
  assets: AssetRow[];
  dexMeta: FileMeta;
  fetchedAt: string;
}

const COINS: Array<{ id: string; symbol: string; name: string }> = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "tether", symbol: "USDT", name: "Tether" },
];

const CACHE_PATH = path.join(DATA_DIR, "market-cache.json");
const CACHE_FRESH_MS = 30 * 60_000; // מטמון-כנות: עד 30 דקות עם גיל-מוצהר

interface KrakenTick {
  c?: string[];
  v?: string[];
  o?: string;
}

async function krakenCoins(): Promise<CoinRow[] | null> {
  try {
    const res = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,USDTUSD", {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: Record<string, KrakenTick> };
    const r = j.result;
    if (!r || typeof r !== "object") return null;
    const pick = (needle: string): KrakenTick | undefined => Object.entries(r).find(([k]) => k.startsWith(needle))?.[1];
    const row = (symbol: string, name: string, id: string, t: KrakenTick | undefined): CoinRow => {
      const last = t?.c?.[0] !== undefined ? parseFloat(t.c[0]) : null;
      const open = t?.o !== undefined ? parseFloat(t.o) : null;
      const base24 = t?.v?.[1] !== undefined ? parseFloat(t.v[1]) : null;
      return {
        id,
        symbol,
        name,
        priceUsd: last !== null && Number.isFinite(last) ? last : null,
        change24h: last !== null && open !== null && open > 0 && Number.isFinite(last) ? ((last - open) / open) * 100 : null,
        vol24hUsd: last !== null && base24 !== null && Number.isFinite(base24) ? last * base24 : null, // נגזר-חישובית משני-מדידים
      };
    };
    const coins = [
      row("BTC", "Bitcoin", "bitcoin", pick("XXBT")),
      row("ETH", "Ethereum", "ethereum", pick("XETH")),
      row("SOL", "Solana", "solana", pick("SOL")),
      row("USDT", "Tether", "tether", pick("USDT")),
    ];
    return coins.some((c) => c.priceUsd !== null) ? coins : null;
  } catch {
    return null;
  }
}

async function binanceCoins(): Promise<CoinRow[] | null> {
  const pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "USDCUSDT"];
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ symbol?: string; lastPrice?: string; priceChangePercent?: string; quoteVolume?: string }>;
    const by = new Map(rows.map((r) => [r.symbol ?? "", r]));
    const binance = (id: string, symbol: string, name: string, price: string | undefined): CoinRow => ({
      id,
      symbol,
      name,
      priceUsd: price !== undefined && Number.isFinite(parseFloat(price)) ? parseFloat(price) : null,
      change24h: by.get(`${symbol}USDT`)?.priceChangePercent !== undefined ? parseFloat(by.get(`${symbol}USDT`)?.priceChangePercent as string) : null,
      vol24hUsd: by.get(`${symbol}USDT`)?.quoteVolume !== undefined ? parseFloat(by.get(`${symbol}USDT`)?.quoteVolume as string) : null,
    });
    const usdcRow = by.get("USDCUSDT");
    const usdtPrice = usdcRow?.lastPrice !== undefined && Number.isFinite(parseFloat(usdcRow.lastPrice)) ? 1 / parseFloat(usdcRow.lastPrice) : null;
    const coins = [
      binance("bitcoin", "BTC", "Bitcoin", by.get("BTCUSDT")?.lastPrice),
      binance("ethereum", "ETH", "Ethereum", by.get("ETHUSDT")?.lastPrice),
      binance("solana", "SOL", "Solana", by.get("SOLUSDT")?.lastPrice),
      { id: "tether", symbol: "USDT", name: "Tether", priceUsd: usdtPrice, change24h: null, vol24hUsd: null },
    ];
    return coins.some((c) => c.priceUsd !== null) ? coins : null;
  } catch {
    return null;
  }
}

async function geckoCoins(): Promise<CoinRow[] | null> {
  const ids = COINS.map((c) => c.id).join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
      { cache: "no-store", signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const p = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }>;
    const coins = COINS.map((c) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      priceUsd: typeof p[c.id]?.usd === "number" ? (p[c.id].usd as number) : null,
      change24h: typeof p[c.id]?.usd_24h_change === "number" ? (p[c.id].usd_24h_change as number) : null,
      vol24hUsd: typeof p[c.id]?.usd_24h_vol === "number" ? (p[c.id].usd_24h_vol as number) : null,
    }));
    return coins.some((c) => c.priceUsd !== null) ? coins : null;
  } catch {
    return null;
  }
}

async function readCache(): Promise<{ coins: CoinRow[]; ageMin: number } | null> {
  try {
    const raw = JSON.parse(await readFile(CACHE_PATH, "utf8")) as { at?: number; coins?: CoinRow[] };
    if (!raw?.at || !Array.isArray(raw.coins)) return null;
    const ageMin = Math.round((Date.now() - raw.at) / 60000);
    if (ageMin > 24 * 60) return null;
    return { coins: raw.coins, ageMin };
  } catch {
    return null;
  }
}

async function writeCache(coins: CoinRow[]): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify({ at: Date.now(), coins }), "utf8");
  } catch {
    /* אפס-שקר: כשל-מטמון לא מפיק מספרים */
  }
}

async function coinsLive(): Promise<{ coins: CoinRow[]; source: string | null; cachedAgeMin: number | null }> {
  // שרשרת-מקורות: Kraken → Binance → CoinGecko → מטמון-כנות (עם גיל-מוצהר) → null.
  // ה-IP-המשותף נחסם לסירוגין (418/429) — לכן שרשרת + מטמון; אפס מספרים-מצוירים.
  for (const [fn, source] of [
    [krakenCoins, "Kraken"],
    [binanceCoins, "Binance"],
    [geckoCoins, "CoinGecko"],
  ] as const) {
    const coins = await fn();
    if (coins) {
      void writeCache(coins);
      return { coins, source, cachedAgeMin: null };
    }
  }
  const cache = await readCache();
  if (cache) return { coins: cache.coins, source: "מטמון-כנות", cachedAgeMin: cache.ageMin };
  return { coins: COINS.map((c) => ({ ...c, priceUsd: null, change24h: null, vol24hUsd: null })), source: null, cachedAgeMin: null };
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function dexEssentials(): Promise<{ dex: DexEssentials | null; assets: AssetRow[]; meta: FileMeta }> {
  const meta = await fileMeta(path.join(DOMAIN_DIR, "dex", "state.json"));
  if (!meta.exists) return { dex: null, assets: [], meta };
  try {
    const raw = JSON.parse(await readFile(path.join(DOMAIN_DIR, "dex", "state.json"), "utf8")) as Record<string, unknown>;
    const beat = (raw.beat ?? {}) as Record<string, unknown>;
    const st = (raw.state ?? {}) as Record<string, unknown>;
    const rej = (st.rejectedLast ?? {}) as Record<string, unknown>;
    const backing = (st.backing ?? {}) as Record<string, unknown>;
    const assetsRaw = (st.assets ?? {}) as Record<string, { refPrice?: number; listed?: number }>;

    const dex: DexEssentials = {
      engine: s(beat.engine),
      publishedAt: s(raw.publishedAt),
      runAt: s(beat.runAt),
      ticks: n(beat.ticks),
      cadenceMin: n(beat.cadenceMin),
      height: n(st.height),
      tps: n(st.tps),
      opsTotal: n(st.opsTotal),
      fills: n(st.fills),
      swaps: n(st.swaps),
      ladders: n(st.ladders),
      liveOrders: n(st.liveOrders),
      treasuryProfitSim: n(st.treasuryProfit),
      feeMeterMu: n(st.feeMeter),
      gasFundedMu: n(st.gasFundedMu),
      halted: typeof st.halted === "boolean" ? st.halted : null,
      haltReason: s(st.haltReason),
      dbOk: typeof st.dbOk === "boolean" ? st.dbOk : null,
      rejectedLastHeight: n(rej.h),
      rejectedLastCount: n(rej.count),
      tickMs: n(st.tickMs),
      backingWsteem: n(backing.WSTEEM),
      backingWsbd: n(backing.WSBD),
    };

    const assets: AssetRow[] = Object.entries(assetsRaw)
      .map(([symbol, a]) => ({ symbol, refPrice: n(a?.refPrice), listed: n(a?.listed) }))
      .sort((x, y) => (x.symbol === "SAOS" ? -1 : y.symbol === "SAOS" ? 1 : x.symbol.localeCompare(y.symbol)));

    return { dex, assets, meta };
  } catch {
    return { dex: null, assets: [], meta };
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data, { headers: { "cache-control": "no-store" } });
  }
  const [coinPack, dexPack] = await Promise.all([coinsLive(), dexEssentials()]);
  const okCoins = coinPack.coins.some((c) => c.priceUsd !== null);
  const payload: MarketPayload = {
    ok: okCoins || dexPack.dex !== null,
    note:
      okCoins || dexPack.dex !== null
        ? undefined
        : "לא נמדד כרגע — אפס מספרים-מצוירים (fail-honest)",
    source: coinPack.source,
    cachedAgeMin: coinPack.cachedAgeMin,
    coins: coinPack.coins,
    anchors: [
      { name: "STEEM", note: "שכבת-עגין-ראיות — לא-חזית" },
      { name: "HIVE", note: "שכבת-עגין-ראיות — לא-חזית" },
      { name: "BLURT", note: "שכבת-עגין-ראיות — לא-חזית" },
    ],
    dex: dexPack.dex,
    assets: dexPack.assets,
    dexMeta: dexPack.meta,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
