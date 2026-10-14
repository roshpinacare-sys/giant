"use client";

/**
 * SOVEREIGN CHANNEL — the live GIANT surface (module: ערוץ).
 * The ONE direct owner<->sovereignty channel (SAOS-SOVEREIGN-CHANNEL/1).
 * Gate first (מפתח-מנהל, server-verified), then the channel: requests with
 * GRANT/DECLINE (owner laws D-NNNN), directives feed, notes/voice feed, and the
 * ask-the-sovereignty box (voice rail, measured-only, foreign-number=REJECTED).
 * Fail-honest everywhere: missing data is declared, never invented.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  KeyRound,
  Lock,
  Gavel,
  ScrollText,
  MessageCircleQuestion,
  ShieldCheck,
  AlertTriangle,
  Send,
  CheckCircle2,
  XCircle,
  GitBranch,
} from "lucide-react";

/* --------------------------------- types ---------------------------------- */

interface FileMeta {
  path: string;
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  mtime: string | null;
  ageMinutes: number | null;
}

interface RequestLine {
  id: string;
  at: string;
  by: string;
  need: string;
  evidence: string[];
  deadline: string;
  status: string;
  origin: "canonical" | "legacy-mirror";
  effectiveStatus: string;
}

interface DirectiveLine {
  id: string;
  at: string;
  by: string;
  law?: string;
  title: string;
  directive: string[];
  status: string;
}

interface NoteLine {
  id: string;
  at: string;
  side: string;
  kind: string;
  title: string;
  body: string;
  status?: string;
}

interface VoiceState {
  status: string;
  reason?: string;
  at: string;
  summary: string | null;
}

interface ChannelState {
  ok: boolean;
  requests: { canonical: RequestLine[]; legacy: RequestLine[] };
  directives: DirectiveLine[];
  notes: NoteLine[];
  voice: VoiceState | null;
  streams: Record<string, FileMeta>;
}

interface WriteReceipt {
  ok: boolean;
  error?: string | null;
  id?: string | null;
  sha16?: string | null;
  inboxId?: string | null;
  push?: { pushed: boolean; verified: boolean; commit: string | null; error: string | null } | null;
}

/* ------------------------------- formatting -------------------------------- */

function fmtTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", { hour12: false, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Sha({ v }: { v: string | null | undefined }) {
  if (!v) return <code dir="ltr" className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">—</code>;
  return <code dir="ltr" className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">{v.slice(0, 12)}</code>;
}

function StatusBadge({ s }: { s: string }) {
  const up = s.toUpperCase();
  if (up === "OPEN") return <Badge variant="outline" className="border-amber-500/50 text-amber-300">פתוחה</Badge>;
  if (up === "GRANTED" || up.startsWith("SATISFIED"))
    return <Badge className="border-0 bg-emerald-500/15 text-emerald-300">אושרה</Badge>;
  if (up === "DECLINED" || up === "WITHDRAWN")
    return <Badge className="border-0 bg-red-500/15 text-red-300">נדחתה</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function StreamChip({ label, meta }: { label: string; meta: FileMeta | undefined }) {
  if (!meta) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-[11px] text-zinc-400">
      <GitBranch className="h-3 w-3" aria-hidden />
      {label} · <Sha v={meta.sha16} /> · {meta.exists ? `${meta.ageMinutes ?? "?"} ד׳` : "חסר"}
    </span>
  );
}

/* ---------------------------------- gate ----------------------------------- */

