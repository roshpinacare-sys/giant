"use client";

import { useEffect, useState } from "react";
import { Banknote, Lock, Scale, ShieldCheck, TrendingDown, TrendingUp, Wallet } from "lucide-react";

/* ═══ פאנל-אמת-הכסף — התשובה-המדודה ל"איפה הכסף?" ═══════════════════════
 * הוראת-הבעלים (trace 1a14672a193f9255): "קיבלתי בערך 1100 STEEM ונראה שלפחות
 * 800 נעלמו — אפשר לבדוק מה קורה באמת". הפאנל מציג רק-מדידה מהשרשרת:
 *  · יתרות-אמת: נזיל + תחום-בהזמנות (הכסף-שסוחר-בפועל) + SP
 *  · פיצול עסקאות-עצמי (ווש) מזרימה-אמת — המקור-המדוד-לרושם-"כסף-שנעלם"
 *  · פסק-כנה: מרוויחים/מפסידים/אפס — נגזר-מהמספרים, לא-מסיפור
 * אם-השרשרת לא עונה — כתוב-במפורש. אפס-מספרים-מצוירים. */

interface AuditOrder {
  orderid: number;
  side: "buy" | "sell";
  price: number;
  baseAsset: string;
  baseAmount: number;
  created: string;
  farFromMidPct: number | null;
}

interface SteemAuditPayload {
  ok: boolean;
  building?: boolean;
  audit?: {
    at: string;
    account: string;
    live: boolean;
    stale: boolean;
    holdings: {
      liquidSteem: number | null;
      liquidSbd: number | null;
      savingsSteem: number | null;
      savingsSbd: number | null;
      lockedSteem: number | null;
      lockedSbd: number | null;
      openOrders: number | null;
      ownSp: number | null;
      delegatedOutSp: number | null;
    };
    midSbdPerSteem: number | null;
    orders: AuditOrder[];
    mispricedOrders: AuditOrder[];
    flow: {
      fromTs: string;
      toTs: string;
      realFills: number;
      washFills: number;
      washVolumeSteem: number;
      washVolumeSbd: number;
      soldSteem: number;
      receivedSbd: number;
      sellVwapSbdPerSteem: number | null;
      boughtSteem: number;
      spentSbd: number;
      buyVwapSbdPerSteem: number | null;
      netSteem: number;
      netSbd: number;
      netValueSbd: number | null;
      edgePct: number | null;
    } | null;
    transfers: {
      count: number;
      in: { ts: string; from: string; amount: string }[];
      out: { ts: string; to: string; amount: string }[];
    } | null;
    verdict: { he: string; making: "yes" | "no" | "flat" | "unknown" };
    lastError: string | null;
  };
}

const f = (n: number | null | undefined, d = 3) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";

