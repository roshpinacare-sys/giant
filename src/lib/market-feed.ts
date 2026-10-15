// giant DEX · הזנת-שוק-אמת (server-only) — Binance ציבורי בלבד
// חוק-אמת: כל-הנתונים מה-API-הציבורי-של-Binance. אין-מספר-מומצא.
// אם-ההזנה-נופלת — מחזירים-null-והמסך-מציג-זאת-בכנות. לא-ממציאים-תנועה.

/* ============================== מיפוי-זוגות ============================== */

// הזוגות-החוץ-שלנו נקראים מול-Binance-USDT. הרשימה-מוצהרת-כאן-ובדק-המנוע.
const REF_BASES = new Set([
  "BTC", "ETH", "SOL", "BNB", "XRP", "TON", "DOGE", "ADA", "AVAX", "TRX", "LINK",
]);

export function binanceSymbolFor(base: string): string | null {
  if (!REF_BASES.has(base)) return null;
  return `${base}USDT`;
}

/* ============================== מטמון-זיכרון ============================== */

interface CacheEntry<T> {
  at: number;
  data: T;
}

const g = globalThis as unknown as {
  __giantFeedCache?: Map<string, CacheEntry<unknown>>;
};

function feedCache(): Map<string, CacheEntry<unknown>> {
  if (!g.__giantFeedCache) g.__giantFeedCache = new Map();
  return g.__giantFeedCache;
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T | null> {
  const cache = feedCache();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  try {
    const data = await load();
    if (data !== null) cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return hit ? hit.data : null; // כשל-רשת: מחזירים-את-האמת-האחרונה-שידועה, בלי-המצאה
  }
}

async function binanceFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.binance.com${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ============================== קרניים (נרות) ============================== */

export interface RawCandle {
  t: number; // epoch seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // נפח-quote (USDT) לתקופה
}

const VALID_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

export function binanceKlines(
  symbol: string,
  interval: string,
  limit: number,
): Promise<RawCandle[] | null> {
  if (!VALID_INTERVALS.has(interval)) return Promise.resolve(null);
  const cap = Math.min(500, Math.max(30, limit));
  return cached(`k:${symbol}:${interval}:${cap}`, 45_000, async () => {
    const rows = await binanceFetch<unknown[][]>(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${cap}`,
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const out: RawCandle[] = [];
    for (const r of rows) {
      const t = Number(r[0]);
      const o = Number(r[1]);
      const h = Number(r[2]);
      const l = Number(r[3]);
      const c = Number(r[4]);
      const v = Number(r[7]); // quoteVolume
      if (![t, o, h, l, c, v].every(Number.isFinite)) continue;
      out.push({ t: Math.floor(t / 1000), o, h, l, c, v });
    }
    return out.length ? out : null;
  });
}

/* ============================== מחירי-24h ============================== */

export interface Ticker24h {
  symbol: string;
  last: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  quoteVolume: number;
}

interface BinanceTicker24 {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

export function binanceTickers24h(symbols: string[]): Promise<Map<string, Ticker24h> | null> {
  if (!symbols.length) return Promise.resolve(null);
  const key = `t24:${[...symbols].sort().join(",")}`;
  return cached(key, 30_000, async () => {
    const q = encodeURIComponent(`[${symbols.map((s) => `"${s}"`).join(",")}]`);
    const rows = await binanceFetch<BinanceTicker24[]>(`/api/v3/ticker/24hr?symbols=${q}`);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const out = new Map<string, Ticker24h>();
    for (const r of rows) {
      const last = Number(r.lastPrice);
      const open = Number(r.openPrice);
      const high = Number(r.highPrice);
      const low = Number(r.lowPrice);
      const pct = Number(r.priceChangePercent);
      const vol = Number(r.quoteVolume);
      if (![last, open, high, low, pct, vol].every(Number.isFinite)) continue;
      out.set(r.symbol, { symbol: r.symbol, last, open, high, low, changePct: pct, quoteVolume: vol });
    }
    return out.size ? out : null;
  });
}

/* ============================== עומק-שוק ============================== */

export interface RawDepth {
  mid: number;
  bids: { price: number; amount: number; total: number }[];
  asks: { price: number; amount: number; total: number }[];
}

export function binanceDepth(symbol: string, limit = 20): Promise<RawDepth | null> {
  return cached(`d:${symbol}:${limit}`, 4_000, async () => {
    const raw = await binanceFetch<{ bids: [string, string][]; asks: [string, string][] }>(
      `/api/v3/depth?symbol=${symbol}&limit=${Math.min(50, Math.max(5, limit))}`,
    );
    if (!raw?.bids?.length || !raw?.asks?.length) return null;
    const build = (levels: [string, string][]) => {
      const out: { price: number; amount: number; total: number }[] = [];
      let cum = 0;
      for (const [p, a] of levels) {
        const price = Number(p);
        const amount = Number(a);
        if (!Number.isFinite(price) || !Number.isFinite(amount)) continue;
        cum += price * amount;
        out.push({ price, amount, total: cum });
      }
      return out;
    };
    const bids = build(raw.bids);
    const asks = build(raw.asks);
    if (!bids.length || !asks.length) return null;
    const mid = (bids[0].price + asks[0].price) / 2;
    return { mid, bids, asks };
  });
}

/* ============================== סרט-עסקאות-ציבורי ============================== */

export interface RawPublicTrade {
  id: string;
  side: "BUY" | "SELL"; // הצד-האגרסיבי (taker)
  price: number;
  amount: number; // base qty
  total: number; // quote (USDT)
  t: string; // ISO
}

interface BinanceTrade {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
}

export function binancePublicTrades(symbol: string, limit = 50): Promise<RawPublicTrade[] | null> {
  return cached(`tr:${symbol}:${limit}`, 4_000, async () => {
    const rows = await binanceFetch<BinanceTrade[]>(
      `/api/v3/trades?symbol=${symbol}&limit=${Math.min(100, Math.max(10, limit))}`,
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const out: RawPublicTrade[] = [];
    for (const r of rows) {
      const price = Number(r.price);
      const amount = Number(r.qty);
      const total = Number(r.quoteQty);
      if (!Number.isFinite(price) || !Number.isFinite(amount)) continue;
      // isBuyerMaker=true ⇒ ה-taker מכר (SELL). false ⇒ ה-taker קנה (BUY).
      out.push({
        id: String(r.id),
        side: r.isBuyerMaker ? "SELL" : "BUY",
        price,
        amount,
        total,
        t: new Date(r.time).toISOString(),
      });
    }
    return out.length ? out.reverse() : null; // חדש→ישן
  });
}
