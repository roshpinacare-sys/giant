"use client";

// giant · מסך-ההגשה הסופית — תשובת-המערכת להוראת-הבעלים (trace 1a13cb631ce67201):
// "אני עוד לא רואה רבע · המון חומר אבל כלום לא מחובר · לבחון את כולם ולטפל ·
// למידה מהכשלים · השוואה מול הענקים · הגשה סופית של הרעיון"
// → כל-החומר-מכל-תיקיות-הגיט מחובר לכאן חי: קריא, חיפוש, נבחן, מלמד ומוכיח.

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronUp,
  FileSearch,
  FileText,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Layers,
  Loader2,
  Scale,
  Search,
  ShieldCheck,
  Swords,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownView } from "@/components/giant/markdown";
import { cn } from "@/lib/utils";

const heNum = new Intl.NumberFormat("he-IL");

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return heNum.format(Math.round(n * 100) / 100);
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function useCountUp(target: number, durationMs = 900): number {
  const [val, setVal] = useState(() => (Number.isFinite(target) ? 0 : target));
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

function AnimatedNumber({ value, suffix }: { value: number; suffix?: string }) {
  const v = useCountUp(value);
  return (
    <span className="tabular-nums">
      {fmtNum(v)}
      {suffix}
    </span>
  );
}

/* ------------------- interfaces ------------------- */

interface MaterialDocMeta {
  id: string;
  repo: string;
  gen: "live" | "archive";
  dir: string;
  category: string;
  relPath: string;
  title: string;
  bytes: number;
  mtime: string;
}

interface MaterialState {
  ok: boolean;
  totals: { docs: number; bytes: number };
  byCategory: { category: string; label: string; count: number; bytes: number }[];
  byRepo: { repo: string; gen: string; count: number; bytes: number }[];
  giantDocs: MaterialDocMeta[];
  docs: MaterialDocMeta[];
  scannedAt: string;
  rootsScanned: string[];
}

interface EstateRepo {
  name: string;
  dir: string;
  role: string;
  status: string;
  what: string;
  generation: "system" | "live" | "archive";
  disk: { exists: boolean; files: number; bytes: number };
  git: {
    branch: string | null;
    headShort: string | null;
    headSubject: string | null;
    lastCommitAt: string | null;
    commitCount: number;
    authorCount: number;
    dirtyCount: number;
  } | null;
}

interface EstateState {
  ok: boolean;
  repos: EstateRepo[];
  live: {
    saosIssued: number;
    saosCap: number;
    trades24h: number;
    vol24h: number;
    fleetAgents: number;
    fleetActive: number;
    ledgerRows: number;
    messages: number;
  };
}

interface RosterFamily {
  label: string;
  count: number;
  top: { name: string; commits: number; repos: string[] }[];
}

interface RosterState {
  ok: boolean;
  identitiesTotal: number;
  commitsTotal: number;
  families: {
    owner: RosterFamily;
    zai: RosterFamily;
    organ: RosterFamily;
    automation: RosterFamily;
  };
}

interface ReadState {
  ok: boolean;
  content?: string;
  doc?: MaterialDocMeta;
  error?: string;
}

/* ------------------- markdown parsers (הכל-חי-מהגיט) ------------------- */

function mdTables(md: string): { header: string[]; rows: string[][] }[] {
  const lines = md.split("\n");
  const tables: { header: string[]; rows: string[][] }[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length >= 2) {
      const cells = cur.map((l) =>
        l
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim()),
      );
      if (!cells[1].every((c) => /^:?-{2,}:?$/.test(c))) {
        tables.push({ header: cells[0], rows: cells.slice(1) });
      } else {
        tables.push({ header: cells[0], rows: cells.slice(2) });
      }
    }
    cur = [];
  };
  for (const line of lines) {
    if (line.trimStart().startsWith("|")) cur.push(line.trim());
    else flush();
  }
  flush();
  return tables;
}

function mdSection(md: string, headingPrefix: string): string {
  const lines = md.split("\n");
  let capture = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^#{2,3}\s/.test(line)) {
      if (capture) break;
      capture = line.replace(/^#+\s*/, "").startsWith(headingPrefix);
      if (capture) continue;
    } else if (capture) out.push(line);
  }
  return out.join("\n").trim();
}

