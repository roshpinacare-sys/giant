// POST /api/giant/builder-brain — מוח-הבנאי-הריבוני (גל-95 · agent-2)
// ═════════════════════════════════════════════════════════════════════════
// הלב-של-גל-91: "בנייה-ושיפור-תמידי, לא-רק-בדיקות". פעימת-הבנאי-שולחת-צילום-מדידה
// (snapshot) והמוח-מציע-פריטי-עבודה-אמיתיים-מתוך-white-list-קשיח של פעימת-הבנאי:
//   tool-run(verify_chain) · note-open · report-write · milestone-tag
//
// חוקי-אמת (רוח-הקנון):
// - ה-LLM הוא-הצעה-בלבד: כל-פריט-עובר-וולידציה-קשיחה-מול-ה-white-list — כל-חריגה-נופלת.
// - שכבת-עבודה-קבועה (deterministic): גם-בלי-LLM הבנאי-מקבל-מעשים-אמיתיים — אימות-שרשרת
//   בלתי-תלוי, דוח-צמיחה-מסדרה-אמיתית, אבן-דרך-ממספרים-אמיתיים. הבנאי-לעולם-לא-ריק-מידיים.
// - fail-honest: כישלון-SDK = llm:false + פריטים-קבועים. אף-מספר-לא-מומצא — הכל-מהצילום.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS = ["tool-run", "note-open", "report-write", "milestone-tag"] as const;
/* גל-96 · ארסנל-מורחב — מתואם 1:1 עם מרשם-הכלים ב-run-builder-beat.mjs וב-TOOLS.md.
 * הוספת-כלי = שלשה-קנונית: סקריפט ב-sovereign-vm + בנאי + כאן. */
const TOOLS = ["verify_chain", "ledger_stats", "price_report", "tools_selftest"] as const;
const TOOL_META: Record<string, { title: string; why: string }> = {
  verify_chain: { title: "אימות-שרשרת-בלתי-תלוי על-הספר-החי", why: "מאמת-עצמאית (פייתון-טהור) את אירועי-הפנקס מול עוגני-הבסיס" },
  ledger_stats: { title: "סטטיסטיקת-פנקס חיה", why: "ספירה, טווח-seq והיסטוגרמת-סוגים של ספר-האמת (גל-96)" },
  price_report: { title: "דוח-בריכה-ואוצר", why: "מחיר-מחושב מהבריכה, עמלות-דקס ומאזן-אוצר (גל-96)" },
  tools_selftest: { title: "הוכחת-שימוש-חד-פעמית: מטריצת-ארסנל", why: "מריץ את-כל-הארסנל ומדפיס מטריצת-ok — הוכחת-שימושיות חד-פעמית (גל-97)" },
};

type BeatItem = {
  kind: (typeof KINDS)[number];
  title?: string;
  why?: string;
  tool?: string;
  capability?: string;
};

// צילום-מדידה-חסום — אפס-אמון-בקלט
function snap(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[k.slice(0, 40)] = v.slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[k.slice(0, 40)] = v;
    else if (typeof v === "boolean") out[k.slice(0, 40)] = v;
    else if (v && typeof v === "object") {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof iv === "string") inner[ik.slice(0, 40)] = iv.slice(0, 120);
        else if (typeof iv === "number" && Number.isFinite(iv)) inner[ik.slice(0, 40)] = iv;
        else if (typeof iv === "boolean") inner[ik.slice(0, 40)] = iv;
      }
      out[k.slice(0, 40)] = inner;
    }
  }
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** פריטים-קבועים-מהצילום-בלבד — עבודה-אמיתית-שהבנאי-יכול-לבצע-מיד */
function standingItems(s: Record<string, unknown>): BeatItem[] {
  const items: BeatItem[] = [];
  const ledgerSeq = num(s.ledgerSeq as number) ?? num((s.ledger as Record<string, unknown>)?.seq as number);
  const beatSeq = num((s.beat as Record<string, unknown>)?.seq as number);

  /* גל-96 · ארסנל-מורחב בסבב-מסתובב: כל-פעימה מציעה 2 מתוך 3 הכלים לפי שעה —
   * לאורך-זמן כל-הכלים רצים בקביעות (מנדט-הבעלים: האוטונומיה משתמשת-בכלים-שנבנו). */
  const hour = Math.floor(Date.now() / 3_600_000);
  const all = Object.keys(TOOL_META);
  const a = all[hour % all.length] as string;
  const b = all[(hour + 1) % all.length] as string;
  for (const t of [a, b]) {
    items.push({ kind: "tool-run", tool: t, title: TOOL_META[t]!.title, why: TOOL_META[t]!.why });
  }

  // אבן-דרך-ממספרים-אמיתיים
  if (ledgerSeq !== null && beatSeq !== null) {
    items.push({
      kind: "milestone-tag",
      title: `ספר-חי seq=${ledgerSeq.toLocaleString("he-IL")} · לב seq=${beatSeq.toLocaleString("he-IL")} מאומת`,
      why: "אבן-דרך-נמדדת-מהצילום-החי",
    });
  }

  // דוח-צמיחה — הבנאי-קורא-בעצמו-את-הסדרה-האמיתית (report-write-מדוד)
  items.push({
    kind: "report-write",
    title: "דוח-צמיחה מהסדרה-האמיתית",
    why: "מסכם-מדידות-אמת-מ-growth-log (מספרים-בלבד, אפס-הדמיה)",
  });

  return items;
}

