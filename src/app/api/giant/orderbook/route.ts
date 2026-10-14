/**
 * GET /api/giant/orderbook — ספר-הפקודות-החוץ (עומק-שוק אמיתי · BTC/USDT)
 *
 * מדידה-חיה של "מה-העולם-החוץ מוכן-לשלם, עכשיו":
 *   ראשי   — Kraken Depth XBTUSDT  (https://api.kraken.com/0/public/Depth?pair=XBTUSDT&count=14)
 *   גיבוי-א׳ — Kraken Depth XXBTZUSD (אם הראשון מחזיר error או ספר-ריק)
 *   גיבוי-ב׳ — Binance depth BTCUSDT (ה-IP-המשותף נחסם-לסירוגין 418 — לכן Kraken ראשי)
 * המקור-שענה נרשם-בכנות בשדה source. Kraken מחזיר מחיר/כמות כמחרוזות — מנורמל ב-Number().
 * מנורמל ל-{source, pair, bids, asks, spread, mid, bestBid, bestAsk, ts, fetchedAt}
 * כאשר asks ממוין עולה (הטוב-ראשון) ו-bids ממוין יורד; spread = bestAsk − bestBid; mid = (bestAsk+bestBid)/2.
 * אפס-ספר-מצויר: כשל-כולל = {ok:false, error} עם 502 — שום-ספר לא מסונתז.
 * מטמון-זיכרון 15 שניות (module-level Map + timestamp).
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BookLevel {
  price: number;
  qty: number;
}

interface OrderbookPayload {
  ok: boolean;
  error?: string;
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

const COUNT = 14;
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; data: OrderbookPayload }>();

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
function finish(source: string, pair: string, bids: BookLevel[], asks: BookLevel[], ts: number | null): OrderbookPayload | null {
  if (bids.length === 0 || asks.length === 0) return null;
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);
  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  return {
    ok: true,
    source,
    pair,
    bids: bids.slice(0, COUNT),
    asks: asks.slice(0, COUNT),
    spread: bestAsk - bestBid,
    mid: (bestAsk + bestBid) / 2,
    bestBid,
    bestAsk,
    ts,
    fetchedAt: new Date().toISOString(),
  };
}

/* Kraken Depth — { error: [], result: { "<PAIR>": { bids:[[p,q,ts]], asks:[[...]] } } } */
async function krakenDepth(pair: string): Promise<OrderbookPayload | null> {
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(pair)}&count=${COUNT}`, {
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
async function binanceDepth(): Promise<OrderbookPayload | null> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=${COUNT}`, {
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

export async function GET() {
  const hit = cache.get("book");
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.data, { headers: { "cache-control": "no-store" } });
  }

  const chain: Array<[() => Promise<OrderbookPayload | null>, string]> = [
    [() => krakenDepth("XBTUSDT"), "Kraken XBTUSDT"],
    [() => krakenDepth("XXBTZUSD"), "Kraken XXBTZUSD"],
    [() => binanceDepth(), "Binance BTCUSDT"],
  ];
  for (const [attempt] of chain) {
    const book = await attempt();
    if (book) {
      cache.set("book", { at: Date.now(), data: book });
      return NextResponse.json(book, { headers: { "cache-control": "no-store" } });
    }
  }

  const failed: OrderbookPayload = {
    ok: false,
    error: "לא נמדד — Kraken (XBTUSDT / XXBTZUSD) ו-Binance לא ענו; אפס-ספר-מצויר (fail-honest)",
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
  return NextResponse.json(failed, { status: 502, headers: { "cache-control": "no-store" } });
}
