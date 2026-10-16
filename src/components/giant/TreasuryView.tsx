"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Landmark, Lock, Loader2, ShieldCheck, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";

/* ═══ האוצר — אמת-על-השרשרת (T77-MONEY · מנוע-הנזילות) ═════════════════════
 * headcorner חי מהשרשרת: נזיל · SBD · SP · ספר-SP-לצי · פקודות-פתוחות ·
 * קצב-רווח 24ש׳/7י׳ · חריגות (סכום-חריג) · תוכנית-נזילות.
 * fail-honest: null = לא-נמדד — "—" ולא-מספר-מזויף. */

interface Snapshot {
  ok: boolean;
  at: string;
  liquid: { steem: number; sbd: number; vestingRewards: number };
  lockedInOrders: { steem: number; sbd: number; count: number };
  sp: { gross: number; delegatedOut: number; delegatedIn: number; net: number; vestsPerSp: number };
  price: { steemInSbd: number | null; source: string };
  totalUsds: number | null;
  fleetDelegations: Record<string, number> | null;
}
interface Runrate {
  ok: boolean;
  d24?: { transfersIn: { steem: number; sbd: number }; transfersOut: { steem: number; sbd: number }; tradingFills: number; curation: { vests: number }; netSteemEq: number; verdict: string };
  d7?: { transfersIn: { steem: number; sbd: number }; transfersOut: { steem: number; sbd: number }; tradingFills: number; curation: { vests: number }; netSteemEq: number; verdict: string };
  reason?: string;
}
interface Treasury {
  ok: boolean;
  engine?: { ledgerRows?: number; deepScanDone?: boolean; anomalies?: number };
  snapshot: Snapshot | null;
  flow?: { deepScanDone?: boolean; runrate?: Runrate | null } | null;
  anomalies?: { count: number; anomalies: Array<{ kind: string; amount?: number; currency?: string; party?: string; ts?: string; shares?: string; at: string }> } | null;
  plan?: { ok: boolean; steps?: Array<{ step: string; what: string; dryRun: boolean }> } | null;
}

const n2 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—");
const n3 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 3 }) : "—");
const tHe = (iso?: string) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
};

function VerdictBadge({ v }: { v?: string }) {
  if (!v) return <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-400">לא-נמדד</span>;
  const win = v.includes("מרוויח"), lose = v.includes("מפסיד");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${win ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : lose ? "border-red-500/30 bg-red-500/5 text-red-300" : "border-amber-500/30 bg-amber-500/5 text-amber-300"}`}>
      {win ? <TrendingUp className="h-3 w-3" aria-hidden /> : lose ? <TrendingDown className="h-3 w-3" aria-hidden /> : <Loader2 className="h-3 w-3" aria-hidden />}
      {v}
    </span>
  );
}

function Stat({ icon: Icon, label, value, sub, tone = "zinc" }: { icon: any; label: string; value: string; sub?: string; tone?: "zinc" | "amber" | "emerald" | "red" }) {
  const tones: Record<string, string> = {
    zinc: "border-white/5 bg-zinc-900/50 text-zinc-100",
    amber: "border-amber-600/25 bg-amber-500/[0.06] text-amber-100",
    emerald: "border-emerald-600/25 bg-emerald-500/[0.06] text-emerald-100",
    red: "border-red-600/25 bg-red-500/[0.06] text-red-100",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`} dir="rtl">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</p>
      <p className="mt-1.5 font-mono text-lg font-black leading-6">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
    </div>
  );
}

