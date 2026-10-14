"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Coins, Flame, Gauge, TrendingUp } from "lucide-react";

/* ═══ הדקס — מרכז-הכובד של הריבונות (GIANT · R360) ═══════════════════════
 * חוק-קדמיות-המטבע: מטבעות-גדולים ורשתות-מוכרות לחזית; steem/hive/blurt =
 * שכבת-עגין-מושתקת בפינה. ההוכחה-הראשונה: ווליום-גבוה-מאוד על הדקס שלנו —
 * ואז נגזרים · הלוואות · מינוף. כל-המספרים מהגיט; רווח-ספר = SIM מתויג (R74). */

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
interface DexEssentials {
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
interface MarketPayload {
  ok: boolean;
  note?: string;
  source: string | null;
  cachedAgeMin: number | null;
  coins: CoinRow[];
  anchors: { name: string; note: string }[];
  dex: DexEssentials | null;
  assets: AssetRow[];
  dexMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
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
function fmtInt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}
function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: { icon: typeof Activity; label: string; value: string; sub?: string; tone?: "default" | "amber" | "emerald" }) {
  const border = tone === "amber" ? "border-amber-600/30" : tone === "emerald" ? "border-emerald-600/25" : "border-white/10";
  const color = tone === "amber" ? "text-amber-400" : tone === "emerald" ? "text-emerald-400" : "text-zinc-50";
  return (
    <article className={`rounded-2xl border ${border} bg-zinc-900/60 p-4 transition hover:border-amber-600/40`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-zinc-500">{label}</span>
        <Icon className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
      </div>
      <p className={`mt-2 font-mono text-2xl font-black tracking-tight ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
    </article>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number | null; max: number; color: string }) {
  const pct = value !== null && max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-bold text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">{fmtInt(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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

  const dex = data?.dex ?? null;
  const maxAct = Math.max(dex?.fills ?? 0, dex?.swaps ?? 0, dex?.opsTotal ?? 1);

  return (
    <div className="space-y-5" dir="rtl">
      {/* קריאת-הדרך */}
      <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-5">
        <h2 className="flex items-center gap-2 text-lg font-black text-zinc-50">
          <Coins className="h-5 w-5 text-amber-500" aria-hidden /> הדקס — מרכז-הכובד של הריבונות
        </h2>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          ההוכחה-הראשונה: <b className="text-amber-400">ווליום-גבוה-מאוד על הדקס שלנו</b> (נמדד-בכנות, ללא-הבטחות) — ואז נגזרים · הלוואות · מינוף.
          כמו הענקים, רק-טוב-יותר: הם מיושנים, אנחנו חדשניים.
        </p>
      </section>

      {dex?.halted && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/[0.06] px-4 py-3">
          <p className="text-xs font-bold text-red-400">היפוך-מנוע פעיל (halted) {dex.haltReason ? `· ${dex.haltReason}` : ""} — מוצהר-כנה, אפס-הסתרה</p>
        </section>
      )}

      {/* מטבעות-גדולים */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">מטבעות-גדולים ורשתות-מוכרות</h3>
          {data && <span className="text-[10px] text-zinc-500">נמדד {new Date(data.fetchedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        {err && <p className="mb-2 text-xs font-semibold text-red-400">{err}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!data && [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl bg-zinc-900" />)}
          {(data?.coins ?? []).map((c) => {
            const up = (c.change24h ?? 0) >= 0;
            return (
              <article key={c.id} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 transition hover:border-amber-600/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-zinc-50">{c.symbol}</span>
                  <span className="text-[10px] text-zinc-500">{c.name}</span>
                </div>
                <p className="mt-2 font-mono text-xl font-black tracking-tight text-zinc-50">{fmtUsd(c.priceUsd)}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={c.change24h === null ? "text-zinc-500" : up ? "text-emerald-400" : "text-red-400"}>
                    {c.change24h === null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(c.change24h).toFixed(2)}%`}
                  </span>
                  <span className="text-zinc-500">וול {fmtVol(c.vol24hUsd)}</span>
                </div>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${c.priceUsd !== null ? "bg-zinc-800 text-zinc-400" : "bg-red-500/10 text-red-400"}`}>
                  {c.priceUsd === null
                    ? "לא נמדד · fail-honest"
                    : data.cachedAgeMin !== null
                      ? `נמדד לפני ${data.cachedAgeMin} ד׳ · מטמון-כנות`
                      : `measured · live · ${data.source ?? "market"}`}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      {/* תא-הטיס של הדקס */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-200">תא-הטיס · הדק-הריבוני (ספר-חי מהגיט)</h3>
          {data?.dexMeta.exists && (
            <span className="font-mono text-[10px] text-zinc-500">
              sha16:{data.dexMeta.sha16?.slice(0, 8)} · גיל {ageHe(data.dexMeta.ageMinutes)}
            </span>
          )}
        </div>
        {!dex && data && <p className="rounded-xl border border-white/5 bg-zinc-900/60 p-4 text-xs text-zinc-500">ספר-הדקס לא נמדד כרגע — fail-honest</p>}
        {dex && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={Gauge} label="גובה-שרשרת" value={fmtInt(dex.height)} sub={dex.engine ?? undefined} tone="amber" />
              <Kpi icon={Activity} label="fills" value={fmtInt(dex.fills)} sub={`סך-פעולות ${fmtInt(dex.opsTotal)}`} />
              <Kpi icon={TrendingUp} label="swaps" value={fmtInt(dex.swaps)} sub={`סולמות ${fmtInt(dex.ladders)}`} />
              <Kpi icon={Flame} label="הזמנות-חיות" value={fmtInt(dex.liveOrders)} sub={`tick ${dex.tickMs ?? "—"}ms · ${dex.dbOk ? "db ok" : "db —"}`} tone="emerald" />
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-zinc-500">עומק-פעילות (מדיד)</h4>
                <div className="space-y-3">
                  <Bar label="ops" value={dex.opsTotal} max={maxAct || 1} color="bg-amber-500" />
                  <Bar label="fills" value={dex.fills} max={maxAct || 1} color="bg-amber-400" />
                  <Bar label="swaps" value={dex.swaps} max={maxAct || 1} color="bg-emerald-500" />
                </div>
                {dex.rejectedLastCount !== null && dex.rejectedLastCount > 0 && (
                  <p className="mt-3 rounded-lg border border-white/5 bg-zinc-950/60 px-3 py-2 text-[11px] leading-5 text-zinc-500">
                    דחיות-בלוק-אחרון: <span className="font-mono text-zinc-300">{fmtInt(dex.rejectedLastCount)}</span> בגובה {fmtInt(dex.rejectedLastHeight)} — מוצהר, לא מוסתר
                  </p>
                )}
              </section>
              <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-zinc-500">אוצרה · כנות-מלאה (R74)</h4>
                <div className="space-y-2 text-xs leading-6">
                  <p className="flex justify-between"><span className="text-zinc-500">רווח-ספר (SIM — לא כסף-אמיתי)</span><span className="font-mono font-bold text-amber-400">{fmtInt(dex.treasuryProfitSim)}</span></p>
                  <p className="flex justify-between"><span className="text-zinc-500">feeMeter (mu)</span><span className="font-mono text-zinc-200">{fmtInt(dex.feeMeterMu)}</span></p>
                  <p className="flex justify-between"><span className="text-zinc-500">gas ממומן (mu)</span><span className="font-mono text-zinc-200">{fmtInt(dex.gasFundedMu)}</span></p>
                  <p className="flex justify-between"><span className="text-zinc-500">גיבוי WSTEEM</span><span className="font-mono text-zinc-200">{fmtInt(dex.backingWsteem)}</span></p>
                  <p className="flex justify-between"><span className="text-zinc-500">גיבוי WSBD</span><span className="font-mono text-zinc-200">{fmtInt(dex.backingWsbd)}</span></p>
                  <p className="border-t border-white/5 pt-2 text-[10px] leading-4 text-zinc-600">
                    כסף-אמיתי = יתרות-שרשרת בלבד; SAOS = יחידות-סימולציה פנימיות. רווח-בספר ≠ רווח-אמיתי — ההפרדה מוצגת-כאן בכל-מסך.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
      </section>

      {/* סל-הנכסים */}
      {data && data.assets.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="mb-3 text-sm font-bold text-zinc-200">סל-הנכסים של הדקס</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 pl-4 font-bold">נכס</th>
                  <th className="pb-2 pl-4 font-bold">מחיר-ייחוס</th>
                  <th className="pb-2 font-bold">רשום-בספר</th>
                </tr>
              </thead>
              <tbody>
                {data.assets.map((a) => (
                  <tr key={a.symbol} className={`border-b border-white/5 last:border-0 ${a.symbol === "SAOS" ? "font-black" : ""}`}>
                    <td className="py-2.5 pl-4">
                      <span className={a.symbol === "SAOS" ? "font-mono text-sm text-amber-400" : "font-mono text-zinc-300"}>{a.symbol}</span>
                      {a.symbol === "SAOS" && <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-400">מטבע-הבית</span>}
                    </td>
                    <td className="py-2.5 pl-4 font-mono text-zinc-200">{fmtInt(a.refPrice)}</td>
                    <td className="py-2.5 font-mono text-zinc-400">{fmtInt(a.listed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* עגינים + מפת-דרכים */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/5 bg-zinc-900/40 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">שכבת-עגין (לא-חזית · מושתקת-בכוונה)</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(data?.anchors ?? []).map((a) => (
              <span key={a.name} className="rounded-full border border-white/5 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-500" title={a.note}>
                {a.name}
              </span>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-emerald-600/20 bg-emerald-500/[0.03] px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">מפת-הדרכים האוטונומית</p>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
            ① הוכחת-ווליום על הדקס (עכשיו) → ② נגזרים → ③ הלוואות → ④ מינוף. כל-שלב נפתח רק אחרי-הוכחה מדידה של-שלב-לפניו — בלי קיצורי-דרך, בלי הבטחות.
          </p>
        </section>
      </div>
    </div>
  );
}
