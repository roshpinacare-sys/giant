"use client";

/* ═══ סרט-השוק · Ticker Tape (GIANT) ═══════════════════════════════════════
 * · מדידה-חיה: /api/giant/market כל 60 שניות (cache:no-store) — Kraken→Binance→CoinGecko.
 * · מרקי-אינסופי: השורה-מועתקת-פעמיים, translateX 0→-50% (חלק-ללא-תפר), dir="ltr".
 * · כנות: אין-מחיר = אין-שורה; כשל-מדידה = שבב-אחד כנה ״שוק: לא נמדד״.
 * · prefers-reduced-motion → animate-none; ריחוף → השהיה. */

import { useCallback, useEffect, useRef, useState } from "react";

interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  vol24hUsd: number | null;
}

interface AssetRow {
  symbol: string;
  refPrice: number | null;
  listed: number | null;
}

interface MarketPayload {
  ok: boolean;
  note?: string;
  source: string | null;
  cachedAgeMin: number | null;
  coins: CoinRow[];
  assets: AssetRow[];
  fetchedAt: string;
}

const POLL_MS = 60_000;
const STYLE_ID = "giant-tape-style";

/* מפתח-העיצוב מוזרק-פעם-אחת (לפי-מזהה — אידמפוטנטי); נוקה בפירוק. */
function useTapeStyle() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.textContent = `
@keyframes giant-tape {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}`;
    document.head.appendChild(tag);
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);
}

/* עיצוב-מחיר אנושי: דולר-שלם עם פסיקים · 2 ספרות ביניים · 4 לסטבילים */
function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toFixed(4);
}

interface Chip {
  key: string;
  symbol: string;
  price: string;
  change: number | null;
  tag?: string;
}

export function TickerTape() {
  const [chips, setChips] = useState<Chip[] | null>(null);
  const [source, setSource] = useState<{ name: string; ageMin: number | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  useTapeStyle();

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/giant/market", { cache: "no-store", signal });
      if (!res.ok) throw new Error(`market ${res.status}`);
      const d = (await res.json()) as MarketPayload;
      if (!alive.current) return;
      const out: Chip[] = [];
      for (const c of d.coins ?? []) {
        if (c.priceUsd === null) continue; // אין-מדידה = אין-שורה
        out.push({ key: `c-${c.symbol}`, symbol: c.symbol, price: `$${fmtPrice(c.priceUsd)}`, change: c.change24h });
      }
      const saos = (d.assets ?? []).find((a) => a.symbol === "SAOS" && a.refPrice !== null);
      if (saos && saos.refPrice !== null) {
        // חוק-היחידות (T55/T56): refPrice ב-mu → יחידות-אנוש ÷1000, תגית-אורקל
        out.push({ key: "c-SAOS", symbol: "SAOS", price: `${(saos.refPrice / 1000).toFixed(3)} USDS`, change: null, tag: "oracle" });
      }
      setChips(out);
      setSource(d.source ? { name: d.source, ageMin: d.cachedAgeMin } : null);
      setFailed(out.length === 0);
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setFailed(true);
      setChips(null);
      setSource(null);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const ac = new AbortController();
    void load(ac.signal);
    const t = setInterval(() => void load(ac.signal), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
      ac.abort();
    };
  }, [load]);

  const row = (ariaHidden: boolean) => (
    <div className="flex shrink-0 items-center gap-6 px-3" aria-hidden={ariaHidden}>
      {source && (
        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
          מקור: {source.name}
          {source.ageMin !== null && <span className="font-mono"> · מטמון {source.ageMin} ד׳</span>}
        </span>
      )}
      {(chips ?? []).map((c) => (
        <span key={c.key} className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs tabular-nums">
          <span className="font-semibold text-zinc-200">{c.symbol}</span>
          <span className="text-zinc-300">{c.price}</span>
          {c.change !== null && (
            <span className={c.change >= 0 ? "text-emerald-500" : "text-red-500"}>
              {c.change >= 0 ? "+" : ""}
              {c.change.toFixed(2)}%
            </span>
          )}
          {c.tag && <span className="rounded-sm border border-amber-500/40 px-1 text-[9px] text-amber-500">{c.tag}</span>}
        </span>
      ))}
      <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs">
        <span className="font-semibold text-amber-500">GIANT</span>
        <span className="text-zinc-600">מערכת-אחת · ערוץ-אחד</span>
      </span>
    </div>
  );

  return (
    <div
      dir="ltr"
      className="w-full overflow-hidden border-b border-white/10 bg-zinc-950"
      role="status"
      aria-label="סרט-השוק החי"
    >
      {failed ? (
        <div dir="rtl" className="flex h-8 items-center px-3">
          <span className="flex items-center gap-1.5 rounded-sm border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 font-mono text-xs text-amber-500">
            שוק: לא נמדד
          </span>
        </div>
      ) : chips === null ? (
        <div dir="rtl" className="flex h-8 items-center px-3 font-mono text-xs text-zinc-600">
          שוק: טוען…
        </div>
      ) : (
        /* המסילה מכילה שתי-עותקים זהים — translateX(-50%) = לולאה-חלקה */
        <div className="giant-tape-track hover:[animation-play-state:paused] motion-reduce:animate-none flex w-max py-1.5 [animation:giant-tape_48s_linear_infinite]">
          {row(false)}
          {row(true)}
        </div>
      )}
    </div>
  );
}
