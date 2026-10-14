"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyRound, Lock, RefreshCw, Send, ShieldCheck, Sparkles, GitCommitHorizontal } from "lucide-react";

/* ═══ הערוץ — הדלת-הראשית של GIANT (SAOS-SOVEREIGN-CHANNEL/1) ════════════
 * הערוץ-היחיד בעלים↔ריבונות: זרמי-גיט קנוניים append-only.
 * · requests — הריבונות מבקשת · directives — הבעלים מכריע (GRANT/DECLINE + חוק-חופשי)
 * · notes — רישומי-מערכת · voice — קול-הריבונות (מסילת-LLM, אכיפת-מספר-זר)
 * כל כתיבה מאחורי שער-המנהל (headcorner): דיגסט-בלבד, אפס-שמירת-מפתח. */

interface FileMeta {
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  ageMinutes: number | null;
}
interface DirectiveLine {
  id: string;
  at: string;
  by: string;
  title: string;
  directive: string[];
  status: string;
  law?: string;
}
interface RequestLine {
  id: string;
  at: string;
  by: string;
  need: string;
  evidence: string[];
  deadline: string;
  status: string;
  origin: string;
  effectiveStatus?: string;
}
interface NoteLine {
  id: string;
  at: string;
  side: string;
  kind: string;
  title: string;
  body: string;
}
interface VoiceState {
  at?: string;
  status?: string;
  model?: string;
  summary?: string | null;
  reason?: string;
}
interface ChannelPayload {
  ok: boolean;
  spec?: string;
  error?: string;
  streams?: Record<string, FileMeta>;
  directives?: DirectiveLine[];
  requests?: { canonical?: RequestLine[]; legacy?: RequestLine[] };
  notes?: NoteLine[];
  voice?: VoiceState | null;
}

const TOKEN_KEY = "giant.owner.token";

function timeHe(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}

function StatusChip({ s }: { s: string }) {
  const v = s || "?";
  const cls =
    v === "OPEN"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : v === "GRANTED" || v.startsWith("SATISFIED")
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        : v === "DECLINED"
          ? "bg-red-500/15 text-red-400 border-red-500/30"
          : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>{v}</span>;
}

function MetaChip({ label, m }: { label: string; m?: FileMeta }) {
  if (!m) return null;
  return (
    <span
      className="rounded-full border border-white/5 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] text-zinc-500"
      title={`${m.path ?? ""} · bytes:${m.bytes ?? "—"} · sha16:${m.sha16 ?? "—"}`}
    >
      {label}: {m.exists ? `sha16:${m.sha16?.slice(0, 8)} · ${ageHe(m.ageMinutes)}` : "חסר-כנה"}
    </span>
  );
}

