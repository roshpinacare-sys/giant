"use client";

import { useCallback, useEffect, useState } from "react";

/* ═══ דקס — מרכז-הכובד: מטבעות-גדולים · הדקס-שלנו · ווליום-כנות ══════════
 * חוק-קדמיות-המטבע: הדגשת מטבעות-גדולים ורשתות-מוכרות (BTC·ETH·SOL·USDT);
 * steem/hive אינם-מודגשים — שכבת-עגין-ראיות בלבד, בפינה ומושתקים.
 * ההוכחה-הראשונה: ווליום-גבוה-מאוד על-הדקס שלנו (volume-honesty). */

interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  vol24hUsd: number | null;
}
interface MarketPayload {
  ok: boolean;
  note?: string;
  coins: CoinRow[];
  anchors: { name: string; note: string }[];
  dex: { repo: string; lastPush: string | null; mode: string; note: string } | null;
  markets: { repo: string; lastPush: string | null; note: string } | null;
  fetchedAt: string;
}

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
function fmtVol(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
}
function timeHe(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function DexView() {
  const [data, setData] = useState<MarketPayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/market", { cache: "no-store" });
      const d = (await res.json()) as MarketPayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 90_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  return (
    <div className="space-y-5" dir="rtl">
      {/* קריאת-הדרך */}
      <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-5">
        <h2 className="text-lg font-black text-zinc-100">הדקס — מרכז-הכובד של הריבונות</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          ההוכחה-הראשונה: <b className="text-amber-400">ווליום-גבוה-מאוד על הדקס שלנו</b> (מדוד-בכנות, ללא-הבטחות) — ואז נגזרים · הלוואות · מינוף. כמו הענקים, רק טוב-יותר: הם מיושנים, אנחנו חדשניים.
        </p>
      </section>

      {/* מטבעות-גדולים */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-300">מטבעות-גדולים ורשתות-מוכרות</h3>
          {data && <span className="text-[10px] text-zinc-500">נמדד {timeHe(data.fetchedAt)}</span>}
        </div>
        {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(data?.coins ?? []).map((c) => {
            const up = (c.change24h ?? 0) >= 0;
            return (
              <article key={c.id} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 transition hover:border-amber-600/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-zinc-100">{c.symbol}</span>
                  <span className="text-[10px] text-zinc-500">{c.name}</span>
                </div>
                <p className="mt-2 text-xl font-black tracking-tight text-zinc-50">{fmtUsd(c.priceUsd)}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={c.change24h === null ? "text-zinc-500" : up ? "text-emerald-400" : "text-red-400"}>
                    {c.change24h === null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(c.change24h).toFixed(2)}%`}
                  </span>
                  <span className="text-zinc-500">וול {fmtVol(c.vol24hUsd)}</span>
                </div>
                <span className="mt-2 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-bold text-zinc-400">measured · live</span>
              </article>
            );
          })}
        </div>
      </section>

      {/* הדקס-שלנו + שווקים */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100">הדקס-הריבוני · saos-dex</h3>
            {data?.dex && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-zinc-400">{data?.dex?.note ?? "ספר-הדקס לא נמדד כרגע"}</p>
          {data?.dex && (
            <>
              <p className="mt-2 text-[11px] font-semibold text-amber-400">{data.dex.mode}</p>
              <p className="mt-1 text-[10px] text-zinc-500">דחיפה-אחרונה לגיט: {timeHe(data.dex.lastPush)}</p>
            </>
          )}
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100">שווקי-המגזרים · saos-markets</h3>
            {data?.markets && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-zinc-400">{data?.markets?.note ?? "ספר-השווקים לא נמדד כרגע"}</p>
          {data?.markets && <p className="mt-2 text-[10px] text-zinc-500">דחיפה-אחרונה לגיט: {timeHe(data.markets.lastPush)}</p>}
        </section>
      </div>

      {/* שכבת-עגין — מושתקת בכוונה */}
      <section className="rounded-xl border border-white/5 bg-zinc-900/40 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">שכבת-עגין (לא-חזית)</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(data?.anchors ?? []).map((a) => (
            <span key={a.name} className="rounded-full border border-white/5 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-500" title={a.note}>
              {a.name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
