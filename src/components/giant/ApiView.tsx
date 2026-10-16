"use client";

import { useCallback, useEffect, useState } from "react";
import { ownerFetch } from "@/lib/owner-client";
import { Ban, Check, Copy, KeyRound, Play, Wallet, Zap } from "lucide-react";

/* ═══ ה-API-הציבורי — הדלת-של-החוץ ═════════════════════════════════════════
 * סוגר-את-הפער public-api מול-הענקים: כל-בורסה-אמת (Binance/Uniswap/Jupiter)
 * מחזיקה-API-מפתחות-למסחר-חוץ. עכשיו-גם-אנחנו — וזה-אמת:
 *  · מפתח-מונפק-פעם-אחת (sk-saos-…), בשרת רק sha256 · השוואה-בזמן-קבוע
 *  · כל-מפתח-סוחר-מהחשבון-שלו-בלבד (API:<prefix>) — לא-נוגע-בכסף-של-אף-אחד
 *  · מגבלת-קצב לכל-מפתח · כותרות X-RateLimit-* בכל-תשובה
 *  · אותו-מנוע-אמת של-הבעלים-והצי — הפקודה-החוצה נכנסת-לאותו-לדג'ר-ולאותם-נרות */

interface KeyRow {
  id: string;
  prefix: string;
  label: string;
  account: string;
  ratePerMin: number;
  requestCount: number;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

interface MarketsPayload {
  ok: boolean;
  count?: number;
  markets?: Array<{ pairId: string; symbol: string; price: number; native: boolean; tradable: boolean }>;
}

const ENDPOINTS: Array<{ method: string; path: string; auth: string; desc: string }> = [
  { method: "GET", path: "/api/public/v1/markets", auth: "פתוח", desc: "כל-הזוגות · מחיר-חי · נזילות" },
  { method: "GET", path: "/api/public/v1/depth?pair=", auth: "פתוח", desc: "ספר-הזמנות (AMM/Binance)" },
  { method: "GET", path: "/api/public/v1/candles?pair=&tf=", auth: "פתוח", desc: "נרות-אמת-מעסקאות" },
  { method: "GET", path: "/api/public/v1/ping", auth: "מפתח", desc: "בדיקת-חיות-מאומתת" },
  { method: "GET", path: "/api/public/v1/account", auth: "מפתח", desc: "המאזנים-שלי · פקודות-פתוחות" },
  { method: "GET", path: "/api/public/v1/orders?status=", auth: "מפתח", desc: "הפקודות-שלי" },
  { method: "POST", path: "/api/public/v1/orders", auth: "מפתח", desc: "מסחר: market/limit (side/amountIn)" },
  { method: "DELETE", path: "/api/public/v1/orders", auth: "מפתח", desc: "ביטול-פקודה-שלי {id}" },
];

const CURL_MARKETS = `curl -s http://<host>/api/public/v1/markets | jq '.markets[0]'`;
const CURL_ORDER = `curl -s -X POST http://<host>/api/public/v1/orders \\
  -H "Authorization: Bearer sk-saos-…" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"limit","pairId":"<pairId>","side":"BUY","limitPrice":1.50,"amountIn":100}'`;

const f2 = (n: number | null | undefined, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";

const timeHe = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

const METHOD_CLS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function ApiView() {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [label, setLabel] = useState("");
  const [rate, setRate] = useState("60");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [testRes, setTestRes] = useState<{ name: string; ok: boolean; ms: number; note: string } | null>(null);
  const [markets, setMarkets] = useState<MarketsPayload | null>(null);
  const [depKey, setDepKey] = useState("");
  const [depToken, setDepToken] = useState("USDS");
  const [depAmount, setDepAmount] = useState("");
  const [depMsg, setDepMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const res = await ownerFetch("/api/sovereign/api-keys", { cache: "no-store" });
      if (res.status === 401) { setOwner(false); setKeys([]); return; }
      setOwner(true);
      const d = (await res.json()) as { ok: boolean; keys: KeyRow[] };
      setKeys(d.ok ? d.keys : []);
    } catch {
      setOwner(false);
    }
  }, []);

