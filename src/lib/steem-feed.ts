// giant DEX · הזנת-שוק-סטים (server-only) — שוק-הפנימי של סטים + סימני-USD חוץ
// חוק-אמת: כל-מספר נמדד מ-API ציבורי — api.steemit.com (שוק-הפנימי STEEM/SBD
// עם עומק-אמת), CoinGecko ו-HTX (סימני-USD, מוצלבים-אחד-מול-השני).
// אם-הזנה-נופלת — null כנה. לא-ממציאים מחיר. השסתום מדלג בכנות.
// הוראת-הבעלים (trace 1a146513162051a5): "הכל בדקס יהיה נזיל — נשתמש בשוק של
// סטימיט ועוד כדי לייצר את הזרימה הדרושה ביעילות ומהירות".

/* ============================== RPC-סטים ============================== */

const STEEM_RPC = "https://api.steemit.com";

async function steemRpc<T>(method: string, params: unknown[], timeoutMs = 8_000): Promise<T | null> {
  try {
    const res = await fetch(STEEM_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: T; error?: unknown };
    if (!j || j.error || j.result === undefined) return null;
    return j.result ?? null;
  } catch {
    return null;
  }
}

/* ============================== מטמון ============================== */

interface CacheEntry<T> {
  at: number;
  data: T;
}

const g = globalThis as unknown as { __steemFeedCache?: Map<string, CacheEntry<unknown>> };

function feedCache(): Map<string, CacheEntry<unknown>> {
  if (!g.__steemFeedCache) g.__steemFeedCache = new Map();
  return g.__steemFeedCache;
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
    return hit ? hit.data : null; // כשל-רשת: האמת-האחרונה-שידועה, בלי-המצאה
  }
}

/* ============================== טיפוסים ============================== */

export interface SteemBookLevel {
  price: number; // SBD ל-STEEM
  steem: number; // כמות-STEEM בשלב
  sbd: number; // כמות-SBD בשלב
  totalSbd: number; // מצטבר
}

export interface SteemMarketSnapshot {
  at: number; // epoch-ms של בניית-התמונה
  internal: {
    live: boolean;
    latestSbdPerSteem: number | null; // שוק-הפנימי · עסקה-אחרונה
    lowestAskSbd: number | null;
    highestBidSbd: number | null;
    spreadPct: number | null;
    volume24hSbd: number | null;
    medianSbdPerSteem: number | null; // פיד-העדים (חציון)
    bids: SteemBookLevel[]; // עומק-אמת · מהשרשרת
    asks: SteemBookLevel[];
    depthSbd: number | null; // סך-העומק המוצג (bids+asks)
  };
  usd: {
    steemUsd: number | null;
    sbdUsd: number | null;
    source: string | null; // "coingecko+htx" · "coingecko" · "htx" · "chain-cross"
  };
  oracle: {
    steemUsds: number | null; // סימן-האורקל לבריכה (USDS≈USD יחידת-סליקה)
    sbdUsds: number | null;
    fresh: boolean; // האם-הסימנים טריים ושימושיים-לשסתום
  };
}

interface SteemTicker {
  latest: string;
  lowest_ask: string;
  highest_bid: string;
  percent_change: string;
  sbd_volume: string;
  steem_volume: string;
}

interface SteemOrderBookEntry {
  created: string;
  order_price: { base: string; quote: string };
  real_price: string;
  sbd: number;
  steem: number;
}

function num(s: string | undefined | null): number | null {
  if (s === undefined || s === null) return null;
  const v = Number(String(s).split(" ")[0]);
  return Number.isFinite(v) ? v : null;
}

function buildLevels(entries: SteemOrderBookEntry[] | undefined): SteemBookLevel[] {
  if (!Array.isArray(entries)) return [];
  const out: SteemBookLevel[] = [];
  let cum = 0;
  for (const e of entries.slice(0, 20)) {
    const price = num(e.real_price);
    const steem = Number(e.steem);
    const sbd = Number(e.sbd);
    if (price === null || !Number.isFinite(steem) || !Number.isFinite(sbd)) continue;
    cum += sbd;
    out.push({ price, steem, sbd, totalSbd: cum });
  }
  return out;
}

/* ============================== סימני-USD חוץ ============================== */

interface CoinGeckoPrice {
  steem?: { usd?: number };
  "steem-dollars"?: { usd?: number };
}

async function coingeckoUsd(): Promise<{ steem: number | null; sbd: number | null } | null> {
  return cached("cg:steem", 90_000, async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=steem,steem-dollars&vs_currencies=usd",
        { cache: "no-store", signal: AbortSignal.timeout(7_000) },
      );
      if (!res.ok) return null;
      const j = (await res.json()) as CoinGeckoPrice;
      const steem = Number(j.steem?.usd);
      const sbd = Number(j["steem-dollars"]?.usd);
      return {
        steem: Number.isFinite(steem) && steem > 0 ? steem : null,
        sbd: Number.isFinite(sbd) && sbd > 0 ? sbd : null,
      };
    } catch {
      return null;
    }
  });
}

interface HtxMerged {
  status?: string;
  tick?: { close?: number; bid?: number[]; ask?: number[]; open?: number; high?: number; low?: number; amount?: number };
}

