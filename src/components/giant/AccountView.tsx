"use client";

/**
 * הדלת-שלי (T74 · הצי-הוא-הלקוח-הראשון) — מסע-הלקוח-המלא על-הריבונות:
 * רישום → כניסה → הצבת-פקודה → מילוי-אמיתי-מול-פקודה-מנוחה-של-חשבון-אחר → קבלה.
 * אפס-סימולציה: אין-מילוי-בלי-צד-שני-אמיתי; פקודה-שלא-חוצה נשארת-פתוחה-כנה.
 * אפס-תלות-חוץ: אימות-scrypt-מקומי · סשנים-מהבסיס-המקומי · הספר-הפנימי-ריבוני.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine, ArrowUpFromLine, KeyRound, LogIn, LogOut, Receipt,
  UserPlus, Users,
} from "lucide-react";

interface Me {
  id: string;
  email: string;
  name: string | null;
  crewId: string | null;
  lastLoginAt?: string | null;
}

interface Fill {
  priceMu: number;
  qty: number;
  counterpartyOrderId: string;
  counterpartyLabel: string;
  at: string;
}

interface MyOrder {
  id: string;
  side: string;
  qty: number;
  remaining: number;
  status: string;
  priceMu: number;
  refMidMu: number | null;
  fills: Fill[];
  createdAt: string;
}

interface BookRow {
  id: string;
  side: string;
  qty: number;
  remaining: number;
  status: string;
  priceMu: number;
  userLabel: string;
  userCrewId: string | null;
  createdAt: string;
}

interface OrdersPayload {
  ok: boolean;
  error?: string;
  me: Me;
  myOrders: MyOrder[];
  book: BookRow[];
  stats: { users: number; open: number; filled: number };
}

interface ExtBook {
  ok: boolean;
  source: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
}

const usd = (mu: number) => `$${(mu / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}`;
const q = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    FILLED: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400",
    PARTIAL: "border-amber-500/30 bg-amber-500/[0.08] text-amber-400",
    OPEN: "border-zinc-600 bg-white/[0.04] text-zinc-400",
  };
  const he: Record<string, string> = { FILLED: "התמלא", PARTIAL: "התמלא-חלקית", OPEN: "פתוחה" };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${map[status] ?? map.OPEN}`}>
      {he[status] ?? status}
    </span>
  );
}

export function AccountView() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [data, setData] = useState<OrdersPayload | null>(null);
  const [extBook, setExtBook] = useState<ExtBook | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  /* טופס-אימות */
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [crewId, setCrewId] = useState("");

  /* טופס-פקודה */
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("0.05");
  const [price, setPrice] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/customer-orders", { cache: "no-store" });
      if (res.status === 401) { setData(null); setMe(null); return; } /* הסשן-מת-בשרת — ה-UI יוצא-כנה */
      const d = (await res.json()) as OrdersPayload;
      if (d.ok) { setData(d); setMe(d.me); }
    } catch { /* fail-honest — המדידה-הקודמת נשארת */ }
  }, []);

  const loadBook = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/orderbook", { cache: "no-store" });
      const d = (await res.json()) as ExtBook;
      setExtBook(d);
    } catch { /* כנה */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const d = (await res.json()) as { user: Me | null };
        setMe(d.user);
      } catch { /* כנה */ }
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    if (!me) { setData(null); return; }
    loadOrders();
    loadBook();
    const iv = setInterval(() => { loadOrders(); loadBook(); }, 60_000);
    return () => clearInterval(iv);
  }, [me, loadOrders, loadBook]);

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null); setBusy(true);
    try {
      const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { email, password: pw, name: name || undefined, crewId: crewId || undefined }
        : { email, password: pw };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as { ok: boolean; error?: string; user?: Me };
      if (!d.ok) { setAuthError(d.error ?? "נכשל-כנה"); return; }
      setMe(d.user ?? null); setPw(""); setNotice(null);
    } catch {
      setAuthError("הרשת-כשלה-כנה — נסה-שוב");
    } finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setMe(null); setData(null); setNotice(null);
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null); setBusy(true);
    try {
      const res = await fetch("/api/giant/customer-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ side, qty: Number(qty), priceUsd: Number(price) }),
      });
      const d = (await res.json()) as {
        ok: boolean; error?: string; matched?: number;
        order?: { status: string; remaining: number; fills: { priceMu: number; qty: number; counterpartyLabel: string }[] };
      };
      if (!d.ok) { setNotice({ kind: "err", text: d.error ?? "הפקודה-נדחתה-כנה" }); return; }
      const o = d.order!;
      if (o.status === "FILLED") {
        const f = o.fills.map((f) => `${q(f.qty)}@${usd(f.priceMu)} מול ${f.counterpartyLabel}`).join(" · ");
        setNotice({ kind: "ok", text: `הפקודה התמלאה-מלא — ${f}` });
      } else if (o.status === "PARTIAL") {
        setNotice({ kind: "ok", text: `מילוי-חלקי — נשאר ${q(o.remaining)} פתוח על-הספר (${d.matched} מילויים)` });
      } else {
        setNotice({ kind: "ok", text: "הפקודה נרשמה ונשארת פתוחה-כנה — אין-חצייה בספר-כרגע (אפס-סימולציה)" });
      }
      await loadOrders();
    } catch {
      setNotice({ kind: "err", text: "הרשת-כשלה-כנה" });
    } finally { setBusy(false); }
  };

  if (booting) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 text-sm text-zinc-500" dir="rtl">בודק-סשן…</div>;
  }

  /* ═══ לא-מחובר: הדלת-עצמה ═══ */
  if (!me) {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="rounded-2xl border border-amber-600/25 bg-gradient-to-l from-amber-500/[0.08] via-white/[0.02] to-transparent p-5 giant-spec">
          <h2 className="text-lg font-black text-amber-200">הדלת-שלי — הצטרף-לריבונות-כלקוח</h2>
          <p className="mt-1 text-[13px] leading-6 text-zinc-400">
            אימות-ריבוני-מלא: scrypt-מקומי · סשן-בקוקי-HttpOnly · אפס-ספריות-חוץ · אפס-תלות-באף-גוף.
            הצי נרשם-כאן-בעצמו בתור-הלקוח-הראשון — מזהה-סוכן-אמיתי-מאומת-מול-רישום-הצי-החי.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={submitAuth} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5" aria-label={mode === "register" ? "רישום" : "כניסה"}>
            <div className="mb-4 flex gap-2" role="tablist" aria-label="בחירת-מצב-אימות">
              <button type="button" onClick={() => setMode("register")} aria-selected={mode === "register"} role="tab"
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${mode === "register" ? "border-amber-600/50 bg-amber-500/[0.1] text-amber-300" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"}`}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden /> הרשמה
              </button>
              <button type="button" onClick={() => setMode("login")} aria-selected={mode === "login"} role="tab"
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${mode === "login" ? "border-amber-600/50 bg-amber-500/[0.1] text-amber-300" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"}`}>
                <LogIn className="h-3.5 w-3.5" aria-hidden /> כניסה
              </button>
            </div>
            <label className="mb-1 block text-[11px] font-bold text-zinc-400" htmlFor="acc-email">אימייל</label>
            <input id="acc-email" type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/50" placeholder="agent@crew.giant" />
            {mode === "register" && (
              <>
                <label className="mb-1 block text-[11px] font-bold text-zinc-400" htmlFor="acc-name">שם-תצוגה (רשות)</label>
                <input id="acc-name" type="text" dir="ltr" value={name} onChange={(e) => setName(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/50" placeholder="dex-watch" />
                <label className="mb-1 block text-[11px] font-bold text-zinc-400" htmlFor="acc-crew">מזהה-סוכן-מרישום-הצי (רשות · מאומת-מול-הרישום-החי)</label>
                <input id="acc-crew" type="text" dir="ltr" value={crewId} onChange={(e) => setCrewId(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-amber-600/50" placeholder="console-dex-watch" />
              </>
            )}
            <label className="mb-1 block text-[11px] font-bold text-zinc-400" htmlFor="acc-pw">סיסמה {mode === "register" && "(מינימום 8 תווים)"}</label>
            <input id="acc-pw" type="password" required minLength={mode === "register" ? 8 : 1} dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)}
              className="mb-4 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/50" autoComplete={mode === "register" ? "new-password" : "current-password"} />
            {authError && <p className="mb-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-400" role="alert">{authError}</p>}
            <button type="submit" disabled={busy}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-sm font-black text-zinc-950 shadow-lg shadow-amber-600/20 transition hover:brightness-110 disabled:opacity-50">
              <KeyRound className="h-4 w-4" aria-hidden />
              {busy ? "מודד…" : mode === "register" ? "הירשם-לריבונות" : "היכנס"}
            </button>
          </form>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="text-sm font-black text-zinc-100">מה-מקבלים-מאחורי-הדלת</h3>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-6 text-zinc-400">
              <li className="flex gap-2"><Receipt className="mt-1 h-4 w-4 shrink-0 text-amber-400" aria-hidden /> הצבת-פקודות-מגבלה על-ספר-הפקודות-הפנימי-של-הריבונות</li>
              <li className="flex gap-2"><Users className="mt-1 h-4 w-4 shrink-0 text-amber-400" aria-hidden /> מילוי-אמיתי-מול-פקודות-מנוחה-של-חשבונות-אחרים (price-time priority)</li>
              <li className="flex gap-2"><Receipt className="mt-1 h-4 w-4 shrink-0 text-amber-400" aria-hidden /> קבלות-מילוי-מתועדות-שאינן-ניתנות-לזיוף — כל-מילוי מול-צד-שני-אמיתי</li>
              <li className="flex gap-2"><Users className="mt-1 h-4 w-4 shrink-0 text-amber-400" aria-hidden /> נתונים-שרק-החשבון-שלך רואה — סשן-אישי-מבוסס-בסיס</li>
            </ul>
            <p className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-2 text-[11px] leading-5 text-zinc-500">
              כנות: הספר-הפנימי הוא-ריבונות-טהורה — מילוי-רק-מבפנים, אפס-תלות-בחוץ. חיבור-כסף-חוץ-אמיתי = M4 במפת-האיחוד.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ מחובר: מסע-הלקוח ═══ */
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-600/25 bg-gradient-to-l from-amber-500/[0.08] via-white/[0.02] to-transparent p-5 giant-spec sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-amber-200">שלום, {me.name ?? me.email.split("@")[0]}</h2>
          <p className="mt-0.5 truncate text-xs text-zinc-400" dir="ltr">{me.email}</p>
          {me.crewId && (
            <span className="mt-1.5 inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2 py-0.5 font-mono text-[10px] font-bold text-amber-400" dir="ltr">
              צי: {me.crewId} · מאומת-מול-הרישום-החי
            </span>
          )}
        </div>
        <button onClick={logout} className="flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-zinc-300 transition hover:border-rose-500/40 hover:text-rose-400">
          <LogOut className="h-3.5 w-3.5" aria-hidden /> יציאה
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "חשבונות-אמת", value: data.stats.users },
            { label: "פקודות-פתוחות", value: data.stats.open },
            { label: "פקודות-שהתמלאו", value: data.stats.filled },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
              <p className="text-[10px] font-bold text-zinc-500">{s.label}</p>
              <p className="mt-1 text-xl font-black text-zinc-100">{s.value.toLocaleString("he-IL")}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* הצבת-פקודה */}
        <form onSubmit={placeOrder} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5" aria-label="הצבת-פקודה">
          <h3 className="text-sm font-black text-zinc-100">הצב-פקודת-מגבלה</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">מול-ספר-הפקודות-הפנימי · מילוי-רק-מול-פקודה-מנוחה-אמיתית</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="צד-הפקודה">
            <button type="button" onClick={() => setSide("buy")} aria-pressed={side === "buy"}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border text-sm font-black transition ${side === "buy" ? "border-emerald-500/40 bg-emerald-500/[0.1] text-emerald-400" : "border-white/[0.06] text-zinc-500"}`}>
              <ArrowDownToLine className="h-4 w-4" aria-hidden /> קנייה
            </button>
            <button type="button" onClick={() => setSide("sell")} aria-pressed={side === "sell"}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border text-sm font-black transition ${side === "sell" ? "border-rose-500/40 bg-rose-500/[0.1] text-rose-400" : "border-white/[0.06] text-zinc-500"}`}>
              <ArrowUpFromLine className="h-4 w-4" aria-hidden /> מכירה
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-zinc-400" htmlFor="ord-qty">כמות (BTC · עד 10)</label>
              <input id="ord-qty" type="number" dir="ltr" min="0.001" max="10" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} required
                className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-amber-600/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-zinc-400" htmlFor="ord-price">מחיר-מגבלה ($)</label>
              <input id="ord-price" type="number" dir="ltr" min="0.001" max="1000000" step="0.001" value={price} onChange={(e) => setPrice(e.target.value)} required
                className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-amber-600/50" />
            </div>
          </div>
          {extBook && (
            <p className="mt-2 text-[11px] leading-4 text-zinc-500">
              ייחוס-חוץ-חי {extBook.ok ? <>— {extBook.source}: bid {extBook.bestBid?.toLocaleString("en-US")} / ask {extBook.bestAsk?.toLocaleString("en-US")} · מרכז <b className="text-zinc-300">{extBook.mid?.toLocaleString("en-US")}</b> (יירשם-בפקודה)</> : "לא-נמדד (הספר-הפנימי-פועל-בלעדיו — ריבונות)"}
            </p>
          )}
          {notice && (
            <p className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${notice.kind === "ok" ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300" : "border-rose-500/25 bg-rose-500/[0.06] text-rose-400"}`} role="status">{notice.text}</p>
          )}
          <button type="submit" disabled={busy}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-sm font-black text-zinc-950 shadow-lg shadow-amber-600/20 transition hover:brightness-110 disabled:opacity-50">
            {busy ? "מציב-ומתאים…" : `הצב ${side === "buy" ? "קנייה" : "מכירה"} על-הספר-הפנימי`}
          </button>
        </form>

        {/* הספר-הפנימי */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-sm font-black text-zinc-100">ספר-הפקודות-הפנימי — הפתוחות</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">כל-הפקודות-הפתוחות-של-כל-החשבונות · חוק-אחד לכולם</p>
          <div className="mt-3 max-h-72 overflow-y-auto giant-scroll">
            {data && data.book.length > 0 ? (
              <table className="w-full text-right text-xs">
                <thead className="text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 font-bold">צד</th>
                    <th className="pb-2 font-bold">מחיר</th>
                    <th className="pb-2 font-bold">נשאר</th>
                    <th className="pb-2 font-bold">חשבון</th>
                  </tr>
                </thead>
                <tbody>
                  {data.book.map((r) => (
                    <tr key={r.id} className="border-t border-white/[0.04]">
                      <td className="py-2">
                        <span className={`font-black ${r.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{r.side === "buy" ? "קנייה" : "מכירה"}</span>
                      </td>
                      <td className="py-2 font-mono text-zinc-200" dir="ltr">{usd(r.priceMu)}</td>
                      <td className="py-2 font-mono text-zinc-400" dir="ltr">{q(r.remaining)}</td>
                      <td className="py-2">
                        <span className="text-zinc-300">{r.userLabel}</span>
                        {r.userCrewId && <span className="mr-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-400" dir="ltr">{r.userCrewId}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-8 text-center text-xs text-zinc-500">{data ? "הספר-ריק-כרגע — הצב-את-הפקודה-הראשונה" : "טוען-ספר…"}</p>
            )}
          </div>
        </div>
      </div>

      {/* הפקודות-שלי + קבלות */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="text-sm font-black text-zinc-100">הפקודות-שלי · הקבלות</h3>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto giant-scroll">
          {data && data.myOrders.length > 0 ? data.myOrders.map((o) => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-white/[0.06] bg-zinc-950/50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-black ${o.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{o.side === "buy" ? "קנייה" : "מכירה"}</span>
                <span className="font-mono text-xs text-zinc-200" dir="ltr">{q(o.qty)} @ {usd(o.priceMu)}</span>
                <StatusChip status={o.status} />
                {o.refMidMu !== null && <span className="text-[10px] text-zinc-600">ייחוס-בעת-הצבה: {usd(o.refMidMu)}</span>}
                <span className="ms-auto font-mono text-[10px] text-zinc-600" dir="ltr">{new Date(o.createdAt).toLocaleString("he-IL")}</span>
              </div>
              {o.remaining > 0 && o.status !== "OPEN" && (
                <p className="mt-1 text-[11px] text-amber-400/80">נשאר-פתוח: {q(o.remaining)}</p>
              )}
              {o.fills.length > 0 && (
                <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
                  <p className="text-[10px] font-bold text-emerald-400">קבלות-מילוי ({o.fills.length})</p>
                  {o.fills.map((f, i) => (
                    <p key={i} className="mt-0.5 text-[11px] text-zinc-300" dir="ltr">
                      {q(f.qty)} @ {usd(f.priceMu)} · מול {f.counterpartyLabel}
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )) : (
            <p className="py-8 text-center text-xs text-zinc-500">{data ? "עוד-אין-פקודות — הצב-את-הראשונה שלך" : "טוען…"}</p>
          )}
        </div>
      </div>
    </div>
  );
}
