/**
 * GET /api/giant/marketing — משטח-השיווק החי של Adsmarket (גל-11).
 * ═══════════════════════════════════════════════════════════════════════════
 * מנדט-הבעלים (גל-10): "אי אפשר להפנות לבורסה/מוצרים ולקבל דף ישן עם גיבובי-ai —
 * צריך דברים שיהיו מה שכתוב שיהיה" — הדלת הזאת קוראת את ערכת-השיווק
 * **מהריפו עצמו, מילה-במילה** (verbatim): אפס-סינתזה, אפס-עריכה, אפס-גיבובי-ai.
 *  · PAT שרת-בלבד (office-truth.readPat) — הספרייה-פרטית: 404-ללא-אימות.
 *  · 9 קבצי-המקור של הערכה: README · brand · fact-sheet · pitch · social ·
 *    faq · compare · disclosure-policy · ecosystem.
 *  · כשל-מקור = ok:false כנה לאותו-קובץ; אפס-טקסט-מצויר.
 *  · תקרת-שקיפות: כל-סעיף-נחתך-בהצהרה (maxChars) — החיתוך-מוצהר, לא-מוסתר.
 * cache-זיכרון 120 שניות.
 */
import { NextResponse } from "next/server";
import { readPat } from "@/lib/office-truth";
import type { MarketingFile, MarketingPayload, MarketingSection } from "@/lib/giant/marketing-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: MarketingPayload } | null = null;
const CACHE_MS = 120_000;

const RAW_BASE = "https://raw.githubusercontent.com/roshpinacare-sys";
const REPO = "Adsmarket";
const BRANCH = "main";

/** תקרות-שקיפות (מוצהרות בפתק-הדלת) */
const MAX_SECTIONS = 16;
const MAX_SECTION_CHARS = 2000;

/** קבצי-המקור של ערכת-השיווק — השמות עצמם הם הראיה */
const KIT: Array<{ file: string; he: string }> = [
  { file: "README.md", he: "המניפסט" },
  { file: "brand.md", he: "קול-המותג" },
  { file: "fact-sheet.md", he: "גיליון-עובדות · מקור-האמת" },
  { file: "pitch.md", he: "הפיץ'" },
  { file: "social.md", he: "פוסטים-מוכנים" },
  { file: "faq.md", he: "שאלות-והתנגדויות" },
  { file: "compare.md", he: "השוואה-כנה" },
  { file: "disclosure-policy.md", he: "מדיניות-חשיפה" },
  { file: "ecosystem.md", he: "מסמך-המסגרת" },
];

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

/** כותרת-ה-# הראשונה — מילולית, מנוקה-מתגים */
function headlineOf(md: string): string | null {
  const lines = md.split(/\r?\n/).map((l) => l.trim());
  const h = lines.find((l) => l.startsWith("#"));
  return h ? h.replace(/^#+\s*/, "").slice(0, 160) : null;
}

/** שורת-האמת (>) הראשונה — מילולית */
function quoteOf(md: string): string | null {
  const q = md.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith(">") && l.length > 10);
  return q ? q.replace(/^>\s*/, "").slice(0, 260) : null;
}

/**
 * פיצול-ורבטימי לסעיפים: כותרת (#{1,3}) פותחת-סעיף; הטקסט-בין-הכותרות
 * עובר **כמו-שהוא** (כולל-טבלאות/רשימות/קוד) — התצוגה מרנדרת, לא מפרשת.
 * החיתוך-היחיד: תקרת-אורך-מוצהרת (MAX_SECTION_CHARS · MAX_SECTIONS).
 */
function parseSections(md: string): { sections: MarketingSection[]; truncated: boolean } {
  const lines = md.split(/\r?\n/);
  const sections: MarketingSection[] = [];
  let cur: MarketingSection = { h: null, text: "" };
  let truncated = false;

  const push = (s: MarketingSection) => {
    const t = s.text.replace(/\n{3,}/g, "\n\n").trim();
    if (!t) return;
    if (sections.length >= MAX_SECTIONS) {
      truncated = true;
      return;
    }
    sections.push(
      t.length > MAX_SECTION_CHARS
        ? { h: s.h, text: `${t.slice(0, MAX_SECTION_CHARS)}\n…(נחתך-בהצהרה — המקור-המלא-בריפו)` }
        : { h: s.h, text: t },
    );
  };

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      push(cur);
      cur = { h: m[2].trim().slice(0, 160), text: "" };
    } else {
      cur.text += `${line}\n`;
    }
  }
  push(cur);
  return { sections, truncated };
}

export async function loadMarketing(force = false): Promise<MarketingPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const token = await readPat();
  const now = new Date().toISOString();

  const texts = await Promise.all(
    KIT.map((k) => ghText(`${RAW_BASE}/${REPO}/${BRANCH}/${k.file}`, token)),
  );

  const files: MarketingFile[] = KIT.map((k, i) => {
    const md = texts[i];
    if (md === null) {
      return {
        file: k.file,
        he: k.he,
        ok: false,
        note: "הקובץ לא נמדד כרגע מהמקור — כשל-כנה (אפס-טקסט-מצויר)",
        bytes: null,
        headline: null,
        quote: null,
        sections: [],
        fetchedAt: null,
      };
    }
    const { sections, truncated } = parseSections(md);
    return {
      file: k.file,
      he: k.he,
      ok: true,
      note: truncated ? `מוצגים-ראשוני-${MAX_SECTIONS}-סעיפים — המקור-המלא-בריפו` : undefined,
      bytes: new TextEncoder().encode(md).length,
      headline: headlineOf(md),
      quote: quoteOf(md),
      sections,
      fetchedAt: now,
    };
  });

  const payload: MarketingPayload = {
    ok: files.some((f) => f.ok),
    files,
    fetchedAt: now,
    note: "מה-שכתוב-בריפו = מה-שמוצג: כל-הטקסט-כאן-נקרא-חי-מ-roshpinacare-sys/Adsmarket — מילה-במילה, אפס-סינתזה",
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const data = await loadMarketing(force);
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