async function htxSteemUsdt(): Promise<{ close: number; bid: number | null; ask: number | null } | null> {
  return cached("htx:steemusdt", 60_000, async () => {
    try {
      const res = await fetch("https://api.huobi.pro/market/detail/merged?symbol=steemusdt", {
        cache: "no-store",
        signal: AbortSignal.timeout(7_000),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as HtxMerged;
      const close = Number(j.tick?.close);
      if (!Number.isFinite(close) || close <= 0) return null;
      return {
        close,
        bid: Number(j.tick?.bid?.[0]) || null,
        ask: Number(j.tick?.ask?.[0]) || null,
      };
    } catch {
      return null;
    }
  });
}

/* ============================== תמונת-שוק מאוחדת ============================== */

const SNAPSHOT_TTL_MS = 20_000; // השסתום קורא מכאן כל-10ש׳ — חצי-מהטריות

export async function steemMarketSnapshot(): Promise<SteemMarketSnapshot | null> {
  // חוק-האמת של הקובץ עצמו (ראה-ראש): "אם-הזנה-נופלת — null כנה" — מטמון-קר +
  // כשל-רשת = null כנה, ולכן החתימה מצהירה זאת (tsc תפס את-השקר, t56).
  return cached("steem:snapshot", SNAPSHOT_TTL_MS, async () => {
    // --- השוק-הפנימי של סטים (שרשרת-אמת) ---
    const [ticker, book, median] = await Promise.all([
      steemRpc<SteemTicker>("condenser_api.get_ticker", []),
      steemRpc<{ asks: SteemOrderBookEntry[]; bids: SteemOrderBookEntry[] }>("condenser_api.get_order_book", [20]),
      steemRpc<{ base: string; quote: string }>("condenser_api.get_current_median_history_price", []),
    ]);

    const latest = ticker ? num(ticker.latest) : null;
    const lowestAsk = ticker ? num(ticker.lowest_ask) : null;
    const highestBid = ticker ? num(ticker.highest_bid) : null;
    const spreadPct =
      lowestAsk && highestBid && lowestAsk > 0
        ? ((lowestAsk - highestBid) / lowestAsk) * 100
        : null;
    const volume24hSbd = ticker ? num(ticker.sbd_volume) : null;
    let medianSbd = null as number | null;
    if (median) {
      const base = num(median.base); // SBD
      const quote = num(median.quote); // STEEM
      if (base && quote && quote > 0) medianSbd = base / quote;
    }
    const bids = buildLevels(book?.bids);
    const asks = buildLevels(book?.asks);
    const depthSbd = bids.length || asks.length ? [...bids, ...asks].reduce((s, l) => s + l.sbd, 0) : null;
    const internalLive = latest !== null || (bids.length > 0 && asks.length > 0);

    // --- סימני-USD (חוץ, מוצלבים) ---
    const [cg, htx] = await Promise.all([coingeckoUsd(), htxSteemUsdt()]);
    let steemUsd: number | null = null;
    let sbdUsd: number | null = null;
    let usdSource: string | null = null;
    if (cg?.steem && htx?.close && Math.abs(cg.steem - htx.close) / Math.max(cg.steem, htx.close) < 0.05) {
      // שני-מקורות-בלתי-תלויים-מסכימים — סימן-אמצע
      steemUsd = (cg.steem + htx.close) / 2;
      usdSource = "coingecko+htx";
    } else if (cg?.steem) {
      steemUsd = cg.steem;
      usdSource = "coingecko";
    } else if (htx?.close) {
      steemUsd = htx.close;
      usdSource = "htx";
    }
    if (cg?.sbd) {
      sbdUsd = cg.sbd;
      if (!usdSource) usdSource = "coingecko";
    }
    // גישור-שרשרת: SBD נגזר מהשוק-הפנימי אם-יש-סימן-STEEM
    const sbdPerSteem = latest ?? medianSbd;
    if (sbdUsd === null && steemUsd && sbdPerSteem && sbdPerSteem > 0) {
      sbdUsd = steemUsd / sbdPerSteem;
      usdSource = usdSource ? `${usdSource}+chain-cross` : "chain-cross";
    }
    // STEEM נגזר מהשוק-הפנימי אם-אין-סימן-חוץ-אבל-יש-SBD
    if (!steemUsd && sbdUsd && sbdPerSteem && sbdPerSteem > 0) {
      steemUsd = sbdUsd * sbdPerSteem;
      usdSource = "chain-cross";
    }

    const fresh = steemUsd !== null && steemUsd > 0;
    return {
      at: Date.now(),
      internal: {
        live: internalLive,
        latestSbdPerSteem: latest,
        lowestAskSbd: lowestAsk,
        highestBidSbd: highestBid,
        spreadPct,
        volume24hSbd,
        medianSbdPerSteem: medianSbd,
        bids,
        asks,
        depthSbd,
      },
      usd: { steemUsd, sbdUsd, source: usdSource },
      oracle: {
        steemUsds: steemUsd,
        sbdUsds: sbdUsd,
        fresh,
      },
    } satisfies SteemMarketSnapshot;
  });
}
