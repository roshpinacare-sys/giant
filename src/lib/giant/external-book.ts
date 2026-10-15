/**
 * ספר-החוץ-החי (T74-פיצול מ-/api/giant/orderbook — מקור-אחד לכל-הצרכנים)
 *
 * מדידה-חיה של "מה-העולם-החוץ מוכן-לשלם, עכשיו":
 *   ראשי   — Kraken Depth XBTUSDT
 *   גיבוי-א׳ — Kraken Depth XXBTZUSD
 *   גיבוי-ב׳ — Binance depth BTCUSDT (ה-IP-המשותף נחסם-לסירוגין 418 — לכן Kraken ראשי)
 * המקור-שענה נרשם-בכנות בשדה source. אפס-ספר-מצויר: כשל-כולל = null.
 */
export interface BookLevel {
  price: number;
  qty: number;
}

export interface ExternalBook {
  ok: boolean;
  source: string | null;
  pair: string | null;
  bids: BookLevel[];
  asks: BookLevel[];
  spread: number | null;
  mid: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  ts: number | null;
  fetchedAt: string;
}

export const BOOK_COUNT = 14;
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; data: ExternalBook }>();

/* [[מחיר, כמות, (זמן)]] כמחרוזות (Kraken) או מספרים-כמחרוזות (Binance) → רמות-מדודות בלבד */
function levels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: BookLevel[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = Number(row[0]);
    const qty = Number(row[1]);
    if (Number.isFinite(price) && price > 0 && Number.isFinite(qty) && qty > 0) out.push({ price, qty });
  }
  return out;
}

/* מיון-אמת: asks עולה, bids יורד + נגזרות-המחיר. ספר-ריק = אין-מדידה (null). */
function finish(source: string, pair: string, bids: BookLevel[], asks: BookLevel[], ts: number | null): ExternalBook | null {
  if (bids.length === 0 || asks.length === 0) return null;
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);
  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  return {
    ok: true,
    source,
    pair,
    bids: bids.slice(0, BOOK_COUNT),
    asks: asks.slice(0, BOOK_COUNT),
    spread: bestAsk - bestBid,
    mid: (bestAsk + bestBid) / 2,
    bestBid,
    bestAsk,
    ts,
    fetchedAt: new Date().toISOString(),
  };
}

/* Kraken Depth — { error: [], result: { "<PAIR>": { bids:[[p,q,ts]], asks:[[...]] } } } */
async function krakenDepth(pair: string): Promise<ExternalBook | null> {
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(pair)}&count=${BOOK_COUNT}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { error?: string[]; result?: Record<string, { bids?: unknown[][]; asks?: unknown[][] }> };
    if (!j || !Array.isArray(j.error) || j.error.length > 0 || !j.result || typeof j.result !== "object") return null;
    const entry = Object.values(j.result)[0];
    if (!entry) return null;
    const bids = levels(entry.bids);
    const asks = levels(entry.asks);
    let ts: number | null = null; // חותמת-הזמן-של-הבורסה (שניות → מילי-שניות)
    for (const row of [...(entry.bids ?? []), ...(entry.asks ?? [])]) {
      if (Array.isArray(row) && row.length >= 3 && Number.isFinite(Number(row[2])) && Number(row[2]) > 0) {
        ts = Math.max(ts ?? 0, Number(row[2]) * 1000);
      }
    }
    return finish(`kraken ${pair}`, pair, bids, asks, ts);
  } catch {
    return null;
  }
}

/* Binance depth — { bids:[[p,q]], asks:[[...]] }; ייתכן 418 מה-IP-המשותף — רק-גיבוי */
async function binanceDepth(): Promise<ExternalBook | null> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=${BOOK_COUNT}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { bids?: unknown[][]; asks?: unknown[][] };
    if (!j) return null;
    return finish("binance BTCUSDT", "BTCUSDT", levels(j.bids), levels(j.asks), Date.now());
  } catch {
    return null;
  }
}

/* המדידה-המשותפת — מטמון-15ש׳, כשל-כולל = ספר-כושל-כנה (ok:false, אפס-סינתזה) */
export async function measureExternalBook(): Promise<ExternalBook> {
  const hit = cache.get("book");
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const chain: Array<[() => Promise<ExternalBook | null>]> = [
    [() => krakenDepth("XBTUSDT")],
    [() => krakenDepth("XXBTZUSD")],
    [() => binanceDepth()],
  ];
  for (const [attempt] of chain) {
    const book = await attempt();
    if (book) {
      cache.set("book", { at: Date.now(), data: book });
      return book;
    }
  }

  const failed: ExternalBook = {
    ok: false,
    source: null,
    pair: null,
    bids: [],
    asks: [],
    spread: null,
    mid: null,
    bestBid: null,
    bestAsk: null,
    ts: null,
    fetchedAt: new Date().toISOString(),
  };
  cache.set("book", { at: Date.now(), data: failed });
  return failed;
}