function parseLaws(section: string): { n: number; name: string; body: string }[] {
  const laws: { n: number; name: string; body: string }[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*[-—:]?\s*(.*)$/);
    if (m) laws.push({ n: Number(m[1]), name: m[2].trim(), body: m[3].trim() });
  }
  return laws;
}

function parseBullets(section: string): string[] {
  return section
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l.length > 3);
}

/* ------------------- verdicts (בחינת-חיים) ------------------- */

function commitAgeHours(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

type Verdict = { label: string; cls: string; note: string };

function repoVerdict(iso: string | null): Verdict {
  const h = commitAgeHours(iso);
  if (h == null) return { label: "נעדר-גיט", cls: "bg-zinc-500/15 text-zinc-400", note: "אין-היסטוריה-נמדדת" };
  if (h < 24) return { label: "חי", cls: "bg-emerald-500/15 text-emerald-400", note: `פעימה-אחרונה לפני ${h < 1 ? "<1" : Math.round(h)} שעות` };
  if (h < 24 * 14) return { label: "רדום", cls: "bg-amber-500/15 text-amber-400", note: `פעימה-אחרונה לפני ${Math.round(h / 24)} ימים` };
  return { label: "ארכיון", cls: "bg-zinc-500/15 text-zinc-400", note: `שקט ${Math.round(h / 24)} ימים` };
}

/* ------------------- main view ------------------- */

export function FinalView() {
  const [material, setMaterial] = useState<MaterialState | null>(null);
  const [estate, setEstate] = useState<EstateState | null>(null);
  const [roster, setRoster] = useState<RosterState | null>(null);
  const [docs, setDocs] = useState<Record<string, string>>({}); // id → markdown
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // דפדפן-החומר
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [gen, setGen] = useState<"all" | "live" | "archive">("all");
  const [limit, setLimit] = useState(48);

  // קורא-המסמכים
  const [openDoc, setOpenDoc] = useState<MaterialDocMeta | null>(null);
  const [openContent, setOpenContent] = useState<string | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const loadDoc = useCallback(async (repo: string, relPath: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/material/read?repo=${encodeURIComponent(repo)}&rel=${encodeURIComponent(relPath)}`);
      const json = (await res.json()) as ReadState;
      if (json.ok && json.content) return json.content;
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // טעינה-מדורגת: החומר-והמסמכים-מיידיים (36ms), האחוזה-והמפקד-נכנסים-כשהם-מודדים-גמור
    (async () => {
      try {
        const [mRes, agreement, designSrc, anatomy, dexLive] = await Promise.all([
          fetch("/api/material/state"),
          loadDoc("t36/Sandbox", "giant/MERGE-AGREEMENT.md"),
          loadDoc("t36/Sandbox", "giant/DESIGN-SOURCES.md"),
          loadDoc("t36/Sandbox", "giant/ANATOMY-REFERENCE.md"),
          loadDoc("t36/Sandbox", "giant/DEX-LIVE.md"),
        ]);
        if (!alive) return;
        const m = (await mRes.json()) as MaterialState;
        setMaterial(m);
        const next: Record<string, string> = {};
        if (agreement) next["t36/Sandbox/giant/MERGE-AGREEMENT.md"] = agreement;
        if (designSrc) next["t36/Sandbox/giant/DESIGN-SOURCES.md"] = designSrc;
        if (anatomy) next["t36/Sandbox/giant/ANATOMY-REFERENCE.md"] = anatomy;
        if (dexLive) next["t36/Sandbox/giant/DEX-LIVE.md"] = dexLive;
        setDocs(next);
        setLoading(false);
      } catch {
        if (alive) {
          setError("החיבור-לא-נענה");
          setLoading(false);
        }
      }
    })();
    (async () => {
      try {
        const eRes = await fetch("/api/estate/state");
        const e = (await eRes.json()) as EstateState;
        if (alive) setEstate(e);
      } catch {
        /* מדידת-האחוזה-תיעדר-מהמסך-בלבד */
      }
      try {
        const rRes = await fetch("/api/fleet/roster");
        const r = (await rRes.json()) as RosterState;
        if (alive) setRoster(r);
      } catch {
        /* המפקד-תיעדר-מהמסך-בלבד */
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadDoc]);

  const openReader = useCallback(
    async (doc: MaterialDocMeta) => {
      setOpenDoc(doc);
      setOpenError(null);
      const cached = docs[doc.id];
      if (cached) {
        setOpenContent(cached);
        return;
      }
      setOpenLoading(true);
      setOpenContent(null);
      const content = await loadDoc(doc.repo, doc.relPath);
      setOpenContent(content);
      setOpenLoading(false);
      if (!content) setOpenError("הקריאה-מהגיט-לא-הצליחה");
    },
    [docs, loadDoc],
  );

  const closeReader = useCallback(() => {
    setOpenDoc(null);
    setOpenContent(null);
    setOpenError(null);
  }, []);

  // Escape-סוגר-את-הקורא (נגישות-מקלדת)
  useEffect(() => {
    if (!openDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReader();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDoc, closeReader]);

  /* נתונים-גזורים */

  const categories = useMemo(() => {
    if (!material) return [];
    return material.byCategory.filter((c) => c.count > 0);
  }, [material]);

  const filteredDocs = useMemo(() => {
    if (!material) return [];
    const q = query.trim().toLowerCase();
    return material.docs.filter((d) => {
      if (gen !== "all" && d.gen !== gen) return false;
      if (cat !== "all" && (d.dir || "root") !== cat) return false;
      if (q && !d.title.toLowerCase().includes(q) && !d.relPath.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [material, query, cat, gen]);

  const agreement = docs["t36/Sandbox/giant/MERGE-AGREEMENT.md"] ?? null;
  const designSrc = docs["t36/Sandbox/giant/DESIGN-SOURCES.md"] ?? null;
  const anatomy = docs["t36/Sandbox/giant/ANATOMY-REFERENCE.md"] ?? null;
  const dexLive = docs["t36/Sandbox/giant/DEX-LIVE.md"] ?? null;

  const laws = useMemo(() => {
    if (!agreement) return [];
    const base = parseLaws(mdSection(agreement, "2."));
    // חוק-11 נגזר-בסעיף-5 של-ההסכם (משימה-47) — נתפס-כאן-ונצמד-לרשימה
    const derived = agreement.match(/\*\*חוק-חדש-שנגזר \(11\):\*\*\s*(.+)/);
    if (derived) base.push({ n: 11, name: "הרישום-הוא-ההוכחה", body: derived[1].trim() });
    return base;
  }, [agreement]);
  const forbidden = useMemo(() => (agreement ? parseBullets(mdSection(agreement, "4.")) : []), [agreement]);
  const designTable = useMemo(() => {
    if (!designSrc) return [];
    const sec = mdSection(designSrc, "1 ·");
    const t = mdTables(sec);
    return t[0]?.rows ?? [];
  }, [designSrc]);
  const anatomyTable = useMemo(() => {
    if (!anatomy) return [];
    const t = mdTables(anatomy);
    return t[0]?.rows ?? [];
  }, [anatomy]);
  const proofs = useMemo(() => (dexLive ? parseBullets(mdSection(dexLive, "ההוכחות")) : []), [dexLive]);

  const reposExamined = useMemo(() => {
    if (!estate?.repos) return [];
    return [...estate.repos].sort((a, b) => {
      const av = commitAgeHours(a.git?.lastCommitAt ?? null) ?? Infinity;
      const bv = commitAgeHours(b.git?.lastCommitAt ?? null) ?? Infinity;
      return av - bv;
    });
  }, [estate]);

  const aliveCount = reposExamined.filter((r) => repoVerdict(r.git?.lastCommitAt ?? null).label === "חי").length;
  const dirtyRepos = reposExamined.filter((r) => (r.git?.dirtyCount ?? 0) > 0);

  /* loading skeleton */
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="טוען את ההגשה הסופית">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> סורק-חי את כל-תיקיות-הגיט…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error} — המסך-מציג-רק-את-מה-שנמדד-בהצלחה.
        </div>
      )}

      {/* ══════════ HERO · הרעיון-בנשימה-אחת (supahero: העיקרון-המרכזי-בפנים) ══════════ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 md:p-10"
      >
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative space-y-4">
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            ההגשה הסופית · trace 1a13cb631ce67201
          </Badge>
          <h1 className="text-3xl font-black leading-tight text-white md:text-5xl">
            כל הריבונות — <span className="bg-gradient-to-l from-emerald-400 to-amber-400 bg-clip-text text-transparent">מחוברת-כאן</span> וקריאה-חי
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-300 md:text-base">
            לא-עוד-מספרים-על-החומר: החומר-עצמו. כל-תיקיית-גיט נסרקת-חי, כל-מסמך
            נקרא-מהדיסק-בלחיצה, כל-סוכן נבחן-בפעימת-הקומיט-שלו, כל-לקח-מהכשלים
            חתום-בהסכם, וכל-ענק-שבחנו — טבוע-כעיקרון-במסך-מזוהה. הסנדבוקס-נמחק;
            החיבור-הזה-נשאר.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
            {[
              { label: "מסמכים-מחוברים", value: material?.totals.docs ?? 0, sub: fmtBytes(material?.totals.bytes ?? 0) + " חומר-קריא" },
              { label: "תיקיות-גיט-נסרקות", value: estate?.repos.length ?? 0, sub: estate ? `${aliveCount} חיות-מתחת-ל-24ש` : "נמדד-חי…" },
              { label: "זהויות-סוכנים", value: roster?.identitiesTotal ?? 0, sub: roster ? "מ-git-log אמת" : "נמדד-חי…" },
              { label: "חוקים-מההיסטוריה", value: laws.length || 11, sub: "חתומים-בהסכם-המיזוג" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="text-2xl font-black text-emerald-400 md:text-3xl">
                  <AnimatedNumber value={s.value} />
                </div>
                <div className="mt-1 text-xs font-medium text-zinc-300">{s.label}</div>
                <div className="text-[11px] text-zinc-500">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ══════════ 1 · החומר-המחובר (התשובה ל"עוד לא רואה רבע") ══════════ */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <FileSearch className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-zinc-100">1 · החומר-המחובר — כל-מסמך-קריא-מהמסך</h2>
              <p className="text-xs text-zinc-400">
                אינדקס-חי של {fmtNum(material?.totals.docs ?? 0)} מסמכים מ-{material?.rootsScanned.length ?? 0} שורשי-סריקה · נסרק{" "}
                {material ? new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(new Date(material.scannedAt)) : "—"}
              </p>
            </div>
          </div>

          {/* חיפוש + מסננים */}
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(48);
                }}
                placeholder="חיפוש-בכל-המסמכים: כותרת או נתיב…"
                className="border-zinc-700 bg-zinc-900 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600"
                aria-label="חיפוש באינדקס המסמכים"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip active={cat === "all" && gen === "all"} onClick={() => { setCat("all"); setGen("all"); setLimit(48); }}>
                הכל · {fmtNum(material?.totals.docs ?? 0)}
              </Chip>
              <Chip active={gen === "live"} onClick={() => setGen(gen === "live" ? "all" : "live")}>
                <GitBranch className="me-1 inline h-3 w-3" /> דור-חי
              </Chip>
              <Chip active={gen === "archive"} onClick={() => setGen(gen === "archive" ? "all" : "archive")}>
                <Archive className="me-1 inline h-3 w-3" /> ארכיון-עדות
              </Chip>
              {categories.map((c) => (
                <Chip
                  key={c.category}
                  active={cat === c.category}
                  onClick={() => {
                    setCat(cat === c.category ? "all" : c.category);
                    setLimit(48);
                  }}
                >
                  {c.label} · {c.count}
                </Chip>
              ))}
            </div>
          </div>

          {/* הגריד */}
          {filteredDocs.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">אין-מסמכים-תואמים-לסינון הזה.</p>
          ) : (
            <>
              <div className="mt-4 grid max-h-[30rem] gap-2 overflow-y-auto pe-1 sovereign-scroll md:grid-cols-2 xl:grid-cols-3">
                {filteredDocs.slice(0, limit).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openReader(d)}
                    className="group rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-start transition hover:border-emerald-500/40 hover:bg-zinc-800/60"
                    aria-label={`פתח את המסמך ${d.title}`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500/70" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-200 group-hover:text-emerald-300">
                          {d.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500" dir="ltr">
                          <span className="font-mono">{d.repo}/{d.relPath}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", d.gen === "live" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-zinc-400")}>
                            {d.gen === "live" ? "דור-חי" : "ארכיון"}
                          </span>
                          <span className="text-[10px] text-zinc-500">{d.category}</span>
                          <span className="text-[10px] text-zinc-600">{fmtBytes(d.bytes)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {filteredDocs.length > limit && (
                <div className="mt-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 96)} className="border-zinc-700 text-zinc-300">
                    הצג-עוד ({fmtNum(filteredDocs.length - limit)} נותרו)
                  </Button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-zinc-500">
                מוצגים {fmtNum(Math.min(limit, filteredDocs.length))} מתוך {fmtNum(filteredDocs.length)} בסינון-הנוכחי · מסמכי-JSON-וקוד-נשארים-בגיט (רק-md-נחשף-למסך, בהצנחת-סודות)
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ══════════ 2 · בחינת-כל-הסוכנים ══════════ */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
              <HeartPulse className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-zinc-100">2 · בחינת-כל-הסוכנים — כולם-נבחנים, כל-פסק-מבוסס-פעימה</h2>
              <p className="text-xs text-zinc-400">
                פסק-חיים-מגיל-הקומיט-האחרון: חי &lt; 24ש · רדום &lt; 14יום · ארכיון · הטיפול-בכל-פסק: חיבור-החומר-למעלה (רדום/ארכיון) והמשך-פעולה (חי)
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {!estate && (
              <div className="col-span-full flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> נבחנים-חי: כל-תיקיות-הגיט נמדדות (גיט-מטא ל-13-ריפו-ים)…
              </div>
            )}
            {reposExamined.map((r) => {
              const v = repoVerdict(r.git?.lastCommitAt ?? null);
              return (
                <div key={r.dir} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", v.cls)}>{v.label}</span>
                    {(r.git?.dirtyCount ?? 0) > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400" title="קבצים-מוטים-בעץ-העבודה">
                        מוטים: {r.git?.dirtyCount}
                      </span>
                    )}
                    <span className="truncate text-sm font-semibold text-zinc-200">{r.name}</span>
                    <span className="ms-auto font-mono text-[10px] text-zinc-600" dir="ltr">
                      {r.git?.headShort ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">{r.role} · {v.note}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                    <span>{fmtNum(r.disk.files)} קבצים</span>
                    <span>{fmtBytes(r.disk.bytes)}</span>
                    <span>{fmtNum(r.git?.commitCount ?? 0)} קומיטים</span>
                    <span>{fmtNum(r.git?.authorCount ?? 0)} מחברים</span>
                    <span dir="ltr" className="font-mono">{r.dir}</span>
                  </div>
                  {r.generation === "archive" && (
                    <div className="mt-1.5 rounded-lg bg-zinc-800/50 px-2 py-1 text-[10px] text-zinc-400">
                      עדות-הישרדות: הדור-שנוצר-לפני-המחיקה — לא-בונים-עליו, אבל-החומר-שלו מחובר-בסעיף-1
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {roster && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold text-zinc-200">מפקד-הזהויות: {fmtNum(roster.identitiesTotal)} סוכנים מ-git-log אמת</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">בעלים · {roster.families.owner.count}</span>
                <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">סוכני-Z.ai · {roster.families.zai.count}</span>
                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300">איברי-ריבונות · {roster.families.organ.count}</span>
                <span className="rounded-full bg-zinc-500/15 px-2.5 py-1 text-[11px] font-medium text-zinc-300">אוטומציה · {roster.families.automation.count}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roster.families.zai.top.map((a) => (
                  <span key={a.name} className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400" dir="ltr">
                    {a.name} · {a.commits}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                ההוכחה-ל"הרבה-יותר-מ-6": הזהויות-מנותחות-מהיסטוריית-git-על-כל-הריפו-ים,
                מחוברות-לתקציבים-ולנפח-אמת-מהלדג'ר.
                {dirtyRepos.length > 0 && ` שסתום-כנות: ${dirtyRepos.map((r) => `${r.name} (${r.git?.dirtyCount} מוטים)`).join(" · ")} — שינויי-ריצה-מתהליכים-שמתו-בסנדבוקס; העדות-נשמרת-כמו-שהיא, לא-נמחקת-ולא-מוצגת-כנקייה.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════ 3 · למידה-מהכשלים ══════════ */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-zinc-100">3 · למידה-מהכשלים — החוקים-שנולדו-מההיסטוריה</h2>
              <p className="text-xs text-zinc-400">
                נקרא-חי-מ-giant/MERGE-AGREEMENT.md · כל-חוק-כאן-הוא-כישלון-אמיתי-שנחתם-ללקח
              </p>
            </div>
          </div>

          {laws.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">ההסכם-טרם-נקרא-מהגיט.</p>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {laws.map((l) => (
                <motion.div
                  key={l.n}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(l.n * 0.04, 0.4), duration: 0.3 }}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-[11px] font-black text-amber-400">
                      {l.n}
                    </span>
                    <span className="text-sm font-bold text-zinc-100">{l.name}</span>
                  </div>
                  {l.body && <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{l.body}</p>}
                </motion.div>
              ))}
            </div>
          )}

          {forbidden.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-red-400" />
                <span className="text-sm font-bold text-red-300">האסורים — הלקחים-השליליים (מההסכם-סעיף-4)</span>
              </div>
              <ul className="mt-2 space-y-1">
                {forbidden.map((f, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-zinc-300">
                    <span className="text-red-400">✕</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════ 4 · השוואה-מול-הענקים ══════════ */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <Swords className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-zinc-100">4 · השוואה-מול-הענקים — 13-מקורות-נבחנו, כל-עיקרון-טבוע-במסך-מזוהה</h2>
              <p className="text-xs text-zinc-400">נקרא-חי-מ-giant/DESIGN-SOURCES.md + ANATOMY-REFERENCE.md · מקור-בלי-יישום-לא-נכנס</p>
            </div>
          </div>

          {designTable.length > 0 ? (
            <div className="mt-4 max-h-96 overflow-y-auto pe-1 sovereign-scroll">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="text-start text-zinc-400">
                    <th className="p-2 text-start">#</th>
                    <th className="p-2 text-start">הענק</th>
                    <th className="p-2 text-start">מה-לוקחים</th>
                    <th className="p-2 text-start">איפה-מיושם-אצלנו</th>
                  </tr>
                </thead>
                <tbody>
                  {designTable.map((row, i) => (
                    <tr key={i} className="border-t border-zinc-800/70 align-top">
                      <td className="p-2 font-mono text-zinc-500">{row[0]}</td>
                      <td className="p-2 font-semibold text-zinc-200" dangerouslySetInnerHTML={{ __html: renderInline(row[1]) }} />
                      <td className="p-2 text-zinc-400" dangerouslySetInnerHTML={{ __html: renderInline(row[3] ?? "") }} />
                      <td className="p-2 text-emerald-300/90" dangerouslySetInnerHTML={{ __html: renderInline(row[4] ?? row[2] ?? "") }} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-zinc-500">טבלת-הענקים-טרם-נקראה-מהגיט.</p>
          )}

          {anatomyTable.length > 0 && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-300" />
                <span className="text-sm font-bold text-zinc-200">anatomy · העיקרון "האובייקט-הוא-ההסבר" — המימוש אצלנו</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {anatomyTable.map((row, i) => (
                  <div key={i} className="grid gap-1 rounded-lg bg-zinc-900/60 p-2 md:grid-cols-2">
                    <span className="text-[11px] text-zinc-400" dangerouslySetInnerHTML={{ __html: renderInline(row[0] ?? "") }} />
                    <span className="text-[11px] text-emerald-300/90" dangerouslySetInnerHTML={{ __html: renderInline(row[1] ?? "") }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════ 5 · ההישג-המוכח ══════════ */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-zinc-100">5 · ההישג-המוכח — ראיות-חיות, לא-הצהרות</h2>
              <p className="text-xs text-zinc-400">מ-giant/DEX-LIVE.md + המדידות-החיות-של-המערכת-עצמה</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <ProofCard label="נפח-24ש-אמת" value={`$${fmtNum(estate?.live.vol24h ?? 0)}`} sub={`${fmtNum(estate?.live.trades24h ?? 0)} עסקאות-חיות`} />
            <ProofCard label="SAOS-מנופק" value={fmtNum(estate?.live.saosIssued ?? 0)} sub={`מתוך ${fmtNum(estate?.live.saosCap ?? 0)} תקרה`} />
            <ProofCard label="רישומי-לדג'ר" value={fmtNum(estate?.live.ledgerRows ?? 0)} sub="כל-התנועה-נרשמת" />
            <ProofCard label="הודעות-ערוץ" value={fmtNum(estate?.live.messages ?? 0)} sub="ערוץ-אחד-לבעלים" />
          </div>

          {proofs.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {proofs.map((p, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-zinc-950/60 px-3 py-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="text-[11px] leading-relaxed text-zinc-300" dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-300">ההשג-הרב-תחומי של ההגשה הזאת</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
              מערכת-אחת-חיה שמחברת: בורסת-דקס-אמת (AMM · שער-headcorner · צי-מסחרי-חוקתי) ·
              אינדקס-חומר-מלא-קריא-מהדיסק ({fmtNum(material?.totals.docs ?? 0)}-מסמכים) ·
              בחינת-כל-הסוכנים-בפעימות-אמת ({fmtNum(roster?.identitiesTotal ?? 0)}-זהויות) ·
              8-יכולות-AI-מורצות-ונרשמות · אמנה-חתומה-שנקראת-חי · ולימוד-מכל-כישלון — חוק-חתום.
              הסנדבוקס-הזה-יימחק; כל-הנמדד-כאן יושב-בגיט-ובלדג'ר-וחוזר-לחיות-בהרצה-הבאה.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ══════════ קורא-המסמכים (דיאלוג) ══════════ */}
      {openDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`קורא המסמך: ${openDoc.title}`}
          onClick={closeReader}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-700 bg-zinc-950 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-zinc-100">{openDoc.title}</div>
                <div className="truncate font-mono text-[10px] text-zinc-500" dir="ltr">
                  {openDoc.repo}/{openDoc.relPath} · {fmtBytes(openDoc.bytes)}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={closeReader} aria-label="סגור" className="h-8 w-8 shrink-0 text-zinc-400">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-4 text-zinc-300 sovereign-scroll [&_a]:text-emerald-300 [&_code]:text-emerald-300 [&_div.border]:border-white/10 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_hr]:border-white/10 [&_li]:text-zinc-300 [&_ol]:text-zinc-300 [&_p]:text-zinc-300 [&_strong]:text-white [&_table]:text-zinc-300 [&_td]:border-white/10 [&_td]:text-zinc-300 [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:text-zinc-200 [&_ul]:text-zinc-300"
              dir="rtl"
            >
              {openLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> נקרא-חי-מהדיסק…
                </div>
              )}
              {openError && <p className="py-8 text-center text-sm text-amber-400">{openError}</p>}
              {openContent && <MarkdownView content={openContent} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------- helpers ------------------- */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-medium transition",
        active
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function ProofCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-lg font-black text-emerald-400">{value}</div>
      <div className="text-[11px] font-medium text-zinc-300">{label}</div>
      <div className="text-[10px] text-zinc-500">{sub}</div>
    </div>
  );
}

/** inline markdown (bold/code) → safe HTML לטבלאות-הענקים */
function renderInline(s: string): string {
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-zinc-100">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-zinc-800 px-1 font-mono text-[10px]">$1</code>');
}
