"use client";

// giant · מרכז-היכולות — גלריית-השוואה-חיה (דפוס Skillry: ההנחיה-מול-התוצאה)
// על-גבי-קטלוג-נתונים-אמת (דפוס awesome-dsh: רישום-נגזר-מנתונים, לא-הצהרות).
// כל-יכולת = SDK-אמת-בשרת; כל-הרצה = רישום-אמת-ב-SkillRun; כל-כישלון = כנה-על-המסך.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  Brain,
  Eye,
  Film,
  Image as ImageIcon,
  Mic,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
  Volume2,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ownerFetch } from "@/lib/owner-client";
import {
  IMAGE_SIZES,
  SKILLS,
  SKILL_CATEGORY_LABEL,
  TTS_VOICES,
  type SkillCategory,
  type SkillMeta,
} from "@/lib/skills-catalog";
import { cn } from "@/lib/utils";

const heNum = new Intl.NumberFormat("he-IL");

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* ------------------------------- טיפוסים ------------------------------- */

interface SkillStat {
  id: string;
  runs: number;
  ok: number;
  errors: number;
  successRate: number | null;
  avgMs: number | null;
  lastAt: string | null;
}

interface SkillsState {
  ok: boolean;
  measuredAt: string;
  stats: { total: number; ok: number; errors: number; successRate: number | null; avgMs: number | null; skillsLive: number };
  perSkill: SkillStat[];
  recent: {
    id: string;
    skill: string;
    status: string;
    input: string;
    output: string | null;
    durationMs: number;
    error: string | null;
    createdAt: string;
  }[];
  error?: string;
}

type FormVals = Record<string, string>;

const ICONS: Record<string, typeof Brain> = {
  brain: Brain,
  eye: Eye,
  film: Film,
  volume: Volume2,
  mic: Mic,
  image: ImageIcon,
  search: Search,
  book: BookOpen,
};

const EMPTY_FORM: Record<string, FormVals> = Object.fromEntries(
  SKILLS.map((s) => [s.id, { ...s.sample } as Record<string, string> as FormVals]),
);

interface RunResult {
  skill: string;
  durationMs: number;
  result?: Record<string, unknown>;
  error?: string;
  authRequired?: boolean;
}

/* ------------------------------- רכיב ------------------------------- */

