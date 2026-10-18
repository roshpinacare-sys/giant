import { NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/saos/builder-brain — מוח-הבנאי-הריבוני (גל-92 · agent-2)
 *
 * "פעולות ברמה גבוהה יותר מאנושי" (הוראת-בעלים): המוח (LLM, backend בלבד) מציע
 * פריטי-שיפור קונקרטיים לבנאי. חוקי-אכיפה קשיחים:
 *  - המוח לעולם אינו מריץ קוד, אינו ניגע בכספות/סודות, אינו פותח רשת-חוץ.
 *  - רק white-list סוגי-פעולה; הבנאי מבצע אך-ורק מתוכו (אכיפה-כפולה: כאן ובפעימה).
 *  - fail-open: כל-תקלה → { brain:false, items:[] } — הבנאי ממשיך מה-backlog הקנוני.
 */

const KINDS = ["tool-run", "note-open", "report-write", "milestone-tag"];
const TOOLS = ["verify_chain"];
const CACHE_MS = 5 * 60_000;
let __cache: { at: number; items: unknown[] } | null = null;

type Item = { kind: string; title: string; detail: string; tool?: string };

function clampItems(raw: unknown): Item[] {
  const out: Item[] = [];
  const arr = Array.isArray(raw) ? raw : [];
  for (const it of arr.slice(0, 3)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const kind = String(o.kind ?? "").trim();
    const title = String(o.title ?? "").trim().slice(0, 80);
    const detail = String(o.detail ?? "").trim().slice(0, 240);
    const tool = o.tool ? String(o.tool).trim().slice(0, 40) : undefined;
    if (!KINDS.includes(kind) || !title) continue;
    if (kind === "tool-run" && (!tool || !TOOLS.includes(tool))) continue;
    out.push({ kind, title, detail, ...(tool ? { tool } : {}) });
  }
  return out;
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const brace = text.match(/(\{[\s\S]*\})/);
  if (brace) { try { return JSON.parse(brace[1]); } catch {} }
  return null;
}

type BrainClient = {
  chat: {
    completions: {
      create: (p: Record<string, unknown>) => Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
    };
  };
};
type BrainSdk = { default: { create: () => Promise<BrainClient> } };

export async function POST(req: Request) {
  try {
    if (__cache && Date.now() - __cache.at < CACHE_MS) {
      return NextResponse.json({ brain: true, cached: true, items: __cache.items });
    }

    let snapshot: Record<string, unknown> = {};
    try {
      const j = (await req.json()) as { snapshot?: Record<string, unknown> };
      snapshot = j?.snapshot ?? {};
    } catch {}

    const ctx = {
      ledgerSeq: snapshot.ledgerSeq ?? null,
      ledgerLines: snapshot.ledgerLines ?? null,
      beatSeq: snapshot.beat?.seq ?? null,
      beatTx: snapshot.beat?.tx ?? null,
      price: snapshot.beat?.price ?? null,
    };

    const mod = (await import("z-ai-web-dev-sdk")) as unknown as BrainSdk;
    const zai = await mod.default.create();

    const system = `אתה המוח-המתכנן של הבנאי-הריבוני במערכת SAOS — כלכלה פנימית עצמאית מעגל-סגור עם ספר-קנוני בגיט (פנקס שרשרת-hash).
מטרתך: להציע פריטי-בנייה ושיפור מדודים, אמיתיים ובעלי-ערך — "בניה ולא רק בדיקות" (הוראת-בעלים).
הגבלות-קשיחות: אין לך יכולת להריץ קוד; הפריטים יבוצעו על-ידי בנאי-מכני אך-ורק מתוך סוגי-פעולה מוגדרים.
סוגי-פעולה מותרים (kind):
- "tool-run": הרצת כלי-ארסנל. tool זמין כרגע: "verify_chain" (אימות-שרשרת בלתי-תלוי).
- "note-open": פתיחת-יכולת חדשה בקטלוג-יכולות הריבוני — תחום-עשייה רב-תחומי חדש שהמערכת עוסקת בו מעכשיו (למשל: ניטור-שוק, למידה-מטלמטריה, תכנון-תזרים, עמידות-רשת). title=שם-היכולת, detail=מה-בדיוק היא מוסיפה.
- "report-write": הפקת דוח-צמיחה מהסדרה-החיה.
- "milestone-tag": ציון-אבן-דרך ריבונית.
כללים: עד 3 פריטים; עברית בלבד; title עד 80 תווים; detail עד 240 תווים; ללא סודות/טוקנים/מחרוזות-דמויי-מפתח; ללא הדמיות; העדף פריטים שמרחיבים תחומים חדשים על-פני חזרה על קיים.
החזר אך-ורק JSON: {"items":[{"kind":"...","title":"...","detail":"...","tool":"verify_chain"}]}`;

    const user = `מצב-חי נכון-לעכשיו: ${JSON.stringify(ctx)}. הצע פריטי-בנייה-הבאים.`;

    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        max_tokens: 600,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("brain-timeout")), 20_000)),
    ])) as { choices?: Array<{ message?: { content?: string } }> };

    const text = completion?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);
    const items = clampItems(parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : parsed);
    __cache = { at: Date.now(), items };
    return NextResponse.json({ brain: true, items });
  } catch {
    return NextResponse.json({ brain: false, items: [] });
  }
}
