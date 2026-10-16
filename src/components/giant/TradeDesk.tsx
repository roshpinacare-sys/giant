"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ownerFetch } from "@/lib/owner-client";
import { ArrowDownUp, Ban, CircleCheck, Clock, Lock, TicketCheck } from "lucide-react";

/* ═══ דוכן-המסחר — האפליקציה-האמיתית על כל-הבריכות-הילידות ═══════════════
 * הוראת-הבעלים (trace 1a13feac8b93b859): "אפליקציה ווב ממש ולא אתר".
 * וגל-94 (trace 1a146513162051a5): "הכל בדקס יהיה נזיל" — בורר-שוק-חי:
 * SAOS · STEEM · SBD · כל-הסקטורים — החלפת-שוק (AMM אמת), פקודות-לימיט
 * (נעילת-נזילות בלדג'ר · התאמה בטיקר · מילוי-מיידי לפקודה-ניתנת · ביטול).
 * כל-פעולה-מזיזה-כסף-אמת — חסומה-מאחורי שער-headcorner (401 כנה לאלמוני). */

type Side = "BUY" | "SELL";
type Tab = "swap" | "limit" | "orders";

interface OrderRow {
  id: string;
  side: Side;
  limitPrice: number;
  amountIn: number;
  status: "OPEN" | "FILLED" | "CANCELLED" | "MATCHING" | "CANCELLING";
  fillPrice: number | null;
  fillOut: number | null;
  createdAt: string;
  closedAt: string | null;
}
interface MarketRow {
  pairId: string;
  base: string;
  quote: string;
  price: number;
  chain: string;
}
interface OrdersPayload {
  ok: boolean;
  orders: OrderRow[];
  markets: MarketRow[];
  market: { pairId: string; base: string; quote: string; price: number } | null;
  error?: string;
}
interface QuoteBox {
  outAmount: number;
  effectivePrice: number;
  priceImpactPct: number;
  feePct: number;
  minOut: number;
}

const f2 = (n: number | null | undefined, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";
const timeHe = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
};

const STATUS_HE: Record<string, string> = {
  OPEN: "פתוחה",
  FILLED: "מולאה",
  CANCELLED: "בוטלה",
  MATCHING: "בהתאמה",
  CANCELLING: "מתבטלת",
};