function Gate({ onUnlock }: { onUnlock: (token: string) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sovereign/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = (await res.json()) as { ok: boolean; token?: string; error?: string };
      if (body.ok && body.token) {
        sessionStorage.setItem("sovereign.ownerToken", body.token);
        onUnlock(body.token);
      } else {
        setError(body.error === "too-many-attempts" ? "ניסיונות רבים מדי — המתן דקה" : "מפתח לא תקין");
      }
    } catch {
      setError("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }, [key, onUnlock]);

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
          <Lock className="h-4 w-4 text-emerald-300" aria-hidden />
          שער-הבעלים · מפתח-מנהל
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-400">
          כל-כתיבה שלך בערוץ = מאומתת-שרת. המפתח עצמו לא נשמר בשום-ריפו — רק hash-מלוח מחוץ-לכל-הריפואים. אף-סוכן לא כותב בשמך.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            dir="ltr"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && key && unlock()}
            placeholder="מפתח-מנהל…"
            className="border-zinc-700 bg-zinc-950 text-zinc-100"
            aria-label="מפתח-מנהל"
          />
          <Button onClick={unlock} disabled={busy || !key} className="bg-emerald-600 text-white hover:bg-emerald-500">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            פתח את הכל
          </Button>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ request card ------------------------------- */

function RequestCard({ r, token, onDone }: { r: RequestLine; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"GRANT" | "DECLINE" | null>(null);
  const [receipt, setReceipt] = useState<WriteReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openEvidence, setOpenEvidence] = useState(false);

  const decide = useCallback(
    async (decision: "GRANT" | "DECLINE") => {
      setBusy(decision);
      setError(null);
      try {
        const res = await fetch("/api/sovereign/channel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "decide", reqId: r.id, decision, note, token }),
        });
        if (res.status === 401) {
          sessionStorage.removeItem("sovereign.ownerToken");
          onDone();
          return;
        }
        const body = (await res.json()) as WriteReceipt;
        if (body.ok) {
          setReceipt(body);
          onDone();
        } else {
          setError(body.error ?? "נכשל");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 120) : "שגיאת רשת");
      } finally {
        setBusy(null);
      }
    },
    [r.id, note, token, onDone],
  );

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-100">
            <Gavel className="h-4 w-4 text-amber-300" aria-hidden />
            <span dir="ltr" className="font-mono">{r.id}</span>
            <StatusBadge s={r.effectiveStatus} />
            {r.origin === "legacy-mirror" && (
              <Badge variant="outline" className="border-zinc-600 text-[10px] text-zinc-400">מראה-ישנה (Domain)</Badge>
            )}
          </CardTitle>
          <span className="text-[11px] text-zinc-500">{fmtTime(r.at)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{r.need}</p>

        {r.evidence.length > 0 && (
          <div>
            <button
              onClick={() => setOpenEvidence(!openEvidence)}
              className="text-xs text-emerald-300 hover:underline"
              aria-expanded={openEvidence}
            >
              עדויות-מדידה ({r.evidence.length}) {openEvidence ? "▲" : "▼"}
            </button>
            {openEvidence && (
              <ul className="mt-1 list-inside list-disc space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 text-[12px] text-zinc-400">
                {r.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {r.effectiveStatus === "OPEN" && !receipt && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הערת-הכרעה (לא-חובה) — נכתבת כחוק-בנחיתה"
              className="border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
              aria-label="הערת-הכרעה"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => decide("GRANT")}
                disabled={busy !== null}
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {busy === "GRANT" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                אשר (GRANT)
              </Button>
              <Button
                onClick={() => decide("DECLINE")}
                disabled={busy !== null}
                className="flex-1 bg-red-600/90 text-white hover:bg-red-500"
              >
                {busy === "DECLINE" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                דחה (DECLINE)
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500">
              ההכרעה נרשמת כ-directive חדש בזרם-הקנוני (git) + קבלת-ביצוע למשרד — פומבי-בכנות.
            </p>
          </div>
        )}

        {receipt && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-[12px] text-emerald-200">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              נרשם: <span dir="ltr" className="font-mono">{receipt.id}</span>
              {receipt.push?.pushed ? (
                receipt.push.verified ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-300">
                    נדחף ואומת · {receipt.push.commit}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
                    נדחף, אימות-מרוחק: {receipt.push.error}
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="border-red-500/40 text-[10px] text-red-300">
                  push: {receipt.push?.error ?? "לא בוצע"}
                </Badge>
              )}
              {receipt.inboxId && <Badge variant="outline" className="border-zinc-600 text-[10px] text-zinc-400">קבלת-משרד ✓</Badge>}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-300">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- voice box -------------------------------- */

function VoiceBox({ token, onPosted }: { token: string; onPosted: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setNoteId(null);
    try {
      const res = await fetch("/api/sovereign/channel/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json()) as { ok: boolean; answer?: string; note?: { id: string }; error?: string; detail?: string };
      if (body.ok && body.answer) {
        setAnswer(body.answer);
        setNoteId(body.note?.id ?? null);
        setText("");
        onPosted();
      } else {
        setError([body.error, body.detail].filter(Boolean).join(" · "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 160) : "שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }, [text, onPosted]);

  return (
    <Card className="border-emerald-900/60 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
          <MessageCircleQuestion className="h-4 w-4 text-emerald-300" aria-hidden />
          שאל את הריבונות — קולה החי (מדידות-בלבד)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="שאלה לריבונות… (היא עונה רק ממה שנמדד — מספר-זר נפסל-כנה)"
            className="min-h-[64px] border-zinc-700 bg-zinc-950 text-sm text-zinc-100"
            aria-label="שאלה לריבונות"
          />
          <Button onClick={ask} disabled={busy || !text.trim()} className="bg-emerald-600 text-white hover:bg-emerald-500 sm:self-end">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            שאל
          </Button>
        </div>
        {answer && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-emerald-300">
              <span>הריבונות עונה{noteId ? ` · ${noteId} ביומן-הקנוני` : ""}</span>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-emerald-100">{answer}</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-300">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- main ----------------------------------- */

export default function SovereignChannel() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ChannelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem("sovereign.ownerToken"));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sovereign/channel", { cache: "no-store" });
      const body = (await res.json()) as ChannelState & { detail?: string };
      if (!res.ok || !body.ok) throw new Error(body.detail ?? `API ${res.status}`);
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 45_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const onUnlock = useCallback(
    (t: string) => {
      setToken(t);
      load();
    },
    [load],
  );

  const expired = error && /owner-gate-required/i.test(error);

  return (
    <div dir="rtl" className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">ערוץ ריבוני ישיב · הבעלים ↔ הריבונות</h2>
          <p className="text-xs text-zinc-500">
            SAOS-SOVEREIGN-CHANNEL/1 · זרם-קנוני אחד ב-git · אפס-סוכנים-באמצע · הריבונות מבקשת, אתה מכריע, היא מבצעת ומדווחת
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
          <RefreshCw className="h-4 w-4" aria-hidden /> רענן
        </Button>
      </div>

      {/* streams evidence strip */}
      {data && (
        <div className="flex flex-wrap gap-2">
          <StreamChip label="directives" meta={data.streams.directives} />
          <StreamChip label="requests" meta={data.streams.requests} />
          <StreamChip label="notes" meta={data.streams.notes} />
          <StreamChip label="voice" meta={data.streams.voice} />
          <StreamChip label="legacy-book" meta={data.streams.legacyBook} />
        </div>
      )}

      {/* voice status (honest) */}
      {data?.voice && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            data.voice.status === "TRUE"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/5 text-amber-200"
          }`}
        >
          קול-קנוני (GitHub Models): {data.voice.status}
          {data.voice.reason ? ` · ${data.voice.reason}` : ""} — מסילת-הקול החיה כאן עובדת עכשיו (מדידות-בלבד, מספר-זר=נפסל)
        </div>
      )}

      {error && !data && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" aria-hidden /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full bg-zinc-800" />
          <Skeleton className="h-40 w-full bg-zinc-800" />
        </div>
      ) : !token || expired ? (
        <Gate onUnlock={onUnlock} />
      ) : (
        <>
          {expired && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              תוקף-הכרעה פג — הזן מפתח-מנהל מחדש
            </div>
          )}

          {/* requests */}
          <section className="space-y-3" aria-label="בקשות הריבונות">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Gavel className="h-4 w-4" aria-hidden /> בקשות-הריבונות — רק-שערי-סמכות-בעלים (אף-בקשת-מימון)
            </h3>
            {data?.requests.canonical.map((r) => (
              <RequestCard key={r.id} r={r} token={token} onDone={load} />
            ))}
            {data && data.requests.canonical.length === 0 && (
              <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-500">
                אין בקשות-קנוניות פתוחות בזרם.
              </p>
            )}
            {data && data.requests.legacy.length > 0 && (
              <>
                <Separator className="bg-zinc-800" />
                <p className="text-[11px] text-zinc-500">מראות-ישנה (מתכנסות לזרם-הקנוני — ניתן להכריע גם-בהן):</p>
                {data.requests.legacy.map((r) => (
                  <RequestCard key={`legacy-${r.id}`} r={r} token={token} onDone={load} />
                ))}
              </>
            )}
          </section>

          {/* ask box */}
          <VoiceBox token={token} onPosted={load} />

          {/* directives feed */}
          <section className="space-y-2" aria-label="חוקי הבעלים">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <ScrollText className="h-4 w-4" aria-hidden /> חוקי-הבעלים (directives · append-only)
            </h3>
            <ScrollArea className="max-h-96 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60">
              <div className="space-y-3 p-3">
                {data?.directives.slice().reverse().map((d) => (
                  <div key={d.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs text-zinc-300">
                        <span dir="ltr" className="font-mono text-emerald-300">{d.id}</span>
                        {d.status === "ACTIVE" ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-300">ACTIVE</Badge>
                        ) : (
                          <Badge variant="outline" className="border-zinc-600 text-[10px] text-zinc-400">{d.status}</Badge>
                        )}
                      </span>
                      <span className="text-[10px] text-zinc-500">{fmtTime(d.at)}</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100">{d.title}</p>
                    {d.directive.length > 0 && (
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px] text-zinc-400">
                        {d.directive.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {data && data.directives.length === 0 && (
                  <p className="text-xs text-zinc-500">אין חוקים רשומים עדיין.</p>
                )}
              </div>
            </ScrollArea>
          </section>

          {/* notes feed */}
          <section className="space-y-2" aria-label="יומן הערוץ">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <ScrollText className="h-4 w-4" aria-hidden /> יומן-הערוץ (notes · דיווחי-הריבונות)
            </h3>
            <ScrollArea className="max-h-96 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60">
              <div className="space-y-3 p-3">
                {data?.notes.slice().reverse().map((n) => (
                  <div key={n.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs text-zinc-300">
                        <span dir="ltr" className="font-mono text-sky-300">{n.id}</span>
                        <Badge variant="outline" className="border-zinc-600 text-[10px] text-zinc-400">{n.side}</Badge>
                        {n.status && <Badge variant="outline" className="border-zinc-600 text-[10px] text-zinc-500">{n.status}</Badge>}
                      </span>
                      <span className="text-[10px] text-zinc-500">{fmtTime(n.at)}</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100">{n.title}</p>
                    <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-zinc-400">
                      {n.body.length > 700 ? n.body.slice(0, 700) + "…" : n.body}
                    </p>
                  </div>
                ))}
                {data && data.notes.length === 0 && (
                  <p className="text-xs text-zinc-500">היומן ריק.</p>
                )}
              </div>
            </ScrollArea>
          </section>
        </>
      )}
    </div>
  );
}
