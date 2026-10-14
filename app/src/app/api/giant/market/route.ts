// GET /api/giant/market — מטבעות-גדולים ורשתות-מוכרות (חוק-קדמיות-המטבע)
// ═════════════════════════════════════════════════════════════════════════
// BTC·ETH·SOL·USDT — נמדד-חי (CoinGecko, ציבורי). steem/hive/blurt אינם-מודגשים:
// שכבת-עגין-ראיות בלבד. עוגן-הדקס שלנו (saos-dex/saos-markets) — סטטוס-כנה מהגיט.
// כשל = unavailable כנה, לעולם לא מספר-מצויר. cache 90 שניות.
import { NextResponse } from "next/server";
import { readPat } from "@/lib/office-truth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: MarketPayload } | null = null;
const CACHE_MS = 90_000;

export interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  vol24hUsd: number | null;
}
export interface AnchorRow {
  name: string;
  note: string;
}
export interface MarketPayload {
  ok: boolean;
  note?: string;
  coins: CoinRow[];
  anchors: AnchorRow[];
  dex: { repo: string; lastPush: string | null; mode: string; note: string } | null;
  markets: { repo: string; lastPush: string | null; note: string } | null;
  fetchedAt: string;
}

const COINS: Array<{ id: string; symbol: string; name: string }> = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "tether", symbol: "USDT", name: "Tether" },
];

async function jsonFetch<T>(url: string, pat?: string | null): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { ...(pat ? { authorization: `Bearer ${pat}` } : {}), accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface GhCommit {
  sha?: string;
  commit?: { committer?: { date?: string } };
}

export async function loadMarket(force = false): Promise<MarketPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const ids = COINS.map((c) => c.id).join(",");
  const price = await jsonFetch<Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
  );

  const coins: CoinRow[] = COINS.map((c) => {
    const p = price?.[c.id];
    return {
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      priceUsd: typeof p?.usd === "number" ? p.usd : null,
      change24h: typeof p?.usd_24h_change === "number" ? p.usd_24h_change : null,
      vol24hUsd: typeof p?.usd_24h_vol === "number" ? p.usd_24h_vol : null,
    };
  });

  const pat = await readPat();
  const [dexCommits, marketsCommits] = await Promise.all([
    jsonFetch<GhCommit[]>("https://api.github.com/repos/roshpinacare-sys/saos-dex/commits?per_page=1", pat),
    jsonFetch<GhCommit[]>("https://api.github.com/repos/roshpinacare-sys/saos-markets/commits?per_page=1", pat),
  ]);

  const payload: MarketPayload = {
    ok: coins.some((c) => c.priceUsd !== null),
    note: coins.some((c) => c.priceUsd !== null) ? undefined : "מחירי-השוק לא נמדדו כרגע — אפס-מספרים-מצוירים",
    coins,
    anchors: [
      { name: "STEEM", note: "שכבת-עגין-ראיות — לא-חזית" },
      { name: "HIVE", note: "שכבת-עגין-ראיות — לא-חזית" },
    ],
    dex: dexCommits?.[0]
      ? {
          repo: "saos-dex",
          lastPush: dexCommits[0].commit?.committer?.date ?? null,
          mode: "SIM-מוצהר — הזרמת-LIVE מוכרעת אצל הבעלים (P3)",
          note: "מנוע-הדקס הריבוני · עומק · ספר-הזמנות",
        }
      : null,
    markets: marketsCommits?.[0]
      ? {
          repo: "saos-markets",
          lastPush: marketsCommits[0].commit?.committer?.date ?? null,
          note: "דמוי-מסחר מדדי-מגזרים של-שווקים-מובילים (SIM מתויג)",
        }
      : null,
    fetchedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadMarket();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