export function TradeDesk() {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [data, setData] = useState<OrdersPayload | null>(null);
  const [wallet, setWallet] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>("swap");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairId, setPairId] = useState<string | null>(null); // בורר-השוק (אפס = ברירת-המחדל SAOS)
  // רפרנס-יציב לבורר-השוק (בלי-הדלקת-אפקט-בכל-רינדור)
  const currentPair = useRef<string | null>(null);
  currentPair.current = pairId;

  // טפסים
  const [side, setSide] = useState<Side>("BUY");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState("0.5");
  const [limitPrice, setLimitPrice] = useState("");
  const [quote, setQuote] = useState<QuoteBox | null>(null);

  // השוק-הנבחר: מהבורר; ברירת-מחדל — מהשרת (SAOS). עדכון-מחיר-חי מהרשימה.
  const markets = data?.markets ?? [];
  const market = markets.find((m) => m.pairId === pairId) ?? data?.market ?? null;
  const nativePrice = market?.price ?? null;

  const refresh = useCallback(async (selPair?: string | null) => {
    try {
      const [ro, rw] = await Promise.all([
        fetch(`/api/dex/orders${selPair ? `?pairId=${encodeURIComponent(selPair)}` : ""}`, { cache: "no-store" }),
        fetch("/api/dex/wallet", { cache: "no-store" }),
      ]);
      const o = (await ro.json()) as OrdersPayload;
      setData(o);
      if (rw.ok) {
        const w = (await rw.json()) as { balances?: Array<{ token: string; amount: number }> };
        const map: Record<string, number> = {};
        for (const b of w.balances ?? []) map[b.token] = b.amount;
        setWallet(map);
      }
    } catch { /* כנה: המסך ישאיר "—" */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await ownerFetch("/api/sovereign/auth", { cache: "no-store" });
        const d = (await r.json()) as { owner?: boolean };
        setOwner(d.owner === true);
      } catch { setOwner(false); }
    })();
    const iv = setInterval(() => void refresh(currentPair.current), 8_000); // קצב-הטיקר — הפקודות מתמלאות-חי
    const t0 = setTimeout(() => void refresh(currentPair.current), 0); // מדידה-ראשונה-מחוץ-גוף-האפקט
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [refresh]);

  async function getQuote() {
    if (!market || !Number(amount) || Number(amount) <= 0) {
      setMsg({ ok: false, text: "הזן סכום חיובי" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/dex/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairId: market.pairId, side, amountIn: Number(amount), slippagePct: Number(slip) || 0.5 }),
      });
      const d = (await r.json()) as { quote?: QuoteBox; error?: string };
      if (d.quote) { setQuote(d.quote); setMsg(null); }
      else setMsg({ ok: false, text: d.error ?? "ההצעה נכשלה" });
    } catch { setMsg({ ok: false, text: "השרת לא נגיש" }); }
    finally { setBusy(false); }
  }

  async function doSwap() {
    if (!market || !Number(amount) || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await ownerFetch("/api/dex/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairId: market.pairId, side, amountIn: Number(amount), slippagePct: Number(slip) || 0.5 }),
      });
      const d = (await r.json()) as { error?: string; authRequired?: boolean; trade?: { price: number }; newPrice?: number };
      if (r.status === 401 || d.authRequired) {
        setMsg({ ok: false, text: "המסחר מזיז כסף-אמת — פתח את שער-headcorner במסך 'הערוץ'" });
      } else if (r.ok) {
        setMsg({ ok: true, text: `ההחלפה בוצעה · מחיר-חדש ${f2(d.newPrice, 5)}` });
        setQuote(null);
      } else setMsg({ ok: false, text: d.error ?? "ההחלפה נכשלה" });
    } catch { setMsg({ ok: false, text: "השרת לא נגיש" }); }
    finally { setBusy(false); void refresh(); }
  }

  async function placeOrder() {
    if (!market || busy) return;
    const p = Number(limitPrice);
    const a = Number(amount);
    if (!p || p <= 0 || !a || a <= 0) {
      setMsg({ ok: false, text: "הזן מחיר-לימיט וסכום חיוביים" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await ownerFetch("/api/dex/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairId: market.pairId, side, limitPrice: p, amountIn: a }),
      });
      const d = (await r.json()) as { error?: string; authRequired?: boolean; immediateFill?: boolean; order?: OrderRow };
      if (r.status === 401 || d.authRequired) {
        setMsg({ ok: false, text: "פקודת-לימיט נועלת-כסף-אמת — פתח את שער-headcorner במסך 'הערוץ'" });
      } else if (r.ok) {
        setMsg({
          ok: true,
          text: d.immediateFill
            ? "הפקודה הוצבה ומולאה מיידית (המחיר-אצלך) — התוצרת כבר בארנק"
            : "הפקודה הוצבה · הכסף נעול בלדג'ר (עיקול) · תתמלא בטיקר כשהמחיר יפגוש אותה",
        });
      } else setMsg({ ok: false, text: d.error ?? "ההצבה נכשלה" });
    } catch { setMsg({ ok: false, text: "השרת לא נגיש" }); }
    finally { setBusy(false); void refresh(); }
  }

  async function cancelOrder(id: string) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await ownerFetch("/api/dex/orders", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      setMsg(r.ok && d.ok ? { ok: true, text: "הפקודה בוטלה · הכסף-הנעול חזר לארנק" } : { ok: false, text: d.error ?? "הביטול נכשל" });
    } catch { setMsg({ ok: false, text: "השרת לא נגיש" }); }
    finally { setBusy(false); void refresh(); }
  }

  const openCount = (data?.orders ?? []).filter((o) => o.status === "OPEN").length;
  const baseToken = market?.base ?? "SAOS";
  const tokenIn = side === "BUY" ? "USDS" : baseToken;
  const tokenOut = side === "BUY" ? baseToken : "USDS";

  function switchPair(next: string) {
    setPairId(next);
    setQuote(null);
    setMsg(null);
    setLimitPrice("");
    void refresh(next);
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof ArrowDownUp }> = [
    { id: "swap", label: "החלפת-שוק", icon: ArrowDownUp },
    { id: "limit", label: "פקודת-לימיט", icon: TicketCheck },
    { id: "orders", label: `הפקודות-שלי${openCount ? ` (${openCount})` : ""}`, icon: Clock },
  ];

  return (
    <section className="rounded-2xl border border-amber-600/25 bg-zinc-900/60 p-5" dir="rtl" aria-label="דוכן-המסחר">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-zinc-100">
            <ArrowDownUp className="h-4 w-4 text-amber-500" aria-hidden />
            דוכן-המסחר · {baseToken}/USDS — אפליקציה-אמת, לא-מסך
          </h3>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            מחיר-חי {f2(nativePrice, 6)} USDS · מנוע-AMM חי (טיק 8ש׳) · פקודות-לימיט עם נעילת-נזילות בלדג'ר
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="market-select">בורר-השוק</label>
          <select
            id="market-select"
            value={market?.pairId ?? ""}
            onChange={(e) => switchPair(e.target.value)}
            className="h-9 rounded-lg border border-amber-600/40 bg-zinc-950 px-2 text-xs font-bold text-amber-300 outline-none focus:border-amber-500"
            aria-label="בחירת-בריכת-מסחר"
          >
            {markets.map((m) => (
              <option key={m.pairId || `m-${m.base}`} value={m.pairId}>
                {m.base}/USDS · {f2(m.price, m.price > 10 ? 3 : 6)}
              </option>
            ))}
          </select>
          <span className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1 text-[10px] font-bold text-zinc-300" title="יתרת-ארנק-הבעלים מהלדג'ר">
            USDS <span className="font-mono text-amber-400">{f2(wallet.USDS ?? null)}</span>
          </span>
          <span className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1 text-[10px] font-bold text-zinc-300" title="יתרת-ארנק-הבעלים מהלדג'ר">
            {baseToken} <span className="font-mono text-amber-400">{f2(wallet[baseToken] ?? null, 4)}</span>
          </span>
        </div>
      </div>

      {/* טאבים */}
      <div className="mt-3 flex gap-1.5" role="tablist" aria-label="מצבי-הדוכן">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setTab(t.id);
                setQuote(null);
                setMsg(null);
                // מילוי-מחיר-לימיט-ברירת-מחדל בלחיצה (לא-באפקט — חוקי-הוק)
                if (t.id === "limit" && !limitPrice && nativePrice) setLimitPrice(nativePrice.toFixed(4));
              }}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${
                on ? "border-amber-600/50 bg-amber-500/10 text-amber-400" : "border-white/10 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {owner === false && (
        <div className="mt-3 rounded-xl border border-amber-600/30 bg-amber-500/[0.05] p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            המסחר מזיז כסף-אמת מארנק-הבעלים — נדרש שער-headcorner
          </p>
          <p className="mt-1 text-[10px] leading-5 text-zinc-400">
            כל-פקודה, הצבה וביטול חסומים לאלמוני (401 כנה). הכניסה דרך מסך <b>הערוץ</b> — המפתח של headcorner.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("giant-navigate", { detail: "channel" }))}
            className="mt-2 min-h-[40px] rounded-lg bg-amber-600 px-4 text-xs font-black text-zinc-950 transition hover:bg-amber-500"
          >
            עבור לשער-headcorner
          </button>
        </div>
      )}

      {owner === true && (
        <>
          {msg && (
            <p
              role="status"
              className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${msg.ok ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300" : "border-red-500/30 bg-red-500/[0.06] text-red-300"}`}
            >
              {msg.ok && <CircleCheck className="ml-1.5 inline h-3.5 w-3.5" aria-hidden />}
              {msg.text}
            </p>
          )}

          {(tab === "swap" || tab === "limit") && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase text-zinc-500">כיוון</p>
                <div className="flex gap-1.5">
                  {(["BUY", "SELL"] as Side[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSide(s); setQuote(null); }}
                      aria-pressed={side === s}
                      className={`min-h-[40px] flex-1 rounded-lg border text-xs font-black transition ${
                        side === s
                          ? s === "BUY"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                            : "border-rose-500/50 bg-rose-500/10 text-rose-300"
                          : "border-white/10 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {s === "BUY" ? `קניית ${baseToken}` : `מכירת ${baseToken}`}
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-[10px] font-bold text-zinc-500">
                  סכום ({tokenIn})
                  <input
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                    inputMode="decimal"
                    placeholder={side === "BUY" ? "למשל 100" : "למשל 10"}
                    className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 font-mono text-sm text-zinc-100 outline-none focus:border-amber-500/70"
                  />
                </label>
                {tab === "swap" && (
                  <label className="mt-2 block text-[10px] font-bold text-zinc-500">
                    סף-החלקה (%)
                    <input
                      value={slip}
                      onChange={(e) => setSlip(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 font-mono text-sm text-zinc-100 outline-none focus:border-amber-500/70"
                    />
                  </label>
                )}
              </div>

              <div>
                {tab === "limit" && (
                  <label className="block text-[10px] font-bold text-zinc-500">
                    מחיר-לימיט (USDS ל-SAOS) {nativePrice ? `· שוק-עכשיו ${f2(nativePrice, 5)}` : ""}
                    <input
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 font-mono text-sm text-zinc-100 outline-none focus:border-amber-500/70"
                    />
                  </label>
                )}
                {quote && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-zinc-950 p-3 text-[11px] leading-6" aria-live="polite">
                    <p className="text-zinc-400">תקבל בערך <b className="font-mono text-emerald-300">{f2(quote.outAmount, 6)} {tokenOut}</b></p>
                    <p className="text-zinc-500">מחיר-אפקטיבי {f2(quote.effectivePrice, 6)} · פגיעת-מחיר {f2(quote.priceImpactPct)}% · עמלה {f2(quote.feePct)}%</p>
                  </div>
                )}
                {tab === "limit" && (
                  <p className="mt-2 rounded-lg border border-amber-600/20 bg-amber-500/[0.04] px-3 py-2 text-[10px] leading-5 text-amber-300/90">
                    <Lock className="ml-1 inline h-3 w-3" aria-hidden />
                    בהצבה — הסכום <b>נעול בלדג'ר</b> (עיקול OWNER→ESCROW). BUY מתמלא רק כשהמחיר-האפקטיבי ≤ הלימיט; SELL רק ≥. ביטול משחרר בשלמותו.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {tab === "swap" && (
              <>
                <button onClick={getQuote} disabled={busy} className="min-h-[44px] rounded-xl border border-white/15 bg-zinc-950 px-4 text-xs font-black text-zinc-200 transition hover:border-amber-600/40 hover:text-amber-400 disabled:opacity-50">
                  בקש-הצעה
                </button>
                <button onClick={doSwap} disabled={busy || !quote} className="min-h-[44px] rounded-xl bg-amber-600 px-5 text-xs font-black text-zinc-950 shadow-[0_8px_24px_-10px_rgba(245,158,11,0.6)] transition hover:bg-amber-500 disabled:opacity-50">
                  בצע-החלפה
                </button>
              </>
            )}
            {tab === "limit" && (
              <button onClick={placeOrder} disabled={busy} className="min-h-[44px] rounded-xl bg-amber-600 px-5 text-xs font-black text-zinc-950 shadow-[0_8px_24px_-10px_rgba(245,158,11,0.6)] transition hover:bg-amber-500 disabled:opacity-50">
                הצב-פקודת-לימיט
              </button>
            )}
          </div>

          {tab === "orders" && (
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-white/10" role="region" aria-label="רשימת-הפקודות">
              <table className="w-full min-w-[560px] text-right text-[11px]">
                <thead className="sticky top-0 bg-zinc-950/95 text-[9px] uppercase text-zinc-500 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2">מצב</th>
                    <th className="px-3 py-2">כיוון</th>
                    <th className="px-3 py-2">לימיט</th>
                    <th className="px-3 py-2">סכום-נעול</th>
                    <th className="px-3 py-2">מילוי</th>
                    <th className="px-3 py-2">שעה</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.orders ?? []).map((o) => (
                    <tr key={o.id} className="border-t border-white/5">
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                          o.status === "OPEN" ? "bg-amber-500/10 text-amber-400"
                          : o.status === "FILLED" ? "bg-emerald-500/10 text-emerald-400"
                          : o.status === "CANCELLED" ? "bg-zinc-500/10 text-zinc-400"
                          : "bg-white/5 text-zinc-400"
                        }`}>{STATUS_HE[o.status] ?? o.status}</span>
                      </td>
                      <td className={`px-3 py-2 font-bold ${o.side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{o.side === "BUY" ? "קנייה" : "מכירה"}</td>
                      <td className="px-3 py-2 font-mono text-zinc-300">{f2(o.limitPrice, 6)}</td>
                      <td className="px-3 py-2 font-mono text-zinc-400">{f2(o.amountIn, 4)} {o.side === "BUY" ? "USDS" : "SAOS"}</td>
                      <td className="px-3 py-2 font-mono text-emerald-300/90">{o.fillPrice != null ? `@ ${f2(o.fillPrice, 6)} → ${f2(o.fillOut, 4)}` : "—"}</td>
                      <td className="px-3 py-2 font-mono text-zinc-500">{timeHe(o.closedAt ?? o.createdAt)}</td>
                      <td className="px-3 py-2">
                        {o.status === "OPEN" && (
                          <button onClick={() => cancelOrder(o.id)} disabled={busy} aria-label={`בטל פקודה ${o.id}`} className="flex min-h-[32px] items-center gap-1 rounded-lg border border-red-500/30 px-2 text-[10px] font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50">
                            <Ban className="h-3 w-3" aria-hidden />
                            בטל
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(data?.orders ?? []).length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-500">אין-פקודות עדיין — הצב פקודת-לימיט ראשונה</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {owner === null && (
        <p className="mt-3 text-xs text-zinc-500">בודק-את-השער…</p>
      )}
    </section>
  );
}