export function SkillsView() {
  const [state, setState] = useState<SkillsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<SkillCategory | "all">("all");
  const [activeSkill, setActiveSkill] = useState<string>("llm");
  const [forms, setForms] = useState<Record<string, FormVals>>(EMPTY_FORM);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/skills/state", { cache: "no-store" });
      const j = (await res.json()) as SkillsState;
      setState(j);
    } catch {
      setState({ ok: false, measuredAt: "", stats: { total: 0, ok: 0, errors: 0, successRate: null, avgMs: null, skillsLive: 0 }, perSkill: [], recent: [], error: "נכשל-טעינת-מצב" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statOf = (id: string): SkillStat | undefined => state?.perSkill.find((s) => s.id === id);

  const setForm = (skill: string, key: string, val: string) =>
    setForms((prev) => ({ ...prev, [skill]: { ...prev[skill], [key]: val } }));

  function resetForm(skill: string) {
    setForms((prev) => ({ ...prev, [skill]: { ...(EMPTY_FORM[skill] ?? {}) } }));
    setResult(null);
  }

  function readFileToForm(skill: string, key: string, file: File, maxMB: number) {
    if (file.size > maxMB * 1024 * 1024) {
      setResult({ skill, durationMs: 0, error: `הקובץ-חורג-מ-${maxMB}MB` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(skill, key, String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function runSkill(meta: SkillMeta) {
    if (running) return;
    setRunning(true);
    setResult(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const res = await ownerFetch("/api/skills/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: meta.id, ...forms[meta.id] }),
      });
      const j = (await res.json()) as RunResult & { ok?: boolean };
      if (!res.ok) {
        setResult({ skill: meta.id, durationMs: j.durationMs ?? 0, error: j.error ?? `שגיאת-HTTP-${res.status}`, authRequired: j.authRequired });
      } else {
        setResult({ skill: meta.id, durationMs: j.durationMs, result: j.result });
      }
    } catch (e) {
      setResult({ skill: meta.id, durationMs: 0, error: e instanceof Error ? e.message : "שגיאת-רשת" });
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunning(false);
      void load();
    }
  }

  const visible = cat === "all" ? SKILLS : SKILLS.filter((s) => s.category === cat);
  const active = SKILLS.find((s) => s.id === activeSkill) ?? SKILLS[0];

  return (
    <div className="space-y-6" dir="rtl">
      {/* ======== כותרת ======== */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="rounded-2xl border border-white/5 bg-gradient-to-l from-[#0b100f] via-[#0d1311] to-[#0b100f] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
              <h2 className="text-lg font-bold text-white sm:text-xl">מרכז-היכולות</h2>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                8 יכולות-SDK אמת
              </Badge>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              גלריית-השוואה-חיה: <span className="font-semibold text-emerald-300">ההנחיה-מול-התוצאה</span> —
              כל-יכולת-היא-SDK-רץ-בשרת, כל-הרצה-נרשמת-בלדג'ר-ההרצות, וכל-כישלון-מוצג-כנה. אין-הדגמות-מזויפות.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <StatChip label="הרצות" value={state ? heNum.format(state.stats.total) : "—"} />
            <StatChip
              label="הצלחה"
              value={state?.stats.successRate != null ? `${state.stats.successRate}%` : "—"}
              tone="ok"
            />
            <StatChip label="ממוצע" value={state ? fmtMs(state.stats.avgMs) : "—"} />
            <StatChip label="יכולות-חיות" value={state ? `${state.stats.skillsLive}/${SKILLS.length}` : "—"} />
          </div>
        </div>
      </motion.section>

      {/* ======== מסנני-קטגוריה ======== */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="קטגוריות-יכולת">
        <CatChip active={cat === "all"} onClick={() => setCat("all")}>
          הכל ({SKILLS.length})
        </CatChip>
        {(Object.keys(SKILL_CATEGORY_LABEL) as SkillCategory[]).map((c) => (
          <CatChip key={c} active={cat === c} onClick={() => setCat(c)}>
            {SKILL_CATEGORY_LABEL[c]} ({SKILLS.filter((s) => s.category === c).length})
          </CatChip>
        ))}
      </div>

      {/* ======== גריד-היכולות ======== */}
      <section aria-label="קטלוג-היכולות">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visible.map((meta, i) => {
            const Icon = ICONS[meta.icon] ?? Sparkles;
            const st = statOf(meta.id);
            const isActive = meta.id === activeSkill;
            return (
              <motion.button
                key={meta.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04, ease: "easeOut" }}
                onClick={() => { setActiveSkill(meta.id); setResult(null); }}
                className={cn(
                  "group rounded-xl border p-4 text-start transition-colors",
                  isActive
                    ? "border-emerald-500/40 bg-[#0d1412] shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                    : "border-white/5 bg-[#0b100f] hover:border-white/15 hover:bg-[#0d1311]",
                )}
                aria-pressed={isActive}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={cn("rounded-lg p-2", isActive ? "bg-emerald-500/15" : "bg-white/5")}>
                    <Icon className={cn("h-5 w-5", isActive ? "text-emerald-300" : "text-zinc-400")} aria-hidden="true" />
                  </div>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      st && st.runs > 0 ? (st.errors > 0 && st.ok === 0 ? "bg-rose-400" : "bg-emerald-400") : "bg-zinc-600",
                    )}
                    title={st && st.runs > 0 ? "הורצה-באמת" : "טרם-הורצה"}
                  />
                </div>
                <h3 className="mt-3 text-sm font-bold text-white">{meta.name}</h3>
                <p className="font-mono text-[11px] text-zinc-500" dir="ltr">{meta.nameEn}</p>
                <p className="mt-2 min-h-10 text-xs leading-relaxed text-zinc-400">{meta.desc}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                  <Badge variant="outline" className="border-white/10 bg-white/5 px-1.5 py-0 text-[10px] text-zinc-400">
                    {SKILL_CATEGORY_LABEL[meta.category]}
                  </Badge>
                  <span className="tabular-nums">
                    {st && st.runs > 0 ? `${heNum.format(st.runs)} הרצות` : "טרם-הורצה"}
                  </span>
                  {st?.successRate != null && <span className="text-emerald-400/80 tabular-nums">{st.successRate}%</span>}
                  {st?.avgMs != null && <span className="tabular-nums">· {fmtMs(st.avgMs)}</span>}
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ======== מסך-ההרצה: ההנחיה-מול-התוצאה ======== */}
      <section aria-label="מסך-הרצה-חיה" className="rounded-2xl border border-white/5 bg-[#0b100f]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">
              הרצה-חיה: <span className="text-emerald-300">{active.name}</span>
            </h3>
            <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline" dir="ltr">{active.sdk}</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10"
              onClick={() => resetForm(active.id)}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              אפס
            </Button>
            <Button
              size="sm"
              className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-500"
              disabled={running}
              onClick={() => void runSkill(active)}
            >
              {running ? <Activity className="h-3 w-3 animate-pulse" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
              {running ? `רץ… ${elapsed}s` : "הרצה"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* --- ההנחיה --- */}
          <div className="border-b border-white/5 p-4 lg:border-b-0 lg:border-e">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
              ההנחיה · {active.inputSpec}
            </p>
            <SkillForm
              meta={active}
              vals={forms[active.id] ?? {}}
              onChange={(k, v) => setForm(active.id, k, v)}
              onFile={(k, f, mb) => readFileToForm(active.id, k, f, mb)}
              disabled={running}
            />
          </div>

          {/* --- התוצאה --- */}
          <div className="p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
              התוצאה-החיה
            </p>
            {running ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-zinc-400">
                <Activity className="h-8 w-8 animate-pulse text-emerald-400" aria-hidden="true" />
                <p className="text-sm">רץ-כעת… {elapsed}s — הרצה-אמת-מול-ה-SDK</p>
              </div>
            ) : result ? (
              <ResultView result={result} />
            ) : (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center">
                <p className="text-sm text-zinc-500">אין-תוצאה-עדיין</p>
                <p className="text-xs text-zinc-600">מלא-הנחיה-משמאל-והרץ — או-לחץ-אפס-לדוגמה-מוכנה</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ======== לדג'ר-ההרצות ======== */}
      <section aria-label="לדג'ר-ההרצות" className="rounded-2xl border border-white/5 bg-[#0b100f]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            לדג'ר-ההרצות · 20-האחרונות
          </h3>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10"
            onClick={() => void load()}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            רענן
          </Button>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full bg-white/5" />)}
          </div>
        ) : state && state.recent.length > 0 ? (
          <div className="max-h-96 overflow-y-auto p-2 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
            <div className="space-y-1.5">
              {state.recent.map((r) => (
                <div key={r.id} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 border px-1.5 py-0 text-[10px]",
                      r.status === "OK"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : r.status === "ERROR"
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                    )}
                  >
                    {r.status}
                  </Badge>
                  <span className="shrink-0 font-mono text-zinc-500" dir="ltr">{r.skill}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-400" title={r.error ?? r.input}>
                    {r.error ?? r.input}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500">{fmtMs(r.durationMs)}</span>
                  <span className="hidden shrink-0 tabular-nums text-zinc-600 sm:inline">{fmtTime(r.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-zinc-500">טרם-נרשמו-הרצות — הרץ-יכולת-למעלה-והרישום-יופיע-כאן</p>
        )}
      </section>

      {/* ======== חוק-האמת ======== */}
      <p className="px-1 pb-2 text-center text-[11px] leading-relaxed text-zinc-600">
        חוק-האמת: הקטלוג-נגזר-מנתונים · הסטטיסטיקה-נגזרת-מלדג'ר-ההרצות · הקלט/פלט-נשמרים-כתמצית-בלבד ·
        מדיה-לא-נשמרת-בלדג'ר (רק-גודל) · הרצה-דורשת-אימות-headcorner.
      </p>
    </div>
  );
}

/* ------------------------------- תתי-רכיבים ------------------------------- */

function StatChip({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-1.5 text-center">
      <p className={cn("text-sm font-bold tabular-nums", tone === "ok" ? "text-emerald-300" : "text-white")}>{value}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[11px] font-semibold text-zinc-400">{children}</label>;
}

function SkillForm({
  meta,
  vals,
  onChange,
  onFile,
  disabled,
}: {
  meta: SkillMeta;
  vals: FormVals;
  onChange: (k: string, v: string) => void;
  onFile: (k: string, f: File, maxMB: number) => void;
  disabled: boolean;
}) {
  switch (meta.id) {
    case "llm":
      return (
        <div className="space-y-3">
          <div>
            <FieldLabel>הנחיית-מערכת (רשות)</FieldLabel>
            <Input
              dir="rtl"
              className="border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.system ?? ""}
              onChange={(e) => onChange("system", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>פרומפט</FieldLabel>
            <Textarea
              dir="rtl"
              rows={5}
              className="resize-none border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.prompt ?? ""}
              onChange={(e) => onChange("prompt", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      );

    case "vision":
      return (
        <div className="space-y-3">
          <div>
            <FieldLabel>כתובת-תמונה</FieldLabel>
            <Input
              dir="ltr"
              className="border-white/10 bg-black/30 font-mono text-xs text-zinc-200"
              value={vals.imageUrl ?? ""}
              onChange={(e) => onChange("imageUrl", e.target.value)}
              placeholder="https://…"
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>או-העלאה (עד-8MB)</FieldLabel>
            <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-white/15 text-xs text-zinc-400 hover:bg-white/5">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {vals.imageUrl?.startsWith("data:") ? "תמונה-נטענה ✓" : "בחר-קובץ-תמונה"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile("imageUrl", f, 8); }}
              />
            </label>
          </div>
          <div>
            <FieldLabel>שאלה-על-התמונה</FieldLabel>
            <Textarea
              dir="rtl"
              rows={3}
              className="resize-none border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.prompt ?? ""}
              onChange={(e) => onChange("prompt", e.target.value)}
              disabled={disabled}
            />
          </div>
          {vals.imageUrl?.startsWith("data:") && (
            <img src={vals.imageUrl} alt="התמונה-שהועלתה" className="max-h-32 rounded-lg border border-white/10" />
          )}
        </div>
      );

    case "video":
      return (
        <div className="space-y-3">
          <div>
            <FieldLabel>כתובת-וידאו (MP4)</FieldLabel>
            <Input
              dir="ltr"
              className="border-white/10 bg-black/30 font-mono text-xs text-zinc-200"
              value={vals.videoUrl ?? ""}
              onChange={(e) => onChange("videoUrl", e.target.value)}
              placeholder="https://…mp4"
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>שאלה-על-הוידאו</FieldLabel>
            <Textarea
              dir="rtl"
              rows={3}
              className="resize-none border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.prompt ?? ""}
              onChange={(e) => onChange("prompt", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      );

    case "tts":
      return (
        <div className="space-y-3">
          <div>
            <FieldLabel>טקסט (עד-1024 תווים · {(vals.text ?? "").length}/1024)</FieldLabel>
            <Textarea
              dir="rtl"
              rows={4}
              className="resize-none border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.text ?? ""}
              onChange={(e) => onChange("text", e.target.value.slice(0, 1024))}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>קול</FieldLabel>
              <Select value={vals.voice ?? "tongtong"} onValueChange={(v) => onChange("voice", v)} disabled={disabled}>
                <SelectTrigger className="h-9 border-white/10 bg-black/30 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICES.map((v) => (
                    <SelectItem key={v} value={v} className="text-xs" dir="ltr">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>מהירות: {Number(vals.speed ?? 1).toFixed(1)}×</FieldLabel>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={Number(vals.speed ?? 1)}
                onChange={(e) => onChange("speed", e.target.value)}
                className="mt-2 w-full accent-emerald-500"
                disabled={disabled}
                aria-label="מהירות-דיבור"
              />
            </div>
          </div>
        </div>
      );

    case "asr":
      return (
        <div className="space-y-3">
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 p-4 text-center hover:bg-white/5">
            <Mic className="h-6 w-6 text-zinc-400" aria-hidden="true" />
            <span className="text-sm text-zinc-300">
              {vals.audioBase64 ? "קובץ-קול-נטען ✓" : "בחר-קובץ-קול (WAV/MP3 · עד-8MB)"}
            </span>
            <span className="text-xs text-zinc-500">הקובץ-עובר-base64-לשרת-ומתומלל-באמת</span>
            <input
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp3,audio/x-wav"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile("audioBase64", f, 8); }}
            />
          </label>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          <div>
            <FieldLabel>פרומפט</FieldLabel>
            <Textarea
              dir="rtl"
              rows={4}
              className="resize-none border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.prompt ?? ""}
              onChange={(e) => onChange("prompt", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>מידה</FieldLabel>
            <Select value={vals.size ?? "1024x1024"} onValueChange={(v) => onChange("size", v)} disabled={disabled}>
              <SelectTrigger className="h-9 border-white/10 bg-black/30 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={s} className="font-mono text-xs" dir="ltr">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "search":
      return (
        <div className="space-y-3">
          <div>
            <FieldLabel>שאילתה</FieldLabel>
            <Input
              dir="rtl"
              className="border-white/10 bg-black/30 text-sm text-zinc-200"
              value={vals.query ?? ""}
              onChange={(e) => onChange("query", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <FieldLabel>מספר-תוצאות</FieldLabel>
            <Select value={vals.num ?? "5"} onValueChange={(v) => onChange("num", v)} disabled={disabled}>
              <SelectTrigger className="h-9 border-white/10 bg-black/30 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 8, 10].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "reader":
      return (
        <div>
          <FieldLabel>כתובת-דף</FieldLabel>
          <Input
            dir="ltr"
            className="border-white/10 bg-black/30 font-mono text-xs text-zinc-200"
            value={vals.url ?? ""}
            onChange={(e) => onChange("url", e.target.value)}
            placeholder="https://…"
            disabled={disabled}
          />
        </div>
      );

    default:
      return <p className="text-sm text-zinc-500">אין-טופס</p>;
  }
}

function ResultView({ result }: { result: RunResult }) {
  if (result.error) {
    return (
      <div
        className={cn(
          "rounded-xl border p-4",
          result.authRequired
            ? "border-amber-500/30 bg-amber-500/[0.06]"
            : "border-rose-500/30 bg-rose-500/[0.06]",
        )}
        role="alert"
      >
        <p className={cn("text-sm font-bold", result.authRequired ? "text-amber-300" : "text-rose-300")}>
          {result.authRequired ? "נדרש-אימות-headcorner" : "כישלון-כנה"}
        </p>
        <p className="mt-1 break-words text-xs leading-relaxed text-zinc-300">{result.error}</p>
        {result.authRequired && (
          <p className="mt-2 text-xs text-zinc-400">
            התחבר-מראש-המסך (מנעד-מפתח) — כל-הרצה-מזיזה-משאבי-SDK-אמת-ולכן-מאובטחת.
          </p>
        )}
      </div>
    );
  }

  const r = result.result ?? {};

  if (typeof r.title === "string") {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
          <span className="font-mono">{heNum.format(Number(r.chars ?? 0))} תווים</span>
          <span className="tabular-nums">{fmtMs(result.durationMs)}</span>
        </div>
        <p className="mb-2 text-sm font-bold text-emerald-300">{r.title}</p>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
          {String(r.text)}
        </p>
      </div>
    );
  }

  if (typeof r.text === "string") {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
          <span className="font-mono">{result.skill}</span>
          <span className="tabular-nums">{fmtMs(result.durationMs)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">{r.text}</p>
        {"imageUrl" in r && typeof r.imageUrl === "string" && r.imageUrl && (
          <img src={r.imageUrl} alt="התמונה-שנותחה" className="mt-3 max-h-40 rounded-lg border border-white/10" />
        )}
      </div>
    );
  }

  if (typeof r.imageDataUrl === "string") {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
          <span className="font-mono">PNG · {String(r.size)} · {heNum.format(Number(r.bytes))}B</span>
          <span className="tabular-nums">{fmtMs(result.durationMs)}</span>
        </div>
        <img src={r.imageDataUrl} alt="התמונה-שנוצרה" className="mx-auto max-h-72 rounded-lg border border-white/10" />
      </div>
    );
  }

  if (typeof r.audioDataUrl === "string") {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
          <span className="font-mono">WAV · {String(r.voice)} · {Number(r.speed)}× · {heNum.format(Number(r.bytes))}B</span>
          <span className="tabular-nums">{fmtMs(result.durationMs)}</span>
        </div>
        <audio controls src={r.audioDataUrl} className="w-full" aria-label="הקול-שנוצר" />
      </div>
    );
  }

  if (Array.isArray(r.results)) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-zinc-500">
          {r.results.length} תוצאות · {fmtMs(result.durationMs)}
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pe-1 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
          {r.results.map((item, i) => {
            const it = item as { name: string; url: string; snippet: string; host: string; date: string };
            return (
              <a
                key={i}
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
              >
                <p className="text-sm font-semibold text-emerald-300">{it.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-500" dir="ltr">{it.host} · {it.date || "—"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{it.snippet}</p>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return <p className="text-sm text-zinc-500">תוצאה-לא-מוכרת</p>;
}
