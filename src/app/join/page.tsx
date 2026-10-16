"use client";

/**
 * /join — הצטרפות-עצמית לחוץ (גל-76 · דלת-המשתמש-החוץ)
 * ═════════════════════════════════════════════════════════════════════
 * עד-היום משתמש-חוץ היה-צריך-את-הבעלים-כדי-לקבל-מפתח — חסם-אנושי.
 * עכשיו: הנפקה-עצמית → בדיקה-עצמית → הפקדה-מבוקרת → מסחר-מאומת → ביטול-עצמי.
 * הכנות-מוצהרת-על-העמוד: החשבון-נולד-אפס · ההפקדה-היום-פנימית (שרשרת-חוץ-בדרך) ·
 * המפתח-נשמר-בזיכרון-הדפדפן-בלבד (אף-לא-localStorage — פרטיות-קודם).
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { Ban, Check, Copy, KeyRound, LineChart, Play, ShieldCheck, Wallet } from "lucide-react";

interface IssuedKey {
  prefix: string;
  label: string;
  account: string;
  ratePerMin: number;
}

interface SelfStatus {
  ok: boolean;
  key?: {
    prefix: string;
    label: string;
    account: string;
    ratePerMin: number;
    requestCount: number;
    revoked: boolean;
  };
  balances?: Array<{ token: string; balance: number }>;
  openOrders?: number;
  error?: string;
}

const CURL_SELFTEST = `curl -s http://<host>/api/public/v1/account \\
  -H "Authorization: Bearer sk-saos-…"`;
const CURL_ORDER = `curl -s -X POST http://<host>/api/public/v1/orders \\
  -H "Authorization: Bearer sk-saos-…" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"limit","pairId":"<pairId>","side":"BUY","limitPrice":1.50,"amountIn":100}'`;

const f2 = (n: number | null | undefined, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";

export default function JoinPage() {
  const [label, setLabel] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState<SelfStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [confirmKill, setConfirmKill] = useState(false);

  const authHeaders = (key: string) => ({ Authorization: `Bearer ${key.trim()}` });

  const copy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* אין-הרשאת-לוח — העתקה-ידנית */ }
  }, []);

  const issue = async () => {
    setBusy(true); setMsg(null); setPlaintext(null); setIssued(null);
    try {
      const res = await fetch("/api/public/v1/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "external" }),
      });
      const d = (await res.json()) as { ok?: boolean; plaintext?: string; key?: IssuedKey; error?: string };
      if (d.ok && d.plaintext && d.key) {
        setPlaintext(d.plaintext);
        setIssued(d.key);
        setPasted(d.plaintext);
        setMsg({ ok: true, text: `המפתח-נולד · החשבון ${d.key.account} נולד-אפס — זה-מוצהר` });
      } else {
        setMsg({ ok: false, text: d.error ?? "ההנפקה-נכשלה" });
      }
    } catch { setMsg({ ok: false, text: "השרת-לא-נגיש" }); }
    setBusy(false);
  };

  const selfTest = async () => {
    if (!pasted.trim()) { setMsg({ ok: false, text: "הדבק-את-המפתח-שלך (או הנפק-חדש)" }); return; }
    setBusy(true); setMsg(null); setStatus(null);
    try {
      const res = await fetch("/api/public/v1/keys", { headers: authHeaders(pasted), cache: "no-store" });
      const d = (await res.json()) as SelfStatus;
      setStatus(d);
      if (d.ok && d.key) {
        setMsg({ ok: true, text: `המפתח-חי · ${d.key.requestCount} קריאות-נמדדו · מגבלה ${d.key.ratePerMin}/דק'` });
      } else {
        setMsg({ ok: false, text: d.error ?? "הבדיקה-נכשלה" });
      }
    } catch { setMsg({ ok: false, text: "השרת-לא-נגיש" }); }
    setBusy(false);
  };

  const kill = async () => {
    if (!pasted.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/public/v1/keys", { method: "DELETE", headers: authHeaders(pasted) });
      const d = (await res.json()) as { ok?: boolean; revoked?: string; error?: string; note?: string };
      if (d.ok) {
        setMsg({ ok: true, text: `המפתח ${d.revoked} מת-מיד · ${d.note ?? ""}` });
        setStatus(null); setConfirmKill(false);
      } else {
        setMsg({ ok: false, text: d.error ?? "הביטול-נכשל" });
      }
    } catch { setMsg({ ok: false, text: "השרת-לא-נגיש" }); }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100" dir="rtl">
      {/* כותרת */}
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-amber-400" aria-hidden />
            <div>
              <h1 className="text-lg font-bold">הצטרפות-חוץ · מפתח-מסחר-עצמי</h1>
              <p className="text-xs text-zinc-500">בריכת-האמת SAOS/USDS · אותו-מנוע של-הבעלים-והצי</p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            חזרה-למשרד
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-4 md:p-6">
        {/* חוקי-האמת — מוצהר-בראש */}
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-300">
            <ShieldCheck className="h-4 w-4" aria-hidden /> חוקי-האמת — קרא-לפני-ההנפקה
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-zinc-300">
            <li>· החשבון-שלך <b>נולד-אפס</b> — אי-אפשר-לסחור-מכסף-שלא-הופקד-לך (נמדד: חריגה-נחסמת).</li>
            <li>· המפתח-הגולמי-מוצג <b>פעם-אחת</b>; בשרת-יש-רק sha256 — גם-אנחנו-לא-נוכל-לשחזר.</li>
            <li>· המפתח-נשמר-אצלך-בזיכרון-הדפדפן-בלבד — <b>אף-לא-localStorage</b> (פרטיות-קודם).</li>
            <li>· ההפקדה-היום דרך-מסילת-ההפקדות-המבוקרת — <b>שרשרת-חוץ-עוד-בדרך</b> (מוצהר-במטריצה).</li>
            <li>· ביטול-עצמי-בלי-בעלים — המפתח-שלך, המוות-שלו-שלך.</li>
          </ul>
        </section>

        {/* שלב-1: הנפקה */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">שלב-1 · הנפקה-עצמית</h2>
          <p className="mt-1 text-xs text-zinc-500">ללא-אימות · עד 5 הנפקות/שעה לכתובת · חשבון-חדש = אפס-יתרה</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-zinc-400">
              שם-המפתח (רשות)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="לדוגמה: בוט-המסחר-שלי"
                maxLength={40}
                className="mt-1 block w-60 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
              />
            </label>
            <button
              onClick={issue}
              disabled={busy}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
            >
              הנפק-מפתח-לעצמי
            </button>
          </div>
          {plaintext && issued && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-300">
                המפתח-הגולמי — מוצג-פעם-אחת-בלבד, אחרי-רענון-אין-שחזור:
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-black/60 px-2 py-1.5 font-mono text-xs text-emerald-300" dir="ltr">{plaintext}</code>
                <button
                  onClick={() => copy(plaintext, "pt")}
                  className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  aria-label="העתק-מפתח"
                >
                  {copied === "pt" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-zinc-500" dir="ltr">{issued.account} · rate {issued.ratePerMin}/min</p>
            </div>
          )}
        </section>

        {/* שלב-2: מפתח-קיים + בדיקה-עצמית */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">שלב-2 · המפתח-שלי · בדיקה-עצמית</h2>
          <p className="mt-1 text-xs text-zinc-500">הדבק-מפתח-קיים (sk-saos-…) — הוא-לא-נשמר-בשום-אחסון</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-zinc-400">
              המפתח-שלי
              <input
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="sk-saos-…"
                className="mt-1 block w-80 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
                dir="ltr"
                autoComplete="off"
              />
            </label>
            <button
              onClick={selfTest}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden /> בדוק-את-עצמי
            </button>
          </div>
          {status?.ok && status.key && (
            <div className="mt-3 grid gap-2 rounded-lg border border-zinc-800 bg-black/20 p-3 text-sm sm:grid-cols-2">
              <div><span className="text-zinc-500">חשבון:</span> <code className="font-mono text-xs text-zinc-300" dir="ltr">{status.key.account}</code></div>
              <div><span className="text-zinc-500">שם:</span> {status.key.label}</div>
              <div><span className="text-zinc-500">קריאות-נמדדו:</span> {f2(status.key.requestCount, 0)}</div>
              <div><span className="text-zinc-500">מגבלה:</span> {status.key.ratePerMin}/דק&apos;</div>
              <div className="sm:col-span-2">
                <span className="text-zinc-500">יתרות-חיות:</span>{" "}
                {status.balances && status.balances.length > 0
                  ? status.balances.map((b) => `${f2(b.balance)} ${b.token}`).join(" · ")
                  : "אפס (חשבון-ריק — כנה)"}
              </div>
              <div className="sm:col-span-2"><span className="text-zinc-500">פקודות-פתוחות:</span> {f2(status.openOrders ?? 0, 0)}</div>
            </div>
          )}
          {msg && (
            <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`} role="status">{msg.text}</p>
          )}
        </section>

        {/* שלב-3: הפקדה */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-400">
            <Wallet className="h-4 w-4 text-amber-400" aria-hidden /> שלב-3 · הפקדה-מבוקרת
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            החשבון-שלך נולד-אפס. ההפקדה-אליו עוברת-היום דרך-<b className="text-zinc-200">מסילת-ההפקדות-המבוקרת</b> (כסף-אמת-מהקופה,
            אפס-טביעה). השרשרת-החוצה-עוד-בדרך — <b className="text-zinc-200">מוצהר-בכנות במטריצת-הפער</b>, לא-מעוטר.
            פנה-בערוץ-הבעלים עם-מזהה-החשבון-שלך להפקדה.
          </p>
        </section>

        {/* שלב-4: מסחר */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-400">
            <LineChart className="h-4 w-4 text-amber-400" aria-hidden /> שלב-4 · מסחר-מאומת
          </h2>
          <div className="mt-3 space-y-2">
            {[
              { id: "c1", title: "בדיקת-חיות של-המפתח:", code: CURL_SELFTEST },
              { id: "c2", title: "פקודת-לימיט (סוחר-רק-מהכסף-שלך):", code: CURL_ORDER },
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-400"
            >
              לשולחן-המסחר-במשרד
            </Link>
            <span className="self-center text-xs text-zinc-500">הקריאה-הציבורית (markets/depth/candles) פתוחה-בלי-מפתח · הכתיבה-מאומתת</span>
          </div>
        </section>

        {/* שלב-5: ביטול-עצמי */}
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-red-400">
            <Ban className="h-4 w-4" aria-hidden /> שלב-5 · ביטול-עצמי
          </h2>
          <p className="mt-2 text-sm text-zinc-400">המפתח-מת-מיד-בשרת (רק ה-hash-היה-שם מלכתחילה). הפקודות-הפתוחות-נשארות-בלדג&apos;ר-לביקורת.</p>
          {confirmKill ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={kill}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                כן — הרוג-את-המפתח
              </button>
              <button
                onClick={() => setConfirmKill(false)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmKill(true)}
              disabled={busy || !pasted.trim()}
              className="mt-3 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              בטל-את-המפתח-שלי
            </button>
          )}
        </section>
      </main>

      {/* פוטר-דביק */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 p-4 text-xs text-zinc-600">
          <span>GIANT · בריכת-האמת · הצטרפות-חוץ-עצמית (גל-76)</span>
          <span>המפתח-שלך-בזיכרון-בלבד · אפס-אחסון-צד-דפדפן</span>
        </div>
      </footer>
    </div>
  );
}
