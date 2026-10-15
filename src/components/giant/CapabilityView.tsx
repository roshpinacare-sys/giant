"use client";

/* ═══ מאגר-היכולות · CapabilityView (GIANT · קטלוג-יכולות-עצמי) ═══════════════
 * השראה: כרטיסי-היכולות של awesome-dsh-plugin (חיפוש · סינון-קטגוריות · תגי-יכולת
 * · redLines · תגי-אמון) — מושתל על-המערכת-שלנו עצמה, אפס-המצאה:
 * · כל-כרטיס = נקודת-קצה אמיתית מ-/api/giant/capabilities (מפקד-חי, אכזכון-60-שניות).
 * · מצב-בדיקה: נקודה-ירוקה "200 · 34ms" / נקודה-אדומה-כשל-אמיתי / אפור "דלת-כתיבה".
 * · זרמי-האמת: טבלת-גיט-קנונית — exists/bytes/sha16/גיל, ישן = מוצהר-ישן.
 * כנות: טעינה=שלדים · ריק=״לא-נמדד״ · כשל=באנר-אדום עם-השגיאה-עצמה. אפס-אימוג'י. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, GitBranch, Radar, RefreshCw, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const POLL_MS = 60_000;

interface ProbeResult {
  status: number;
  ms: number;
  error?: string;
}

interface EndpointRow {
  path: string;
  methods: string[];
  category: string;
  capabilities: string[];
  redLines: string[];
  probe: ProbeResult | null;
  writeDoor: boolean;
}

interface StreamRow {
  name: string;
  path: string;
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  ageMinutes: number | null;
}

interface CapabilitiesPayload {
  ok: boolean;
  generatedAt: string;
  endpoints: EndpointRow[];
  streams: StreamRow[];
  counts: { endpoints: number; probed: number; streams: number; healthy: number };
}

/* סדר-קטגוריות קבוע + גוון-לכל-קטגוריה (אפס-כחול/אינדיגו) */
const CAT_ORDER = ["בינה", "פקודה", "אמת", "שוק", "כסף", "משרד", "מערכת"];

const CAT_CLS: Record<string, string> = {
  בינה: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400",
  פקודה: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  אמת: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  שוק: "border-lime-500/40 bg-lime-500/10 text-lime-400",
  כסף: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  משרד: "border-teal-500/40 bg-teal-500/10 text-teal-400",
  מערכת: "border-white/15 bg-white/5 text-zinc-400",
};

const METHOD_CLS: Record<string, string> = {
  GET: "border-emerald-500/40 text-emerald-500",
  POST: "border-amber-500/40 text-amber-500",
  PUT: "border-rose-500/40 text-rose-500",
  DELETE: "border-rose-500/50 text-rose-500",
};

function humanBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ageCell(m: number | null): { text: string; cls: string } {
  if (m === null) return { text: "—", cls: "text-zinc-600" };
  if (m < 15) return { text: `${m} ד׳`, cls: "text-emerald-500" };
  if (m < 60) return { text: `${m} ד׳`, cls: "text-amber-500" };
  return { text: `${Math.round(m / 60)} ש׳`, cls: "text-zinc-500" };
}

/* מצב-בדיקה-חיה — כנות-מלאה: לא-נבדק / דלת-כתיבה / 200 · ms / כשל-אמיתי */
function ProbeBadge({ ep }: { ep: EndpointRow }) {
  if (ep.probe === null) {
    return ep.writeDoor ? (
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-500">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
        דלת-כתיבה
      </span>
    ) : (
      <span className="shrink-0 text-[10px] text-zinc-600">לא-נבדק</span>
    );
  }
  const p = ep.probe;
  const good = p.status >= 200 && p.status < 400;
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-[10px] ${good ? "text-emerald-500" : "text-rose-500"}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${good ? "bg-emerald-500" : "bg-rose-500"}`} />
      <span dir="ltr" className="font-mono tabular-nums">
        {p.status === 0 ? (p.error ?? "status:0") : `${p.status} · ${p.ms}ms`}
      </span>
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 px-3 py-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-mono text-xl tabular-nums ${tone}`}>
        {value === null ? "—" : value.toLocaleString("en-US")}
      </div>
    </div>
  );
}

