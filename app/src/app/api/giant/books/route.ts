/**
 * GET /api/giant/books — דלת-החיבור של ארבעת-הספרים (גל-9 · "ארבעת-המחוברים").
 * ═══════════════════════════════════════════════════════════════════════════
 * מנדט-הבעלים: "המון חומר אבל כלום לא מחובר" (גל-7) — ובגל-9 הממתינים חוברו.
 * כל-ספר-נקרא-חי מ-GitHub-raw (PAT שרת-בלבד, אפס-חשיפה):
 *  · saos-agents  → fleet-coordination/CLAIMS.json (FLEET-COORDINATION/1)
 *  · Defi         → fleet/KPI.json + fleet/MISSION-1000.md (משימת-1000$/יום)
 *  · Adsmarket    → README.md (ערכת-השיווק הרשמית)
 *  · saos-markets → FLEET-DOCKING.md (החלטת-הבעלים: הצי-על-הווליום-של-הדקס)
 * חוק-אמת: כשל-מקור = ok:false כנה לאותו-ספר; אפס-סינתזה; אפס-מספרים-מצוירים.
 * cache-זיכרון 60 שניות.
 */
import { NextResponse } from "next/server";
import { readPat } from "@/lib/office-truth";
import type { BookFacts, BookPayload, BooksPayload } from "@/lib/giant/books-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: BooksPayload } | null = null;
const CACHE_MS = 60_000;

const RAW_BASE = "https://raw.githubusercontent.com/roshpinacare-sys";

interface ClaimsFile {
  protocol?: string;
  claims?: Array<{ task_id?: string; agent?: string; status?: string; claimed_at?: string }>;
  open_workstreams?: Record<string, unknown>;
}
interface KpiFile {
  mission?: string;
  ladder?: { current?: string; next?: string; proven?: boolean; noteHe?: string };
  revenuePerDayReal?: { usd?: number };
}

async function ghText(url: string, token: string | null): Promise<string | null> {
  try {
    const headers: Record<string, string> = { "cache-control": "no-cache" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function ghJson<T>(url: string, token: string | null): Promise<T | null> {
  const t = await ghText(url, token);
  if (t === null) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

/** כותרת-ראשונה-אמיתית (שורת-# או-שורה-מלאה-הראשונה), מנוקה-מתגי-עיצוב */
function headlineOf(md: string | null): string | null {
  if (!md) return null;
  const lines = md.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const h = lines.find((l) => l.startsWith("#")) ?? lines[0] ?? null;
  return h ? h.replace(/^#+\s*/, "").slice(0, 140) : null;
}

/** שורת-ציטוט-בעלים (> ...) הראשונה — הראיה-המדודה של הספר */
function quoteOf(md: string | null): string | null {
  if (!md) return null;
  const q = md.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith(">") && l.length > 10);
  return q ? q.replace(/^>\s*/, "").slice(0, 220) : null;
}

function firstMdParagraph(md: string | null): string | null {
  if (!md) return null;
  const body = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith(">"));
  return body.length ? body[0].slice(0, 220) : null;
}

export async function loadBooks(force = false): Promise<BooksPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const token = await readPat();
  const now = new Date().toISOString();

  const [claims, claimsHead, kpi, mission, adsHead, docking, marketsHead] = await Promise.all([
    ghJson<ClaimsFile>(`${RAW_BASE}/saos-agents/main/fleet-coordination/CLAIMS.json`, token),
    ghText(`${RAW_BASE}/saos-agents/main/README.md`, token),
    ghJson<KpiFile>(`${RAW_BASE}/Defi/main/fleet/KPI.json`, token),
    ghText(`${RAW_BASE}/Defi/main/fleet/MISSION-1000.md`, token),
    ghText(`${RAW_BASE}/Adsmarket/main/README.md`, token),
    ghText(`${RAW_BASE}/saos-markets/main/FLEET-DOCKING.md`, token),
    ghText(`${RAW_BASE}/saos-markets/main/README.md`, token),
  ]);

  const wsEntries = Object.entries(claims?.open_workstreams ?? {});
  const activeClaims = (claims?.claims ?? []).filter((c) => c.status === "active");

  const books: BookPayload[] = [
    {
      book: "saos-agents",
      role: "ליבת-תזמון-סוכנים מדדה-עצמית: גרף-משימות שאי-אפשר-לשקר-לו",
      ok: Boolean(claims),
      note: claims ? undefined : "CLAIMS.json לא נמדד כרגע — כשל-כנה",
      headline: headlineOf(claimsHead),
      facts: [
        { k: "פרוטוקול", v: claims?.protocol ?? "—" },
        { k: "טענות-פעילות", v: String(activeClaims.length) },
        { k: "זרמי-עבודה-פתוחים", v: String(wsEntries.length) },
        { k: "זרם-ראשון", v: wsEntries.length ? `${wsEntries[0][0]} — ${String(wsEntries[0][1]).slice(0, 80)}` : "—" },
      ],
      fetchedAt: claims ? now : null,
    },
    {
      book: "Defi",
      role: "בית שכבת-ה-DeFi הריבונית: דוקטרינה · KPI-נמדד · משימת-ה-1000$",
      ok: Boolean(kpi),
      note: kpi ? undefined : "KPI.json לא נמדד כרגע — כשל-כנה",
      headline: headlineOf(mission) ?? "MISSION-1000 — רשת-ריבונית שמייצרת 1000$ ביום",
      facts: [
        { k: "משימה", v: kpi?.mission ?? "—" },
        { k: "סולם", v: kpi?.ladder?.current ? `${kpi.ladder.current} → ${kpi.ladder.next ?? "—"}` : "—" },
        { k: "הוכח-רצף", v: kpi?.ladder?.proven === true ? "כן" : kpi?.ladder?.proven === false ? "לא (כנה)" : "—" },
        { k: "הכנסה-ממומשת/יום", v: typeof kpi?.revenuePerDayReal?.usd === "number" ? `$${kpi.revenuePerDayReal.usd}` : "—" },
      ],
      fetchedAt: kpi ? now : null,
    },
    {
      book: "Adsmarket",
      role: "ערכת-השיווק הרשמית של הרשת: ערוץ-ההפצה וכלל-הראיות",
      ok: Boolean(adsHead),
      note: adsHead ? undefined : "README לא נמדד כרגע — כשל-כנה",
      headline: headlineOf(adsHead),
      facts: [{ k: "פתיח-הספר", v: firstMdParagraph(adsHead) ?? "—" }],
      fetchedAt: adsHead ? now : null,
    },
    {
      book: "saos-markets",
      role: "עצימות-הצי על הדקס: ההחלטה-הריבונית הטרייה של הבעלים",
      ok: Boolean(docking),
      note: docking ? undefined : "FLEET-DOCKING.md לא נמדד כרגע — כשל-כנה",
      headline: headlineOf(docking) ?? headlineOf(marketsHead),
      facts: [{ k: "החלטת-הבעלים", v: quoteOf(docking) ?? "—" }],
      fetchedAt: docking ? now : null,
    },
  ];

  const payload: BooksPayload = { ok: books.some((b) => b.ok), books, fetchedAt: now };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadBooks();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