export function TreasuryView() {
  const [d, setD] = useState<Treasury | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/giant/treasury", { cache: "no-store" });
      const j = (await r.json()) as Treasury;
      setD(j);
      setErr(j.ok ? "" : "המנוע-לא-זמין (כנה)");
    } catch {
      setErr("השרת-לא-נגיש (כנה)");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  const s = d?.snapshot ?? null;
  const rr = d?.flow?.runrate ?? null;
  const fleet = Object.entries(s?.fleetDelegations ?? {}).sort((a, b) => b[1] - a[1]);
  const spToFleet = fleet.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ראש */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-l from-amber-950/25 via-zinc-950 to-zinc-950 p-5">
        <div aria-hidden className="pointer-events-none absolute -top-20 left-1/3 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500/90">
          <Landmark className="h-3.5 w-3.5" aria-hidden /> האוצר-החי · אמת-על-השרשרת (STEEM · headcorner)
        </p>
        <h2 className="mt-2 text-xl font-black sm:text-2xl">
          כל-הכסף — נמדד-חי מהשרשרת, <span className="text-amber-500">אפס-המצאות</span>
        </h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-zinc-400">
          מנוע-הנזילות קורא את השרשרת-הציבורית (ללא-מפתחות, fail-honest): יתרות · ספר-SP של הצי · פקודות-פתוחות ·
          קצב-רווח · חריגות. "—" = לא-נמדד-כרגע.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <VerdictBadge v={rr?.d24?.verdict} />
          <span className="text-[10px] text-zinc-500">קצב-24ש׳</span>
          <VerdictBadge v={rr?.d7?.verdict} />
          <span className="text-[10px] text-zinc-500">קצב-7י׳</span>
          {typeof d?.snapshot?.totalUsds === "number" && (
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
              שווי-כולל ≈ {n2(d.snapshot.totalUsds)} USDS
            </span>
          )}
        </div>
        {err && <p className="mt-2 text-[11px] font-bold text-red-400">{err}</p>}
      </section>

      {/* מספרים-ראשיים */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wallet} label="נזיל" value={`${n3(s?.liquid.steem)} STEEM`} sub={`+ ${n3(s?.liquid.sbd)} SBD`} tone="amber" />
        <Stat icon={Lock} label="נעול-בפקודות" value={`${n3(s?.lockedInOrders.steem)} STEEM`} sub={`+ ${n3(s?.lockedInOrders.sbd)} SBD · ${s?.lockedInOrders.count ?? "—"} פקודות`} />
        <Stat icon={Landmark} label="SP-נטו (כוח-שלטון)" value={`${n2(s?.sp.net)} SP`} sub={`גולמי ${n2(s?.sp.gross)} · התקבל ${n2(s?.sp.delegatedIn)}`} tone="emerald" />
        <Stat icon={Users} label="SP-מוקצה-לצי" value={`${n2(spToFleet)} SP`} sub={`${fleet.length} חשבונות · "להשאיר-להם-SP" בפועל`} tone="amber" />
      </div>

      {/* ספר-SP לצי */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4" dir="rtl">
        <h3 className="flex items-center gap-2 text-sm font-black"><Users className="h-4 w-4 text-amber-500" aria-hidden /> ספר-SP — מי-מהצי מחזיק מה (נמדד-חי)</h3>
        <p className="mt-1 text-[11px] text-zinc-500">ה-SP שנשאר אצל-הסוכנים = הון-הפעלה שלהם (resource credits + קוראטור). זה הכסף-שלא-נעלם — הוא-עובד.</p>
        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-white/5" dir="rtl">
          <table className="w-full text-right text-[11px]">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
              <tr><th className="px-3 py-2 font-bold">חשבון</th><th className="px-3 py-2 font-bold">SP</th><th className="px-3 py-2 font-bold">חלק-מהצי</th></tr>
            </thead>
            <tbody>
              {fleet.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-zinc-500">טרם-נמדד</td></tr>}
              {fleet.map(([k, v]) => (
                <tr key={k} className="border-t border-white/5">
                  <td className="px-3 py-1.5 font-mono text-zinc-200">{k}</td>
                  <td className="px-3 py-1.5 font-mono text-amber-300">{n3(v)}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{spToFleet > 0 ? `${Math.round((v / spToFleet) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* קצב-רווח */}
      <section className="grid gap-3 md:grid-cols-2" dir="rtl">
        {(["d24", "d7"] as const).map((k) => {
          const r = rr?.[k];
          return (
            <div key={k} className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black">{k === "d24" ? "קצב-24 שעות" : "קצב-7 ימים"}</h3>
                <VerdictBadge v={r?.verdict} />
              </div>
              {rr?.ok === false ? (
                <p className="mt-3 text-[11px] text-zinc-500">{rr.reason ?? "לא-נמדד — סריקת-הספר-בעיצומה (כנה)"}</p>
              ) : r ? (
                <div className="mt-3 space-y-1.5 font-mono text-[11px] text-zinc-300">
                  <p>נכנס: <span className="text-emerald-300">{n3(r.transfersIn.steem)} STEEM + {n3(r.transfersIn.sbd)} SBD</span></p>
                  <p>יוצא: <span className="text-red-300">{n3(r.transfersOut.steem)} STEEM + {n3(r.transfersOut.sbd)} SBD</span></p>
                  <p>עסקאות-מנוע: <span className="text-amber-300">{r.tradingFills}</span> חוץ · <span className="text-zinc-500">{(r as any).selfFills ?? 0} עצמיות(wash — לא-בחשבון)</span> · קוראטור: <span className="text-amber-300">{n3(r.curation?.vests)} VESTS</span></p>
                  <p className="border-t border-white/5 pt-1.5">שקול-נטו: <b className={r.netSteemEq >= 0 ? "text-emerald-300" : "text-red-300"}>{n3(r.netSteemEq)} STEEM</b></p>
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-zinc-500">—</p>
              )}
            </div>
          );
        })}
      </section>

      {/* חריגות + תוכנית */}
      <div className="grid gap-3 md:grid-cols-2" dir="rtl">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black"><AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden /> סכום-חריג — חוקים-גלויים</h3>
          <p className="mt-1 text-[11px] text-zinc-500">יציאה≥50 STEEM · צד-מחוץ-לרשימה · SP-יוצא-לא-מוכר. הכל נכתב ליומן.</p>
          <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {(d?.anomalies?.anomalies ?? []).slice().reverse().map((a, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-zinc-950/60 px-2.5 py-1.5 text-[10px]">
                <span className="font-bold text-amber-300">{a.kind}</span>
                {typeof a.amount === "number" && <span className="font-mono text-zinc-300"> · {n3(a.amount)} {a.currency}</span>}
                {a.party && <span className="font-mono text-zinc-400"> · {a.party}</span>}
                <span className="text-zinc-600"> · {tHe(a.ts ?? a.at)}</span>
              </div>
            ))}
            {(d?.anomalies?.count ?? 0) === 0 && <p className="text-[11px] text-zinc-500">אפס-חריגות (או-טרם-נסרק — כנה)</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden /> תוכנית-נזילות (dry-run · אפס-חתימה)</h3>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {(d?.plan?.steps ?? []).map((st, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-zinc-950/60 px-2.5 py-2 text-[10px]">
                <p className="flex items-center gap-1.5 font-bold text-zinc-200">
                  {st.dryRun ? <Lock className="h-3 w-3 text-amber-500" aria-hidden /> : <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden />}
                  {st.step}
                </p>
                <p className="mt-1 leading-4 text-zinc-400">{st.what}</p>
              </div>
            ))}
            {!d?.plan?.steps?.length && <p className="text-[11px] text-zinc-500">—</p>}
          </div>
        </section>
      </div>

      {/* פוטר-מקור */}
      <p className="text-center text-[10px] text-zinc-600">
        מקור: מנוע-הנזילות :3043 → STEEM RPC ציבורי · ספר-מלא {d?.engine?.ledgerRows != null ? `${d.engine.ledgerRows.toLocaleString("en-US")} ops` : "—"} ·
        סריקה-עמוקה: {d?.engine?.deepScanDone ? "הושלמה" : "בעיצומה (כנה)"} · נכון-ל-{tHe(s?.at)}
      </p>
    </div>
  );
}
