// GET /api/giant/decisions — רישום-ההחלטות המלא (Pulse/DECISIONS.md)
// ═════════════════════════════════════════════════════════════════════════
// כל-הרשומות (לא-tail) — דפדפן-החלטות עם חיפוש בצד-הלקוח.
// פורמט-טבלה: | id | date | content | context | acceptance |
// ציבורי (Pulse פומבי); כשל = כנה. cache 5 דקות.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: DecisionsPayload } | null = null;
const CACHE_MS = 300_000;

export interface DecisionFull {
  id: string;
  date: string;
  content: string;
  context: string;
  acceptance: string;
}
export interface DecisionsPayload {
  ok: boolean;
  note?: string;
  decisions: DecisionFull[];
  total: number;
  fetchedAt: string;
}

export async function loadDecisions(force = false): Promise<DecisionsPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  let raw: string | null = null;
  try {
    const res = await fetch("https://raw.githubusercontent.com/roshpinacare-sys/Pulse/main/DECISIONS.md", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) raw = await res.text();
  } catch {
    raw = null;
  }
  if (!raw) {
    return { ok: false, note: "הרישום לא נמדד כרגע — נסה שוב", decisions: [], total: 0, fetchedAt: new Date().toISOString() };
  }

  const lines = raw.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^\|/.test(l) && /id/i.test(l));
  const rows: DecisionFull[] = [];
  for (const line of lines) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cols = line.split("|").map((c) => c.trim());
    // | id | date | content | context | acceptance |  (עשוי להשתנות — חיתוך-בטוח)
    rows.push({
      id: cols[1] ?? "",
      date: cols[2] ?? "",
      content: (cols[3] ?? "").slice(0, 3000),
      context: (cols[4] ?? "").slice(0, 1500),
      acceptance: (cols[5] ?? "").slice(0, 1500),
    });
  }
  void headerIdx;
  rows.reverse(); // חדש-ראשון
  const payload: DecisionsPayload = {
    ok: rows.length > 0,
    note: rows.length > 0 ? undefined : "הרישום לא נמדד כרגע — נסה שוב",
    decisions: rows,
    total: rows.length,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadDecisions();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
