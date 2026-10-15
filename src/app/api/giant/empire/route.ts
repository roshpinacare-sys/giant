import { NextResponse } from "next/server";
import { loadFleet } from "@/lib/giant/fleet";
import { readTrustCacheRows } from "@/lib/giant/trust-scan";
import { empireRoleFor, EMPIRE_MAP, EMPIRE_GROUPS, type EmpireGroup } from "@/lib/giant/empire-map";

/* ═══ /api/giant/empire — מפת-החיבור החיה של האימפריה (גל-7) ═════════════════
 * מנדט-הבעלים: "יש המון חומר אבל כלום לא מחובר — מחברים את הריבונות להפעלה
 * מלאה מכל תיקיות הגיט". ה-API מאחד שלושה-מקורות-אמת, בלי-להמציא כלום:
 *  1) fleet (GitHub Search חי, מטמון 120ש׳) → קיום · דחיפה-אחרונה · ארכיון
 *  2) trust-cache (saos-trust-check@0.1.0) → סריקה · יכולות · סימנים · קווים-אדומים
 *  3) empire-map (הקנון מהתוכן-שנאסף-בשיחה) → תפקיד · קבוצה · מודול-מחובר · ראיה
 * כשל-כנה: ריפו-בלי-מיפוי = "לא מופה"; כשל-צי = note + אפס-המצאה. */

export const dynamic = "force-dynamic";

export interface EmpireRow {
  name: string;
  url: string;
  group: EmpireGroup | "לא-מופה";
  role: string | null;
  module: string | null;
  evidence: string | null;
  ageMinutes: number | null;
  pushedAt: string | null;
  archived: boolean;
  isPrivate: boolean;
  language: string | null;
  description: string | null;
  branch: string | null;
  files: number | null;
  capabilities: string[];
  signalCount: number | null;
  redLineCount: number | null;
  scannedAt: string | null;
  alive24h: boolean;
}

export async function GET() {
  const fleet = await loadFleet(false);
  const trustRows = readTrustCacheRows();

  if (!fleet.ok) {
    return NextResponse.json(
      { ok: false, note: fleet.note ?? "הצי לא נמדד (כשל-כנה)", rows: [], summary: null, measuredAt: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const trustByName = new Map<string, (typeof trustRows)[number]>();
  for (const t of trustRows) trustByName.set((t.name ?? "").toLowerCase(), t);

  const rows: EmpireRow[] = fleet.repos.map((r) => {
    const role = empireRoleFor(r.name);
    const t = trustByName.get(r.name.toLowerCase());
    const alive = typeof r.ageMinutes === "number" && r.ageMinutes <= 1440;
    return {
      name: r.name,
      url: `https://github.com/roshpinacare-sys/${r.name}`,
      group: role?.group ?? "לא-מופה",
      role: role?.role ?? null,
      module: role?.module ?? null,
      evidence: role?.evidence ?? null,
      ageMinutes: r.ageMinutes,
      pushedAt: r.pushedAt,
      archived: r.archived,
      isPrivate: r.isPrivate,
      language: r.language,
      description: t?.description ?? r.description,
      branch: t?.branch ?? r.defaultBranch,
      files: t?.files ?? null,
      capabilities: t?.capabilities ?? [],
      signalCount: t ? t.signals.length : null,
      redLineCount: t ? t.redLines.length : null,
      scannedAt: t?.scannedAt ?? null,
      alive24h: alive,
    };
  });

  /* ספרים שנמצאים-במפה-הקנונית אבל נעדרים-מהפליט-החי (נסתרים-מהחיפוש) — מוצגים-מהמפה בכנות */
  const seen = new Set(rows.map((r) => r.name.toLowerCase()));
  for (const [name, role] of Object.entries(EMPIRE_MAP)) {
    if (seen.has(name.toLowerCase())) continue;
    const t = trustByName.get(name.toLowerCase());
    rows.push({
      name,
      url: `https://github.com/roshpinacare-sys/${name}`,
      group: role.group,
      role: role.role,
      module: role.module,
      evidence: role.evidence,
      ageMinutes: null,
      pushedAt: null,
      archived: false,
      isPrivate: false,
      language: null,
      description: t?.description ?? null,
      branch: t?.branch ?? null,
      files: t?.files ?? null,
      capabilities: t?.capabilities ?? [],
      signalCount: t ? t.signals.length : null,
      redLineCount: t ? t.redLines.length : null,
      scannedAt: t?.scannedAt ?? null,
      alive24h: false,
    });
  }

  rows.sort((a, b) => {
    const ga = EMPIRE_GROUPS.indexOf(a.group as EmpireGroup);
    const gb = EMPIRE_GROUPS.indexOf(b.group as EmpireGroup);
    const pa = ga === -1 ? EMPIRE_GROUPS.length : ga;
    const pb = gb === -1 ? EMPIRE_GROUPS.length : gb;
    if (pa !== pb) return pa - pb;
    return (a.ageMinutes ?? Infinity) - (b.ageMinutes ?? Infinity);
  });

  const groups: Record<string, number> = {};
  for (const r of rows) groups[r.group] = (groups[r.group] ?? 0) + 1;

  const scanned = rows.filter((r) => r.scannedAt !== null).length;
  const summary = {
    total: rows.length,
    alive24h: rows.filter((r) => r.alive24h).length,
    connected: rows.filter((r) => r.module !== null).length,
    mapped: rows.filter((r) => r.group !== "לא-מופה").length,
    unmapped: rows.filter((r) => r.group === "לא-מופה").length,
    scanned,
    unscanned: rows.length - scanned,
    signals: rows.reduce((s, r) => s + (r.signalCount ?? 0), 0),
    redLines: rows.reduce((s, r) => s + (r.redLineCount ?? 0), 0),
    groups,
  };

  return NextResponse.json(
    { ok: true, summary, rows, measuredAt: new Date().toISOString(), fleetFetchedAt: fleet.fetchedAt },
    { headers: { "cache-control": "no-store" } },
  );
}
