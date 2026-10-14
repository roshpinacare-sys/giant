"use client";

import { useCallback, useEffect, useState } from "react";

/* ═══ ערוץ-הבעלים הישיר — הדלת-הראשית של GIANT ═══════════════════════════
 * זה-הערוץ-היחיד בין-הבעלים-לריבונות (SAOS-SOVEREIGN-CHANNEL/1, זרמי-גיט קנוניים):
 * · directives.jsonl — הבעלים מצווה כאן (append-only, חוק-בנחיתה)
 * · requests.jsonl — הריבונות מבקשת כאן (רק-שערי-סמכות-בעלים אמיתיים)
 * · notes.jsonl — דוחות/יכולות · voice.json — קול-הריבונות (מדיד וכן)
 * סוגר את "קומיט-ישיר-מהמשטח": הוראה בממשק ← איטום append-only בגיט.
 * אפס-שקר: כשל-מדידה מוצג ככשל; מספר שלא נמדד לא מוצג. */

interface StreamRow {
  [k: string]: unknown;
}
interface ChannelPayload {
  ok: boolean;
  note?: string;
  directives: StreamRow[];
  requests: StreamRow[];
  notes: StreamRow[];
  voice: StreamRow | null;
  fetchedAt: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function timeHe(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function statusChip(s: string): string {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-bold";
  if (s === "OPEN") return `${base} bg-amber-500/15 text-amber-400`;
  if (s.startsWith("SATISFIED")) return `${base} bg-emerald-500/15 text-emerald-400`;
  if (s === "WITHDRAWN") return `${base} bg-zinc-500/15 text-zinc-400`;
  if (s === "ACTIVE") return `${base} bg-emerald-500/15 text-emerald-400`;
  if (s === "REVOKED") return `${base} bg-red-500/15 text-red-400`;
  return `${base} bg-zinc-500/15 text-zinc-300`;
}

export function ChannelView() {
  const [data, setData] = useState<ChannelPayload | null>(null);
  const [err, setErr] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [keyField, setKeyField] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");
  const [law, setLaw] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/channel", { cache: "no-store" });
      const d = (await res.json()) as ChannelPayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "הזרמים לא נמדדו");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t = sessionStorage.getItem("soffice.ops");
    if (t) setToken(t);
    load();
    const iv = setInterval(load, 45_000);
    return () => clearInterval(iv);
  }, [load]);

  async function gate() {
    if (!keyField.trim() || gateBusy) return;
    setGateBusy(true);
    setGateErr("");
    const k = keyField;
    setKeyField(""); // מתרוקן מיד — אפס-שמירת-מפתח
    try {
      const res = await fetch("/api/office/ops/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: k }),
      });
      const d = (await res.json()) as { ok: boolean; token?: string; note?: string };
      if (d.ok && d.token) {
        sessionStorage.setItem("soffice.ops", d.token);
        setToken(d.token);
      } else setGateErr(d.note ?? "מפתח לא מאומת");
    } catch {
      setGateErr("השרת לא נגיש כרגע");
    } finally {
      setGateBusy(false);
    }
  }

  async function sendDirective() {
    if (!token || sendBusy) return;
    const lines = items.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (title.trim().length < 3 || lines.length < 1) {
      setSendNote({ ok: false, text: "כותרת (3+) וסעיף-הוראה אחד לפחות" });
      return;
    }
    setSendBusy(true);
    setSendNote(null);
    try {
      const res = await fetch("/api/giant/channel/directive", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), items: lines, law: law.trim() || undefined }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("soffice.ops");
        setToken(null);
        setSendNote({ ok: false, text: "הסשן פג — התחבר מחדש" });
        return;
      }
      const d = (await res.json()) as { ok: boolean; id?: string; note: string };
      setSendNote({ ok: d.ok, text: d.note });
      if (d.ok) {
        setTitle("");
        setItems("");
        setLaw("");
        load();
      }
    } catch {
      setSendNote({ ok: false, text: "השרת לא נגיש — ההוראה לא נאטמה (אפס-שקר)" });
    } finally {
      setSendBusy(false);
    }
  }

  const openReqs = (data?.requests ?? []).filter((r) => str(r.status) === "OPEN");
  const otherReqs = (data?.requests ?? []).filter((r) => str(r.status) !== "OPEN");

  return (
    <div className="space-y-5" dir="rtl">
      {/* כותרת-הערוץ */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-zinc-100">ערוץ-הבעלים הישיר · בעלים ↔ ריבונות</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              הערוץ-היחיד (SAOS-SOVEREIGN-CHANNEL/1) · זרמי-גיט קנוניים append-only · איטום append-only · אף סוכן אינו מעביר טענות מחוץ-לזרם-הזה
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${data?.ok ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
            <button onClick={load} className="h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-300 transition hover:border-amber-500/60 hover:text-amber-400">
              מדוד מחדש
            </button>
          </div>
        </div>
        {data && (
          <p className="mt-2 text-[10px] text-zinc-500">
            נמדד {timeHe(data.fetchedAt)} · {data.directives.length} הוראות · {data.requests.length} פניות ({openReqs.length} פתוחות) · {data.notes.length} רישומים
          </p>
        )}
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      </section>

      {/* פניות-הריבונות (requests) — ראשי */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-300">
          פניות-הריבונות אל-הבעלים
          {openReqs.length > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">{openReqs.length} פתוחות</span>}
        </h3>
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {[...openReqs, ...otherReqs].map((r, i) => (
            <article key={i} className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-400">{str(r.id)}</span>
                <span className={statusChip(str(r.status))}>{str(r.status)}</span>
                <span className="text-[10px] text-zinc-500">{timeHe(str(r.at))}</span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-zinc-100">{str(r.need)}</p>
              {Array.isArray(r.evidence) && (r.evidence as string[]).length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {(r.evidence as string[]).map((e, j) => (
                    <li key={j} className="truncate text-[11px] text-zinc-500" title={e}>· ראיה: {e}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {data && data.requests.length === 0 && <p className="text-xs text-zinc-500">אין פניות — הריבונות ממשיכה בלי-להמתין</p>}
        </div>
      </section>

      {/* מלחין-הוראות — שער-הבעלים */}
      <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-100">הבעלים מצווה כאן — הוראה-חדשה (חוק-בנחיתה)</h3>
          {token ? (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">שער פתוח · מפתח-מנהל מאומת</span>
          ) : (
            <span className="rounded-full bg-zinc-500/10 px-2.5 py-1 text-[10px] font-bold text-zinc-400">שער נעול</span>
          )}
        </div>

        {!token ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 p-4 sm:flex-row">
            <input
              type="password"
              value={keyField}
              onChange={(e) => setKeyField(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && gate()}
              placeholder="מפתח מנהל (headcorner)"
              autoComplete="off"
              aria-label="מפתח מנהל"
              className="h-11 flex-1 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-amber-500/70"
            />
            <button onClick={gate} disabled={gateBusy || !keyField.trim()} className="h-11 w-full rounded-lg bg-amber-600 px-6 text-sm font-bold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40 sm:w-auto">
              {gateBusy ? "בודק…" : "פתח את השער"}
            </button>
            {gateErr && <p className="text-xs text-red-400">{gateErr}</p>}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת-ההוראה"
              aria-label="כותרת-ההוראה"
              className="h-11 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm font-semibold text-zinc-100 outline-none focus:border-amber-500/70"
            />
            <textarea
              value={items}
              onChange={(e) => setItems(e.target.value)}
              rows={4}
              placeholder={"סעיפי-ההוראה — שורה-אחת לכל סעיף\nשורה-שנייה…"}
              aria-label="סעיפי-ההוראה"
              className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-amber-500/70"
            />
            <input
              value={law}
              onChange={(e) => setLaw(e.target.value)}
              placeholder="התייחסות-חוק (אופציונלי — למשל R344)"
              aria-label="התייחסות-חוק"
              className="h-10 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 text-xs text-zinc-300 outline-none focus:border-amber-500/70"
            />
            <div className="flex items-center gap-3">
              <button onClick={sendDirective} disabled={sendBusy} className="h-11 rounded-lg bg-amber-600 px-6 text-sm font-bold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40">
                {sendBusy ? "אוטם בזרם…" : "אטום הוראה בגיט"}
              </button>
              <p className="text-[10px] leading-4 text-zinc-500">
                append-only ל-directives.jsonl · קומיט-ישיר-מהמשטח · המפתח מתרוקן מיד ולעולם לא נשמר
              </p>
            </div>
            {sendNote && (
              <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${sendNote.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
                {sendNote.ok ? "✔ " : "✖ "}{sendNote.text}
              </p>
            )}
          </div>
        )}
      </section>

      {/* הוראות-הבעלים (directives) */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-zinc-300">הוראות-הבעלים (חוקים-חיים)</h3>
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {(data?.directives ?? []).slice().reverse().map((d, i) => (
            <article key={i} className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400">{str(d.id)}</span>
                <span className={statusChip(str(d.status))}>{str(d.status)}</span>
                <span className="text-[10px] text-zinc-500">{timeHe(str(d.at))}</span>
              </div>
              <p className="mt-2 text-sm font-bold text-zinc-100">{str(d.title)}</p>
              {Array.isArray(d.directive) && (
                <ul className="mt-1.5 space-y-1">
                  {(d.directive as string[]).map((s, j) => (
                    <li key={j} className="text-xs leading-5 text-zinc-400">· {s}</li>
                  ))}
                </ul>
              )}
              {str(d.law) && <p className="mt-1.5 text-[10px] text-zinc-600">חוק: {str(d.law)}</p>}
            </article>
          ))}
          {data && data.directives.length === 0 && <p className="text-xs text-zinc-500">אין הוראות בזרם</p>}
        </div>
      </section>

      {/* קול-הריבונות + רישומים */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-bold text-zinc-300">קול-הריבונות (מדיד)</h3>
          {data?.voice ? (
            <div className="space-y-1.5 text-xs leading-5 text-zinc-400">
              {Object.entries(data.voice)
                .filter(([k]) => !["PARSE_ERROR"].includes(k))
                .slice(0, 8)
                .map(([k, v]) => (
                  <p key={k}>
                    <span className="font-mono text-zinc-500">{k}</span> · <span className="text-zinc-300">{String(v).slice(0, 180)}</span>
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">קול-הריבונות טרם נמדד (UNAVAILABLE-כנה — אפס-הצגה-כמספר)</p>
          )}
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-bold text-zinc-300">רישומי-הערוץ (notes) — אחרונים</h3>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {(data?.notes ?? []).slice(-6).reverse().map((n, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-zinc-900 p-2.5">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="font-mono text-zinc-400">{str(n.id)}</span>
                  <span>{str(n.side)}</span>
                  <span>· {timeHe(str(n.at))}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-zinc-200">{str(n.title)}</p>
              </div>
            ))}
            {data && data.notes.length === 0 && <p className="text-xs text-zinc-500">אין רישומים</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