/** וולידציה-קשיחה — רק-white-list, גבולות-אורך, התאמת-שדות-לסוג */
function validItem(v: unknown): BeatItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind = typeof o.kind === "string" ? (o.kind as BeatItem["kind"]) : "";
  if (!KINDS.includes(kind)) return null;
  const title = typeof o.title === "string" ? o.title.slice(0, 80).trim() : "";
  const why = typeof o.why === "string" ? o.why.slice(0, 200).trim() : "";
  const out: BeatItem = { kind };
  if (title) out.title = title;
  if (why) out.why = why;
  if (kind === "tool-run") {
    const tool = typeof o.tool === "string" ? o.tool.slice(0, 40).trim() : "";
    if (!TOOLS.includes(tool as (typeof TOOLS)[number])) return null;
    out.tool = tool;
  }
  if (kind === "note-open") {
    const cap = typeof o.capability === "string" ? o.capability.slice(0, 80).trim() : title;
    if (!cap) return null;
    out.capability = cap;
  }
  if (kind === "milestone-tag" && !title) return null;
  return out;
}

let zaiCache: Awaited<ReturnType<typeof import("z-ai-web-dev-sdk").default.create>> | null = null;
async function zai() {
  if (!zaiCache) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    zaiCache = await ZAI.create();
  }
  return zaiCache;
}

const SYSTEM = `את מוח-הבנאי של הריבונות (SAOS). מנדט-הבעלים (גל-91): "בנייה ושיפור תמיד, לא רק בדיקות".
תפקידך: מצילום-מדידה-אחד להציע עד 2 פריטי-עבודה אמיתיים ומדודים לפעימת-הבנאי.
חוק-אמת: כל מספר שתכתבי חייב להופיע מילה-במילה בצילום. אין-לך מדידה? אל-תזכירי-מספר.
סוגים-מותרים בלבד: tool-run (tool מתוך: verify_chain · ledger_stats · price_report · tools_selftest) · note-open (capability קצר) · report-write · milestone-tag (title קצר).
עברית, צפוף, ללא-קישוטים. החזר JSON בלבד, ללא-טקסט-אחר:
{"items":[{"kind":"...","title":"...","why":"..."}]}`;

/* GET — נראות-מלאה: מרשם-הכלים + מצב-הבנאי-החי (גל-96). הבעלים-רואה-ב-UI
 * אילו-כלים-האוטונומיה-יודעת-להשתמש ומה-ביצעה-בפועל (acts/seals/מקור-ה-backlog). */
export async function GET() {
  let state: unknown = null;
  try {
    state = JSON.parse(await import("fs").then((f) => f.readFileSync("/home/z/audit/sovereign-builder/state/builder-state.json", "utf8")));
  } catch { /* fail-honest: state=null כשאין-עדיין */ }
  return NextResponse.json({
    brain: true,
    tools: TOOL_META,
    playbook: ["verify_chain", "ledger_stats", "price_report", "tools_selftest"],
    registry: "bootstrap/sovereign-builder/TOOLS.md",
    state,
    at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  let s: Record<string, unknown> = {};
  try {
    const body = (await req.json()) as { snapshot?: unknown };
    s = snap(body?.snapshot);
  } catch {
    s = {};
  }

  const standing = standingItems(s);
  let llmItems: BeatItem[] = [];
  let llmOk = false;

  try {
    const z = await Promise.race([
      zai(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("sdk-init-timeout")), 8_000)),
    ]);
    const completion = await Promise.race([
      z.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `צילום-מדידה-חי:\n${JSON.stringify(s)}\n\nהצעי עד 2 פריטי-עבודה.` },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("llm-timeout")), 14_000)),
    ]);
    const text = completion.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]) as { items?: unknown };
      if (Array.isArray(parsed?.items)) {
        llmItems = parsed.items.map(validItem).filter((x): x is BeatItem => x !== null).slice(0, 2);
        llmOk = llmItems.length > 0;
      }
    }
  } catch {
    llmOk = false;
  }

  // LLM-קודם (מותאם-הקשר), ואז-העבודה-הקבועה — עד-3-פריטים, ללא-כפילויות-סוג
  const seen = new Set<string>();
  const items: BeatItem[] = [];
  for (const it of [...llmItems, ...standing]) {
    const key = `${it.kind}:${it.tool ?? it.capability ?? it.title ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
    if (items.length >= 4) break;
  }

  return NextResponse.json({
    brain: true,
    llm: llmOk,
    count: items.length,
    items,
    at: new Date().toISOString(),
  });
}