  const loadMarkets = useCallback(async () => {
    try {
      const res = await fetch("/api/public/v1/markets", { cache: "no-store" });
      setMarkets((await res.json()) as MarketsPayload);
    } catch { setMarkets(null); }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(() => { void loadKeys(); void loadMarkets(); }, 0);
    return () => clearTimeout(t0);
  }, [loadKeys, loadMarkets]);

  const issue = async () => {
    if (!label.trim()) { setMsg("חסר-שם-למפתח — למי-הוא?"); return; }
    setBusy(true); setMsg("");
    try {
      const res = await ownerFetch("/api/sovereign/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim(), ratePerMin: Number(rate) || 60 }),
      });
      const d = (await res.json()) as { ok?: boolean; plaintext?: string; error?: string };
      if (d.ok && d.plaintext) {
        setPlaintext(d.plaintext);
        setLabel("");
        await loadKeys();
      } else {
        setMsg(d.error ?? "ההנפקה-נכשלה");
      }
    } catch { setMsg("השרת-לא-נגיש"); }
    setBusy(false);
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await ownerFetch("/api/sovereign/api-keys", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadKeys();
    } catch { setMsg("הביטול-נכשל"); }
    setBusy(false);
  };

  const deposit = async () => {
    const amount = Number(depAmount);
    if (!depKey || !Number.isFinite(amount) || amount <= 0) {
      setDepMsg({ ok: false, text: "בחר-מפתח-והזן-סכום-חיובי" });
      return;
    }
    setBusy(true); setDepMsg(null);
    try {
      const res = await ownerFetch("/api/dex/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toAccount: depKey, token: depToken, amount }),
      });
      const d = (await res.json()) as { ok?: boolean; ref?: string; error?: string; ownerBalance?: number; targetBalance?: number };
      if (d.ok) {
        setDepMsg({ ok: true, text: `הופקד ${f2(amount)} ${depToken} → ${depKey} · יתרת-בעלים ${f2(d.ownerBalance)} · יתרת-יעד ${f2(d.targetBalance)} (ref ${d.ref})` });
        setDepAmount("");
      } else {
        setDepMsg({ ok: false, text: d.error ?? "ההפקדה-נכשלה" });
      }
    } catch { setDepMsg({ ok: false, text: "השרת-לא-נגיש" }); }
    setBusy(false);
  };

  const selfTest = async () => {
    setTestRes(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/public/v1/markets", { cache: "no-store" });
      const d = (await res.json()) as MarketsPayload;
      setTestRes({
        name: "GET /markets",
        ok: d.ok === true && (d.count ?? 0) > 0,
        ms: Math.round(performance.now() - t0),
        note: d.ok ? `${d.count} זוגות-נמדדו-חי` : "כשל-מדידה",
      });
    } catch {
      setTestRes({ name: "GET /markets", ok: false, ms: Math.round(performance.now() - t0), note: "השרת-לא-נגיש" });
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* אין-הרשאת-לוח — הטקסט-גלוי-להעתקה-ידנית */ }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      {/* כותרת-כנה */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <KeyRound className="h-6 w-6 text-amber-400" aria-hidden />
          <h2 className="text-xl font-bold text-zinc-100">ה-API-הציבורי · v1</h2>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            חי · נמדד
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          הדלת-של-החוץ: משתמש-חוץ עם-מפתח-API יכול <b className="text-zinc-200">לסחור-באמת</b> על בריכת-האמת
          SAOS/USDS — אותו-מנוע, אותו-לדג&apos;ר, אותם-נרות כמו-הבעלים-והצי. כל-מפתח-סוחר מהחשבון-שלו-בלבד
          (<code className="text-amber-300">API:…</code>) — אי-אפשר-לגעת-בכסף-של-אף-אחד-אחר. בלי-נזילות-חוץ-אמת
          המסחר-החוצה מוגבל-למה-שנזקף-לחשבון — <b className="text-zinc-200">וזה-מוצהר-בכנות</b>.
        </p>
        {markets?.ok && (
          <p className="mt-2 text-xs text-zinc-500">
            עכשיו: {markets.count} זוגות-חי · נתוני-שוק-ציבוריים-ללא-מפתח · מסחר-מאומת-מפתח
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={selfTest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
          >
            <Play className="h-3.5 w-3.5" aria-hidden /> בדיקת-חיות-עכשיו
          </button>
          {testRes && (
            <span className={`text-xs ${testRes.ok ? "text-emerald-400" : "text-red-400"}`}>
              {testRes.name} · {testRes.ok ? "עובד" : "נכשל"} · {testRes.ms}ms · {testRes.note}
            </span>
          )}
        </div>
      </section>

      {/* טבלת-הנקודות */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">נקודות-הקצה</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-zinc-500">
                <th className="pb-2 pl-2">שיטה</th>
                <th className="pb-2 pl-2">נתיב</th>
                <th className="pb-2 pl-2">אימות</th>
                <th className="pb-2">מה-עושה</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path + e.method} className="border-t border-zinc-800/60">
                  <td className="py-2 pl-2">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold ${METHOD_CLS[e.method]}`}>
                      {e.method}
                    </span>
                  </td>
                  <td className="py-2 pl-2 font-mono text-xs text-zinc-300" dir="ltr">{e.path}</td>
                  <td className="py-2 pl-2 text-xs">{e.auth === "פתוח" ? <span className="text-emerald-400">פתוח</span> : <span className="text-amber-400">מפתח</span>}</td>
                  <td className="py-2 text-xs text-zinc-400">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-2">
          {[
            { id: "mkt", title: "דוגמה — קריאת-שוק (פתוח):", code: CURL_MARKETS },
            { id: "ord", title: "דוגמה — פקודת-לימיט (מפתח):", code: CURL_ORDER },
          ].map((c) => (
            <div key={c.id} className="rounded-lg border border-zinc-800 bg-black/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">{c.title}</span>
                <button
                  onClick={() => copy(c.code, c.id)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="העתק-דוגמה"
                >
                  {copied === c.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied === c.id ? "הועתק" : "העתק"}
                </button>
              </div>
              <pre className="overflow-x-auto text-left font-mono text-[11px] leading-relaxed text-emerald-300/90" dir="ltr">{c.code}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* ניהול-מפתחות — בעלים */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">ניהול-מפתחות · שער-הבעלים</h3>
          <span className={`text-xs ${owner ? "text-emerald-400" : "text-zinc-500"}`}>
            {owner === null ? "בודק…" : owner ? "בעלים-מחובר" : "אלמוני — כניסה-בשער-הריבונות"}
          </span>
        </div>

        {owner ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-zinc-400">
                שם-המפתח (למי)
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="לדוגמה: בוט-מסחר-שלי"
                  className="mt-1 block w-56 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
                />
              </label>
              <label className="text-xs text-zinc-400">
                מגבלת-קצב /דק&apos;
                <input
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  className="mt-1 block w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none"
                />
              </label>
              <button
                onClick={issue}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" aria-hidden /> הנפק-מפתח
              </button>
            </div>
            {msg && <p className="mt-2 text-xs text-red-400">{msg}</p>}

            {/* הפקדה-פנימית-אמת: OWNER → חשבון-מפתח (הדרך-היחידה-למפתח-להחזיק-כסף) */}
            <div className="mt-4 rounded-lg border border-zinc-800 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                <Wallet className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                הפקדה-פנימית-אמת לחשבון-מפתח — מזיזה-כסף-אמת מארנק-הבעלים (לא-טביעה)
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-zinc-400">
                  חשבון-מפתח
                  <select
                    value={depKey}
                    onChange={(e) => setDepKey(e.target.value)}
                    className="mt-1 block w-52 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none"
                  >
                    <option value="">— בחר —</option>
                    {keys.filter((k) => !k.revoked).map((k) => (
                      <option key={k.id} value={k.account}>{k.label} ({k.prefix}…)</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-zinc-400">
                  מטבע
                  <select
                    value={depToken}
                    onChange={(e) => setDepToken(e.target.value)}
                    className="mt-1 block w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none"
                  >
                    <option value="USDS">USDS</option>
                    <option value="SAOS">SAOS</option>
                  </select>
                </label>
                <label className="text-xs text-zinc-400">
                  סכום
                  <input
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    placeholder="100"
                    className="mt-1 block w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
                  />
                </label>
                <button
                  onClick={deposit}
                  disabled={busy || !depKey}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  הפקד
                </button>
              </div>
              {depMsg && (
                <p className={`mt-2 text-xs ${depMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{depMsg.text}</p>
              )}
            </div>

            {plaintext && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-amber-300">
                  המפתח-הגולמי — מוצג-פעם-אחת-בלבד, אחרי-רענון-הוא-אינו-ניתן-לשחזור:
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded bg-black/60 px-2 py-1.5 font-mono text-xs text-emerald-300" dir="ltr">{plaintext}</code>
                  <button
                    onClick={() => copy(plaintext, "pt")}
                    className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {copied === "pt" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <button
                  onClick={() => setPlaintext(null)}
                  className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-300"
                >
                  שמרתי-אותו — סגור
                </button>
              </div>
            )}

            <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-zinc-800/60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-950">
                  <tr className="text-right text-xs text-zinc-500">
                    <th className="p-2">קידומת</th>
                    <th className="p-2">שם</th>
                    <th className="p-2">חשבון</th>
                    <th className="p-2">שימושים</th>
                    <th className="p-2">שימוש-אחרון</th>
                    <th className="p-2">מצב</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {keys.length === 0 && (
                    <tr><td colSpan={7} className="p-4 text-center text-xs text-zinc-600">אין-מפתחות-עדיין — הנפק-ראשון</td></tr>
                  )}
                  {keys.map((k) => (
                    <tr key={k.id} className="border-t border-zinc-800/60">
                      <td className="p-2 font-mono text-xs text-zinc-300" dir="ltr">{k.prefix}…</td>
                      <td className="p-2 text-xs text-zinc-200">{k.label}</td>
                      <td className="p-2 font-mono text-[11px] text-zinc-500" dir="ltr">{k.account}</td>
                      <td className="p-2 text-xs text-zinc-400">{f2(k.requestCount, 0)}</td>
                      <td className="p-2 text-xs text-zinc-500">{timeHe(k.lastUsedAt)}</td>
                      <td className="p-2">
                        {k.revoked
                          ? <span className="text-xs text-red-400">בוטל</span>
                          : <span className="text-xs text-emerald-400">פעיל</span>}
                      </td>
                      <td className="p-2">
                        {!k.revoked && (
                          <button
                            onClick={() => revoke(k.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                            aria-label={`בטל-מפתח ${k.label}`}
                          >
                            <Ban className="h-3 w-3" /> בטל
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">
              ניהול-המפתחות-המלא-מוגן-בשער-headcorner — היכנס-דרך-מסך-הערוץ (הדלת-הראשית) וחזור-לכאן.
            </p>
            <p className="text-sm text-zinc-300">
              משתמש-חוץ? <b>אין-צורך-בבעלים</b> — ההצטרפות-העצמית-חיה:{" "}
              <a href="/join" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20">הנפק-לעצמך-מפתח → /join</a>
            </p>
          </div>
        )}
      </section>

      {/* חוקי-האמת */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">חוקי-האמת-של-ה-API</h3>
        <ul className="space-y-1.5 text-sm text-zinc-400">
          <li>· המפתח-הגולמי-מוצג-פעם-אחת; בשרת-נשמר-רק <code className="text-amber-300">sha256</code> — גם-אנחנו-לא-יכולים-לשחזר.</li>
          <li>· אימות-בהשוואה-בזמן-קבוע — אין-דליפת-תזמון.</li>
          <li>· חשבון-מבודד לכל-מפתח (<code className="text-amber-300">API:&lt;prefix&gt;</code>) — אי-אפשר-לסחור-מכסף-של-אחר, בדיקה: DELETE/POST על-פקודה-זרה → 404.</li>
          <li>· מגבלת-קצב בכותרות <code className="text-amber-300">X-RateLimit-*</code>; חריגה → 429 עם-זמן-המתנה.</li>
          <li>· כל-פקודה-חוצה חתומה בלדג&apos;ר: <code className="text-amber-300">source=API</code> + שם-המפתח — ביקורת-מלאה.</li>
          <li>· הצטרפות-עצמית (גל-76): <code className="text-amber-300">POST /api/public/v1/keys</code> ללא-אימות — חשבון-נולד-אפס · 5/שעה/IP · תקרה-400 · ביטול-עצמי-בלי-בעלים.</li>
        </ul>
      </section>
    </div>
  );
}