export function ChannelView() {
  const [data, setData] = useState<ChannelPayload | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [keyField, setKeyField] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

  const [dTitle, setDTitle] = useState("");
  const [dPoints, setDPoints] = useState("");
  const [dNote, setDNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  const [askText, setAskText] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askRes, setAskRes] = useState<{ ok: boolean; text: string; noteId?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sovereign/channel", { cache: "no-store" });
      const d = (await res.json()) as ChannelPayload;
      setData(d);
      setErr(d.ok ? "" : d.error ?? "הזרמים לא נמדדו");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) setToken(t);
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  async function gate() {
    if (!keyField.trim() || gateBusy) return;
    setGateBusy(true);
    setGateErr("");
    const k = keyField;
    setKeyField("");
    try {
      const res = await fetch("/api/sovereign/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: k }),
      });
      const d = (await res.json()) as { ok: boolean; token?: string; error?: string };
      if (d.ok && d.token) {
        sessionStorage.setItem(TOKEN_KEY, d.token);
        setToken(d.token);
      } else setGateErr(d.error === "invalid" ? "מפתח לא מאומת" : d.error === "too-many-attempts" ? "ניסיונות-יתר — המתן דקה" : "השער נדחה");
    } catch {
      setGateErr("השרת לא נגיש כרגע");
    } finally {
      setGateBusy(false);
    }
  }

  function ungate() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  async function decide(reqId: string, decision: "GRANT" | "DECLINE") {
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sovereign/channel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "decide", reqId, decision, token }),
      });
      if (res.status === 401) {
        ungate();
        return;
      }
      const d = (await res.json()) as { ok: boolean; id?: string; error?: string };
      if (d.ok) load();
      else setDNote({ ok: false, text: d.error ?? "ההכרעה נדחתה" });
    } catch {
      setDNote({ ok: false, text: "השרת לא נגיש — ההכרעה לא נאטמה" });
    } finally {
      setBusy(false);
    }
  }

  async function sendDirective() {
    if (!token || sendBusy) return;
    const points = dPoints.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (dTitle.trim().length < 3 || points.length === 0) {
      setDNote({ ok: false, text: "כותרת (3+ תווים) וסעיף-אחד לפחות" });
      return;
    }
    setSendBusy(true);
    setDNote(null);
    try {
      const res = await fetch("/api/sovereign/channel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "directive", title: dTitle.trim(), points, token }),
      });
      if (res.status === 401) {
        ungate();
        return;
      }
      const d = (await res.json()) as { ok: boolean; id?: string; push?: { pushed?: boolean; verified?: boolean } | null; error?: string };
      if (d.ok) {
        const pushed = d.push?.pushed ? ` · נדחף לגיט${d.push.verified ? " (אומת)" : ""}` : " · קומיט-מקומי (דחיפה תיעשה במחזור-הבא)";
        setDNote({ ok: true, text: `נאטם ${d.id}${pushed}` });
        setDTitle("");
        setDPoints("");
        load();
      } else setDNote({ ok: false, text: d.error ?? "נדחה" });
    } catch {
      setDNote({ ok: false, text: "השרת לא נגיש — ההוראה לא נאטמה (אפס-שקר)" });
    } finally {
      setSendBusy(false);
    }
  }

  async function ask() {
    if (!token || askBusy || !askText.trim()) return;
    setAskBusy(true);
    setAskRes(null);
    try {
      const res = await fetch("/api/sovereign/channel/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: askText.trim(), token }),
      });
      if (res.status === 401) {
        ungate();
        return;
      }
      const d = (await res.json()) as { ok: boolean; answer?: string; error?: string; detail?: string; note?: { id?: string } };
      if (d.ok && d.answer) {
        setAskRes({ ok: true, text: d.answer, noteId: d.note?.id });
        setAskText("");
        load();
      } else {
        setAskRes({
          ok: false,
          text: d.error === "foreign-number-rejected" ? `נפסל-כנה (אכיפת-מספר-זר): ${d.detail ?? ""}` : d.detail ?? d.error ?? "מסילת-הקול נפלה — כלום לא הומצא",
        });
      }
    } catch {
      setAskRes({ ok: false, text: "השרת לא נגיש — fail-honest" });
    } finally {
      setAskBusy(false);
    }
  }

  const canonical = data?.requests?.canonical ?? [];
  const legacy = (data?.requests?.legacy ?? []).map((r) => ({ ...r, origin: "legacy-mirror" }));
  const allReqs = [...canonical, ...legacy];
  const open = allReqs.filter((r) => (r.effectiveStatus ?? r.status) === "OPEN");
  const done = allReqs.filter((r) => (r.effectiveStatus ?? r.status) !== "OPEN");

  return (
    <div className="space-y-5" dir="rtl">
      {/* כותרת + זרמים-מדידים */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-zinc-50">הערוץ-הישיר · בעלים ↔ ריבונות</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              הערוץ-היחיד ({data?.spec ?? "SAOS-SOVEREIGN-CHANNEL/1"}) · append-only בגיט · אף סוכן ואף אורח אינו כותב בשם-הבעלים
            </p>
          </div>
          <div className="flex items-center gap-2">
            {token ? (
              <button onClick={ungate} className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-400 transition hover:border-red-500/40 hover:text-red-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> שער פתוח · נתק
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-zinc-500">
                <Lock className="h-3.5 w-3.5" aria-hidden /> שער נעול
              </span>
            )}
            <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-300 transition hover:border-amber-500/60 hover:text-amber-400">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> מדוד מחדש
            </button>
          </div>
        </div>
        {data?.streams && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetaChip label="directives" m={data.streams.directives} />
            <MetaChip label="requests" m={data.streams.requests} />
            <MetaChip label="notes" m={data.streams.notes} />
            <MetaChip label="voice" m={data.streams.voice} />
          </div>
        )}
        {err && <p className="mt-2 text-xs font-semibold text-red-400">{err}</p>}
      </section>

      {/* שער-המנהל */}
      {!token && (
        <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <KeyRound className="h-4 w-4 text-amber-500" aria-hidden /> שער-המנהל (headcorner)
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">
            מפתח-אחד פותח-הכל: הכרעות GRANT/DECLINE · הוראות-חוק · קול-הריבונות. המפתח = מקובץ-המפתח שלך (headcorner) —
            <b className="text-zinc-400"> המילה או הטוקן, שתיהן נסגרות</b>. נשווה כדיגסט-בלבד, מתרוקן מיד, ולעולם לא נשמר.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={keyField}
              onChange={(e) => setKeyField(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && gate()}
              placeholder="מפתח מנהל"
              autoComplete="off"
              aria-label="מפתח מנהל"
              className="h-11 flex-1 border-white/15 bg-zinc-900 text-sm"
            />
            <Button onClick={gate} disabled={gateBusy || !keyField.trim()} className="h-11 bg-amber-600 px-6 text-sm font-bold text-zinc-950 hover:bg-amber-500 disabled:opacity-40">
              {gateBusy ? "בודק…" : "פתח את השער"}
            </Button>
          </div>
          {gateErr && <p className="mt-2 text-xs font-semibold text-red-400">{gateErr}</p>}
        </section>
      )}

      {/* פניות-הריבונות */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-200">
          פניות-הריבונות אל-הבעלים
          {open.length > 0 && <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-400 hover:bg-amber-500/15">{open.length} פתוחות</Badge>}
        </h3>
        <div className="max-h-96 space-y-2 overflow-y-auto pl-1">
          {!data && [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-zinc-900" />)}
          {data && allReqs.length === 0 && <p className="rounded-xl border border-white/5 bg-zinc-900/60 p-4 text-xs text-zinc-500">אין פניות — הריבונות ממשיכה בלי-להמתין</p>}
          {[...open, ...done].map((r) => {
            const eff = r.effectiveStatus ?? r.status;
            return (
              <article key={`${r.origin}-${r.id}`} className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 transition hover:border-amber-600/25">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-black text-amber-400">{r.id}</span>
                  <StatusChip s={eff} />
                  {r.origin === "legacy-mirror" && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-bold text-zinc-500">מראה-Domain</span>}
                  <span className="text-[10px] text-zinc-500">{timeHe(r.at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-zinc-100">{r.need}</p>
                {r.evidence?.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {r.evidence.slice(0, 3).map((e, j) => (
                      <li key={j} className="truncate text-[11px] text-zinc-500" title={e}>· ראיה: {e}</li>
                    ))}
                  </ul>
                )}
                {token && eff === "OPEN" && (
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => decide(r.id, "GRANT")} disabled={busy} size="sm" className="h-8 bg-emerald-600 px-4 text-xs font-bold text-zinc-950 hover:bg-emerald-500 disabled:opacity-40">
                      אשר (GRANT)
                    </Button>
                    <Button onClick={() => decide(r.id, "DECLINE")} disabled={busy} size="sm" variant="outline" className="h-8 border-red-500/40 px-4 text-xs font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300">
                      דחה (DECLINE)
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* מחברת-ההוראות + קול-הריבונות */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <GitCommitHorizontal className="h-4 w-4 text-amber-500" aria-hidden /> הבעלים מצווה כאן — הוראה-חדשה
          </h3>
          {token ? (
            <div className="mt-3 space-y-2.5">
              <Input value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="כותרת-ההוראה" aria-label="כותרת-ההוראה" className="h-11 border-white/15 bg-zinc-900 text-sm font-semibold" />
              <Textarea value={dPoints} onChange={(e) => setDPoints(e.target.value)} rows={4} placeholder={"סעיפי-ההוראה — שורה-אחת לכל סעיף"} aria-label="סעיפי-ההוראה" className="border-white/15 bg-zinc-900 text-sm leading-6" />
              <div className="flex items-center gap-3">
                <Button onClick={sendDirective} disabled={sendBusy} className="h-11 bg-amber-600 px-6 text-sm font-bold text-zinc-950 hover:bg-amber-500 disabled:opacity-40">
                  <Send className="ml-1 h-4 w-4" aria-hidden /> {sendBusy ? "אוטם…" : "אטום בגיט"}
                </Button>
                <p className="text-[10px] leading-4 text-zinc-500">append-only · קומיט-ישיר מהמשטח · קבלה-מדודה</p>
              </div>
              {dNote && <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${dNote.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>{dNote.ok ? "✔ " : "✖ "}{dNote.text}</p>}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-xs leading-5 text-zinc-500">פתח את שער-המנהל למעלה כדי לאטום הוראות ולהכריע בפניות.</p>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Sparkles className="h-4 w-4 text-amber-500" aria-hidden /> שאל את הריבונות (קול-מדיד)
          </h3>
          {token ? (
            <div className="mt-3 space-y-2.5">
              <Textarea value={askText} onChange={(e) => setAskText(e.target.value)} rows={3} placeholder="שאלה לריבונות — תשובה מבוססת מנות-מדידה בלבד; מספר-זר נפסל-אוטומטית" aria-label="שאלה לריבונות" className="border-white/15 bg-zinc-900 text-sm leading-6" />
              <Button onClick={ask} disabled={askBusy || !askText.trim()} className="h-10 bg-zinc-100 px-5 text-sm font-bold text-zinc-950 hover:bg-white disabled:opacity-40">
                {askBusy ? "הריבונות מנסחת…" : "שאל"}
              </Button>
              {askRes && (
                <div className={`rounded-xl border p-3 text-xs leading-6 ${askRes.ok ? "border-emerald-500/25 bg-emerald-500/[0.04] text-zinc-200" : "border-red-500/30 bg-red-500/5 text-red-300"}`}>
                  <p className="whitespace-pre-line font-medium">{askRes.text}</p>
                  {askRes.ok && askRes.noteId && <p className="mt-1.5 font-mono text-[10px] text-zinc-500">נאטם בזרם: {askRes.noteId}</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-xs leading-5 text-zinc-500">קול-הריבונות זמין לבעלים-מאומת בלבד (ערוץ-ישיר).</p>
          )}
        </section>
      </div>

      {/* הוראות-חיות */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-zinc-200">הוראות-הבעלים (חוקים-חיים)</h3>
        <ScrollArea className="max-h-96 pr-1">
          <div className="space-y-2">
            {(data?.directives ?? []).slice().reverse().map((d) => (
              <article key={d.id} className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-black text-emerald-400">{d.id}</span>
                  <StatusChip s={d.status} />
                  <span className="text-[10px] text-zinc-500">{timeHe(d.at)}</span>
                </div>
                <p className="mt-2 text-sm font-bold text-zinc-100">{d.title}</p>
                <ul className="mt-1.5 space-y-1">
                  {d.directive.map((s, j) => (
                    <li key={j} className="text-xs leading-5 text-zinc-400">· {s}</li>
                  ))}
                </ul>
                {d.law && <p className="mt-1.5 font-mono text-[10px] text-zinc-600">חוק: {d.law}</p>}
              </article>
            ))}
            {data && (data.directives ?? []).length === 0 && <p className="text-xs text-zinc-500">אין הוראות בזרם</p>}
          </div>
        </ScrollArea>
      </section>

      {/* קול + רישומים */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-bold text-zinc-200">קול-הריבונות (מצב-מסילה)</h3>
          {data?.voice ? (
            <div className="space-y-1.5 text-xs leading-5 text-zinc-400">
              <p><span className="font-mono text-zinc-500">status</span> · <span className="font-bold text-zinc-200">{data.voice.status ?? "—"}</span></p>
              {data.voice.model && <p><span className="font-mono text-zinc-500">model</span> · {data.voice.model}</p>}
              {data.voice.at && <p><span className="font-mono text-zinc-500">at</span> · {timeHe(data.voice.at)}</p>}
              {data.voice.summary && <p className="rounded-lg border border-white/5 bg-zinc-900 p-2.5 leading-6 text-zinc-300">{data.voice.summary}</p>}
              {data.voice.reason && <p className="text-zinc-500">{data.voice.reason}</p>}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">קול-הריבונות טרם נמדד — UNAVAILABLE-כנה</p>
          )}
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-bold text-zinc-200">רישומי-הערוץ (notes) — אחרונים</h3>
          <div className="max-h-56 space-y-2 overflow-y-auto pl-1">
            {(data?.notes ?? []).slice(-8).reverse().map((n) => (
              <div key={n.id} className="rounded-lg border border-white/5 bg-zinc-950/60 p-2.5">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="font-mono text-zinc-400">{n.id}</span>
                  <span>{n.side}</span>
                  <span>· {timeHe(n.at)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-zinc-200">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-zinc-500">{n.body}</p>}
              </div>
            ))}
            {data && (data.notes ?? []).length === 0 && <p className="text-xs text-zinc-500">אין רישומים</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