export function CapabilityView() {
  const [data, setData] = useState<CapabilitiesPayload | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const alive = useRef(true);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setBusy(true);
    try {
      const res = await fetch("/api/giant/capabilities", { cache: "no-store", signal: ac.signal });
      const j = (await res.json()) as CapabilitiesPayload & { error?: string };
      if (!alive.current) return;
      if (!res.ok || j.ok === false || j.error) {
        setErr(j.error ? `${j.error} (HTTP ${res.status})` : `capabilities ${res.status}`);
        setData(null);
      } else {
        setData(j);
        setErr("");
      }
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setErr(e instanceof Error ? e.message.slice(0, 200) : "capabilities-fetch-failed");
      setData(null);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
      acRef.current?.abort();
    };
  }, [load]);

  /* ---------- נגזרות-מדידה בלבד (אפס-מספרים-מצוירים) ---------- */
  const endpoints = useMemo(() => data?.endpoints ?? [], [data]);
  const streams = useMemo(() => data?.streams ?? [], [data]);
  const counts = data?.counts ?? null;

  const cats = useMemo(() => {
    const present = new Set(endpoints.map((e) => e.category));
    return CAT_ORDER.filter((c) => present.has(c));
  }, [endpoints]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return endpoints.filter((e) => {
      if (cat !== null && e.category !== cat) return false;
      if (!needle) return true;
      const hay = [e.path, e.category, ...e.methods, ...e.capabilities, ...e.redLines].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [endpoints, cat, q]);

  return (
    <section dir="rtl" className="space-y-4" aria-label="מאגר-היכולות — מפקד-חי של נקודות-הקצה וזרמי-האמת">
      {/* כותרת + מונים */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-amber-500" aria-hidden />
          <h2 className="text-lg font-semibold text-zinc-100">מאגר-היכולות</h2>
          <span className="text-xs text-zinc-500">כל-מה-שהמערכת-יודעת-לעשות · נבדק-חי עכשיו</span>
        </div>
        {data?.generatedAt ? (
          <span dir="ltr" className="font-mono text-[10px] tabular-nums text-zinc-600">
            {data.generatedAt.slice(11, 19)}Z
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="נקודות-קצה" value={counts ? counts.endpoints : null} tone="text-zinc-100" />
        <Stat label="נבדקו-חי" value={counts ? counts.probed : null} tone="text-amber-500" />
        <Stat label="זרמי-אמת" value={counts ? counts.streams : null} tone="text-zinc-100" />
        <Stat label="בריאים" value={counts ? counts.healthy : null} tone="text-emerald-500" />
      </div>

      {/* באנר-כשל-כנה */}
      {err ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <span className="truncate text-xs text-rose-400">כשל-מדידה: {err}</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex shrink-0 items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-[10px] text-rose-400 transition hover:bg-rose-500/10"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            נסה-שוב
          </button>
        </div>
      ) : null}

      {/* שלדים-בזמן-טעינה-ראשונה */}
      {!data && !err ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          {/* חיפוש + צ'יפים-מהקטגוריות-האמיתיות */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש נתיב · תג · קטגוריה…"
                aria-label="חיפוש במאגר-היכולות"
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2 pl-3 pr-9 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-amber-600/50"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => {
                const active = cat === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(active ? null : c)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-[11px] transition ${
                      active
                        ? CAT_CLS[c] ?? CAT_CLS["מערכת"]
                        : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* רשת-הכרטיסים */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-10 text-center text-xs text-zinc-600">
              אין-התאמות-לחיפוש
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((e, i) => (
                <motion.article
                  key={e.path}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: Math.min(i * 0.035, 0.42), ease: "easeOut" }}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-5 backdrop-blur-xl transition hover:border-amber-600/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        CAT_CLS[e.category] ?? CAT_CLS["מערכת"]
                      }`}
                    >
                      {e.category}
                    </span>
                    <ProbeBadge ep={e} />
                  </div>

                  <div dir="ltr" className="mt-3 break-all font-mono text-xs text-zinc-200">
                    {e.path}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {e.methods.map((m) => (
                      <span
                        key={m}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          METHOD_CLS[m] ?? "border-white/15 text-zinc-400"
                        }`}
                      >
                        {m}
                      </span>
                    ))}
                    {e.writeDoor ? (
                      <span className="rounded border border-rose-500/30 px-1.5 py-0.5 font-mono text-[10px] text-rose-400/80">
                        write
                      </span>
                    ) : null}
                  </div>

                  {e.capabilities.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {e.capabilities.map((c) => (
                        <span
                          key={c}
                          dir="ltr"
                          className="rounded border border-white/10 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {e.redLines.length > 0 ? (
                    <div className="mt-2 space-y-0.5">
                      {e.redLines.map((r) => (
                        <div key={r} className="flex items-start gap-1 text-[10px] leading-4 text-rose-400/90">
                          <span aria-hidden>▸</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </motion.article>
              ))}
            </div>
          )}

          {/* זרמי-האמת (גיט-קנוני) */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-5 py-3">
              <GitBranch className="h-4 w-4 text-emerald-500" aria-hidden />
              <h3 className="text-sm font-semibold text-zinc-200">זרמי-האמת (גיט קנוני)</h3>
              <span className="text-[10px] text-zinc-600">Pulse · Domain · FleetHQ — טביעת-sha16 · גיל-מתוארך</span>
            </div>
            {streams.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-zinc-600">לא-נמדד</div>
            ) : (
              <div className="max-h-72 overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.07] text-[10px] text-zinc-600">
                      <th className="px-5 py-2 text-right font-medium">זרם</th>
                      <th className="px-3 py-2 text-right font-medium">נתיב</th>
                      <th className="px-3 py-2 text-right font-medium">קיים</th>
                      <th className="px-3 py-2 text-right font-medium">בתים</th>
                      <th className="px-3 py-2 text-right font-medium">sha16</th>
                      <th className="px-5 py-2 text-right font-medium">גיל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map((s) => {
                      const age = ageCell(s.ageMinutes);
                      return (
                        <tr key={s.path} className="border-b border-white/[0.04] transition hover:bg-white/[0.02]">
                          <td className="px-5 py-2 text-zinc-300">{s.name}</td>
                          <td dir="ltr" className="max-w-64 truncate px-3 py-2 font-mono text-[11px] text-zinc-500" title={s.path}>
                            {s.path}
                          </td>
                          <td className="px-3 py-2">
                            {s.exists ? (
                              <span className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                כן
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[10px] text-rose-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                חסר
                              </span>
                            )}
                          </td>
                          <td dir="ltr" className="px-3 py-2 font-mono tabular-nums text-zinc-400">
                            {humanBytes(s.bytes)}
                          </td>
                          <td dir="ltr" className="px-3 py-2 font-mono text-[11px] text-zinc-500">
                            {s.sha16 ?? "—"}
                          </td>
                          <td className={`px-5 py-2 font-mono tabular-nums text-[11px] ${age.cls}`}>{age.text}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