export function SteemAuditPanel() {
  const [d, setD] = useState<SteemAuditPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/dex/steem/audit", { cache: "no-store" });
        const j = (await r.json()) as SteemAuditPayload;
        if (!alive) return;
        setD(j);
        setErr(j.ok ? null : "השרת מדווח-כשל");
      } catch {
        if (alive) setErr("השרת לא נגיש");
      }
    }
    void load();
    const iv = setInterval(load, 60_000); // מטמון-שרת 5 דק' — סקירה-כל-דקה
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const a = d?.audit;
  const h = a?.holdings;
  const flow = a?.flow ?? null;
  const marketSideSteem = (h?.liquidSteem ?? 0) + (h?.lockedSteem ?? 0);
  const marketSideSbd = (h?.liquidSbd ?? 0) + (h?.lockedSbd ?? 0);

  return (
    <section className="rounded-2xl border border-amber-700/30 bg-zinc-900/60 p-5" dir="rtl" aria-label="אמת-הכסף">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-zinc-100">
            <Banknote className="h-4 w-4 text-amber-400" aria-hidden />
            אמת-הכסף · headcorner — התשובה-המדודה ל&quot;איפה הכסף?&quot;
          </h3>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            יתרות-מהשרשרת · פיצול עסקאות-עצמי (ווש) מזרימה-אמת · חלון {flow ? `${flow.fromTs} .. ${flow.toTs.slice(0, 10)}` : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {a?.live ? (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-400">
              שרשרת-חי{d?.building ? " · מתרענן" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-400">שרשרת-לא-זמינה</span>
          )}
        </div>
      </div>

      {err && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs font-bold text-red-300">{err}</p>}
      {!d && !err && <p className="mt-3 text-[10px] text-zinc-500">טוען אמת מהשרשרת…</p>}

      {a && (
        <>
          {/* יתרות-אמת */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="STEEM נזיל מהשרשרת">
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-zinc-500">
                <Wallet className="h-3 w-3" aria-hidden /> STEEM נזיל
              </p>
              <p className="mt-1 font-mono text-sm font-black text-zinc-100">{f(h?.liquidSteem)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="SBD נזיל מהשרשרת">
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-zinc-500">
                <Wallet className="h-3 w-3" aria-hidden /> SBD נזיל
              </p>
              <p className="mt-1 font-mono text-sm font-black text-zinc-100">{f(h?.liquidSbd)}</p>
            </div>
            <div className="rounded-xl border border-sky-600/25 bg-sky-500/[0.04] p-3" title="הכסף-שסוחר-בפועל בתוך הזמנות-פתוחות על השוק-הפנימי">
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-sky-300/80">
                <Lock className="h-3 w-3" aria-hidden /> תחום-בהזמנות
              </p>
              <p className="mt-1 font-mono text-sm font-black text-sky-200">
                {f(h?.lockedSteem)} STEEM · {f(h?.lockedSbd)} SBD
              </p>
              <p className="mt-0.5 text-[9px] text-zinc-500">{f(h?.openOrders, 0)} הזמנות-פתוחות — עובד-במקום-לשבת</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="SP עצמי נטו (אחרי הפקדות-החוצה)">
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-zinc-500">
                <ShieldCheck className="h-3 w-3" aria-hidden /> SP עצמי
              </p>
              <p className="mt-1 font-mono text-sm font-black text-zinc-100">{f(h?.ownSp, 0)}</p>
              {h?.delegatedOutSp ? <p className="mt-0.5 text-[9px] text-zinc-500">מופקד-החוצה {f(h.delegatedOutSp, 0)} SP</p> : null}
            </div>
          </div>

          <p className="mt-2 text-[10px] text-zinc-500">
            סה&quot;כ צד-שוק: <span className="font-mono text-zinc-300">{f(marketSideSteem)} STEEM + {f(marketSideSbd)} SBD</span> · חסכונות {f(h?.savingsSteem)}/{f(h?.savingsSbd)} · מיד-שוק {f(a.midSbdPerSteem, 5)} SBD/STEEM
          </p>

          {/* הפיצול האמת: ווש מול זרימה */}
          {flow ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950 p-3" aria-label="פיצול-זרימה">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-zinc-100">
                  <Scale className="mr-1 inline h-3 w-3 text-zinc-400" aria-hidden />
                  הפיצול-שמסביר-הכל: עסקאות-עצמי (ווש) מול זרימה-אמת
                </p>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-black text-violet-300">
                    ווש {f(flow.washFills, 0)} עסקאות
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-black text-emerald-300">
                    אמת {f(flow.realFills, 0)} עסקאות
                  </span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                <div className="rounded-lg bg-white/[0.03] p-2" title="נפח-עסקאות-עצמי: הפקודות-שלנו-מתמלאות-מול-הפקודות-שלנו — אפס-השפעה-על-יתרות">
                  <p className="text-zinc-500">נפח-ווש</p>
                  <p className="font-mono text-violet-300">{f(flow.washVolumeSteem, 0)} STEEM · {f(flow.washVolumeSbd, 1)} SBD</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2" title="מכירות-אמת מול צד-שני אמיתי">
                  <p className="text-zinc-500">מכירות-אמת</p>
                  <p className="font-mono text-zinc-200">{f(flow.soldSteem, 1)} STEEM → {f(flow.receivedSbd, 2)} SBD</p>
                  <p className="text-zinc-500">VWAP {f(flow.sellVwapSbdPerSteem, 5)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2" title="קניות-אמת מול צד-שני אמיתי">
                  <p className="text-zinc-500">קניות-אמת</p>
                  <p className="font-mono text-zinc-200">{f(flow.boughtSteem, 1)} STEEM ← {f(flow.spentSbd, 2)} SBD</p>
                  <p className="text-zinc-500">VWAP {f(flow.buyVwapSbdPerSteem, 5)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2" title="שער-קנייה מול שער-מכירה — חיובי = קונים-יותר-מהר שמוכרים">
                  <p className="text-zinc-500">קצה-מחיר</p>
                  <p className={`font-mono ${(flow.edgePct ?? 0) > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                    {flow.edgePct !== null ? `${flow.edgePct > 0 ? "+" : ""}${f(flow.edgePct, 3)}%` : "—"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
                <span className="font-black text-zinc-200">פסק-מדידה: </span>
                {a.verdict.he}
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[10px] text-zinc-500">
              סריקת-הזרימה-מהשרשרת עוד-לא-ענתה (הסריקה-כבדה-מטמון-שרת) — לא ממציאים זרימה.
            </p>
          )}

          {/* העברות */}
          {a.transfers && (
            <p className="mt-2 text-[10px] text-zinc-500">
              העברות-בחלון: <span className="font-black text-zinc-300">{a.transfers.count === 0 ? "אפס — כלום לא יצא ולא נכנס מהחשבון" : `${a.transfers.in.length} נכנסו · ${a.transfers.out.length} יצאו`}</span>
              {a.transfers.out.length > 0 && (
                <span className="text-rose-300"> · יציאות: {a.transfers.out.map((t) => `${t.amount}→${t.to}`).join(", ")}</span>
              )}
            </p>
          )}

          {/* פסק-מרוויחים/מפסידים */}
          {flow && (
            <div
              className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black ${
                a.verdict.making === "yes"
                  ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
                  : a.verdict.making === "no"
                    ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-300"
                    : "border-zinc-500/30 bg-zinc-500/[0.06] text-zinc-300"
              }`}
            >
              {a.verdict.making === "no" ? (
                <TrendingDown className="h-4 w-4" aria-hidden />
              ) : a.verdict.making === "yes" ? (
                <TrendingUp className="h-4 w-4" aria-hidden />
              ) : (
                <Scale className="h-4 w-4" aria-hidden />
              )}
              {a.verdict.making === "yes"
                ? "עכשיו מרוויחים (נמדד)"
                : a.verdict.making === "no"
                  ? "עכשיו לא מרוויחים — נמדד ומוצג בכנות"
                  : "עכשיו כמעט-אפס — נמדד"}
              {flow.netValueSbd !== null && (
                <span className="font-mono font-normal text-zinc-400">
                  · זרימה-נטו {flow.netSteem >= 0 ? "+" : ""}{f(flow.netSteem, 1)} STEEM / {flow.netSbd >= 0 ? "+" : ""}{f(flow.netSbd, 2)} SBD ≈ {flow.netValueSbd >= 0 ? "+" : ""}{f(flow.netValueSbd, 2)} SBD במחיר-חי
                </span>
              )}
            </div>
          )}

          {/* הזמנות-חריגות */}
          {a.mispricedOrders.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[10px] text-amber-200">
              <p className="font-black">הזמנות-במחיר-חריג (נמדד &gt;5% מהמיד — סיכון-מוניטין-וסדר-שגוי):</p>
              <ul className="mt-1 space-y-0.5">
                {a.mispricedOrders.slice(0, 5).map((o) => (
                  <li key={o.orderid} className="font-mono">
                    #{o.orderid} {o.side === "sell" ? "מכירה" : "קנייה"} {f(o.baseAmount)} {o.baseAsset} @ {f(o.price, 5)} (סטייה {f(o.farFromMidPct, 1)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.lastError && (
            <p className="mt-2 text-[10px] text-zinc-600">כשל-אחרון (כנה): {a.lastError}</p>
          )}
        </>
      )}
    </section>
  );
}
