"use client";

/**
 * מפת-הפער מול הענקים (T73) — ההשוואה-הכנה מול מוצרים אמיתיים.
 * כל-מספר-ענק = עובדה-ציבורית-מתועדת; כל-מספר-שלנו = מדידה-חיה-או-עדות-קוד;
 * כל-טענת-סוכן מקבלת-פסק-דין. אפס-קישוט-מזהיר-במקום-אמת.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown, Crosshair, Gavel, Map, Scale, Smartphone,
  Target, TrendingUp, Users, Wifi,
} from "lucide-react";
import type { GapLevel } from "@/lib/giant/gap-data";
import type { GapPayload } from "@/app/api/giant/gap/route";

const num = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString("he-IL") : "—");

function LevelChip({ level, size = "sm" }: { level: GapLevel; size?: "sm" | "md" }) {
  const map = {
    red: { label: "פער-אדום", cls: "border-rose-500/30 bg-rose-500/[0.08] text-rose-400" },
    amber: { label: "חלקית-אמת", cls: "border-amber-500/30 bg-amber-500/[0.08] text-amber-400" },
    green: { label: "אמיתי", cls: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400" },
  } as const;
  const m = map[level];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold ${m.cls} ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </span>
  );
}

function VerdictBadge({ v }: { v: "true" | "partial" | "false" }) {
  const map = {
    true: { label: "טענה מדויקת", cls: "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.07]" },
    partial: { label: "אמת-חלקית", cls: "text-amber-400 border-amber-500/25 bg-amber-500/[0.07]" },
    false: { label: "טענה לא-מדויקת", cls: "text-rose-400 border-rose-500/25 bg-rose-500/[0.07]" },
  } as const;
  const m = map[v];
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
}

export function GapView() {
  const [data, setData] = useState<GapPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ matching: true });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/giant/gap", { cache: "no-store", signal });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as GapPayload;
      setData(d);
      setFailed(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed(true); /* fail-honest */
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const t0 = window.setTimeout(() => void load(ac.signal), 0);
    const iv = setInterval(() => load(), 60_000);
    return () => { window.clearTimeout(t0); ac.abort(); clearInterval(iv); };
  }, [load]);

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="space-y-5" dir="rtl">
      {/* ═══ פסק-הדין המאוחד ═══ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="rounded-2xl border border-amber-600/25 bg-gradient-to-l from-amber-500/[0.08] via-white/[0.02] to-transparent p-5 giant-spec"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400" aria-hidden>
            <Scale className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-6 text-amber-200">{data?.verdict.headline ?? "מודד את הפער… (fail-honest)"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {data ? (
                <>
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-rose-400">{data.verdict.redCount} מימדים-אדומים</span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-amber-400">{data.verdict.amberCount} אמת-חלקית</span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-emerald-400">{data.verdict.greenCount} ירוק-מלא</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-zinc-400">מספרי-ענקים נמדדו-רשת {data.giantsSearchedAt}</span>
                </>
              ) : (
                <span className="text-xs text-zinc-500">{failed ? "המדידה-נכשלה — כנה. אין-צ'יפים-מזויפים." : "טוען-מדידות…"}</span>
              )}
            </div>
            {data && <p className="mt-3 max-w-3xl text-[13px] leading-6 text-zinc-300">{data.verdict.body}</p>}
          </div>
        </div>
      </motion.section>

      {/* ═══ פס-המדידות-החיות של הפער ═══ */}
      {data && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="מדידות-חיות">
          <LiveCard icon={TrendingUp} label="גובה-השרשרת" value={num(data.live.trajectory?.lastHeight)} sub={`${num(data.live.trajectory?.deltaHeight)} בלוקים-בין-מדידות`} />
          <LiveCard icon={Wifi} label="דופק-המכונה" value={`${data.live.beats.filter((b) => b.conclusion === "success").length}/${data.live.beats.length || 3}`} sub="beats-הצלחה" />
          <LiveCard icon={Target} label="שער-האמת" value={data.live.truthVerdict ?? "לא-נמדד"} sub="מה-הוא-מוכח-ומה-לא" mono />
          <LiveCard icon={Users} label="משתמשי-חוץ" value="0" sub="אין-אימות-מחובר (נמדד-מהקוד)" />
          <LiveCard icon={Smartphone} label="מודולי-UI" value={num(data.live.code?.uiModules)} sub={`${num(data.live.code?.giantRoutes)} נתיבי-API ענק`} />
          <LiveCard icon={Crosshair} label="ידיים-חוץ" value={data.live.externalBidExists === false ? "0" : data.live.externalBidExists === true ? "נמדד" : "לא-נמדד"} sub="honest-econ — כנות-הקצה" />
        </section>
      )}

      {/* ═══ פסקי-דין על טענות-הסוכנים ═══ */}
      {data && (
        <section aria-label="פסקי-דין על טענות-הסוכנים">
          <SectionHead icon={<Gavel className="h-4 w-4" />} title="טענות-הסוכנים מול המדידות" sub="כל-טענה-שנאמרה — נבדקת-מול-מה-שנמדד-בפועל" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.agentClaims.map((c) => (
              <div key={c.claim} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-zinc-100">“{c.claim}”</p>
                  <VerdictBadge v={c.verdict} />
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">{c.truth}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ שמונת-המימדים ═══ */}
      {data && (
        <section aria-label="שמונת-מימדי-הפער">
          <SectionHead icon={<Crosshair className="h-4 w-4" />} title="שמונת-המימדים — איפה-אנחנו-באמת" sub="מה-הענקים מוכיחים-ציבורית · מה-הטענה · מה-נמדד · מה-המחיר-לסגירה" />
          <div className="space-y-3">
            {data.dimensions.map((d) => {
              const isOpen = !!open[d.id];
              return (
                <div key={d.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  <button
                    onClick={() => toggle(d.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-right transition hover:bg-white/[0.03]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-400" aria-hidden>
                      <Crosshair className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-zinc-100">{d.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{d.subtitle}</span>
                    </span>
                    <LevelChip level={d.level} />
                    <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/[0.06] px-4 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">מה-הענקים מוכיחים</p>
                          <ul className="space-y-1.5">
                            {d.giants.map((g) => (
                              <li key={g.name + g.metric} className="flex items-baseline gap-2 text-xs">
                                <span className="font-bold text-amber-300">{g.name}</span>
                                <span className="text-zinc-400">{g.metric}:</span>
                                <span className="font-mono text-[11px] text-zinc-200" dir="ltr">{g.value}</span>
                                <span className="text-[10px] text-zinc-600">({g.source})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">הטענה</p>
                            <p className="text-xs leading-5 text-zinc-400">“{d.oursClaimed}”</p>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">מה-נמדד בפועל</p>
                            <p className="text-xs leading-5 text-zinc-200">{d.oursMeasured}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-2">
                        <p className="font-mono text-[10px] leading-4 text-zinc-500" dir="ltr">{d.evidence}</p>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <VerdictBadge v={d.claimVerdict} />
                        <p className="text-xs leading-5 text-zinc-300"><span className="font-bold text-amber-300">המחיר-לסגירה:</span> {d.priceToClose}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ מספרי-הענקים ═══ */}
      {data && (
        <section aria-label="מספרי-הענקים">
          <SectionHead icon={<Users className="h-4 w-4" />} title="מספרי-הענקים — מדידת-רשת" sub={`כל-הערכים-ציבוריים-ומתועדים · נמדדו ${data.giantsSearchedAt}`} />
          <div className="max-h-96 overflow-y-auto rounded-xl border border-white/[0.07] giant-scroll">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase tracking-wide text-zinc-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-2.5 font-bold">ענק</th>
                  <th className="px-4 py-2.5 font-bold">מדד</th>
                  <th className="px-4 py-2.5 font-bold">ערך</th>
                  <th className="hidden px-4 py-2.5 font-bold sm:table-cell">מקור</th>
                </tr>
              </thead>
              <tbody>
                {data.giantProducts.map((g, i) => (
                  <tr key={g.name + g.metric} className={i % 2 ? "bg-white/[0.015]" : ""}>
                    <td className="px-4 py-2.5 font-bold text-amber-300">{g.name}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{g.metric}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-200" dir="ltr">{g.value}</td>
                    <td className="hidden px-4 py-2.5 text-[10px] text-zinc-600 sm:table-cell">{g.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ═══ מפת-האיחוד M1..M6 ═══ */}
      {data && (
        <section aria-label="מפת-האיחוד">
          <SectionHead icon={<Map className="h-4 w-4" />} title="מפת-האיחוד — מהאתר לאפליקציה אמיתית" sub="כל-צעד-עם-קריטריון-קבלה-מדיד · אין-הכרזה-בלי-הוכחה" />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.roadmap.map((m) => (
              <div key={m.id} className="flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-black text-amber-300">{m.id}</span>
                  <LevelChip level={m.level} />
                </div>
                <h3 className="mt-2 text-sm font-black text-zinc-100">{m.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-5 text-zinc-400">{m.what}</p>
                <div className="mt-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
                  <p className="text-[10px] font-bold text-emerald-400">קריטריון-קבלה</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-zinc-300">{m.acceptance}</p>
                </div>
                <p className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                  <span>מאמץ: <b className="text-zinc-300">{m.effort}</b></span>
                  <span>{m.moves}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && data.errors.length > 0 && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-4 py-3 text-xs text-amber-300">
          כנות-מדידה: חלק-מהמדידות-נכשלו ({data.errors.length}) — השדות-הריקים לעיל הם "לא-נמדד", לא-אפס.
        </p>
      )}
    </div>
  );
}

function LiveCard({ icon: Icon, label, value, sub, mono }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string; mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </div>
      <p className={`mt-1.5 truncate text-lg font-black text-zinc-100 ${mono ? "font-mono text-sm" : ""}`} title={value}>{value}</p>
      <p className="mt-0.5 text-[10px] leading-3.5 text-zinc-600">{sub}</p>
    </div>
  );
}

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <h2 className="text-sm font-black text-zinc-100">{title}</h2>
        <p className="text-[11px] text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}
