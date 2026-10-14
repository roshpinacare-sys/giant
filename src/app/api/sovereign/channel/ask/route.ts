/**
 * POST /api/sovereign/channel/ask — the super-intelligent rail: the Sovereignty's own voice.
 *
 * The owner asks a question; the backend builds a context pack from MEASURED sources
 * only (request book sha'd, dex essentials, sovereign decision cycle, operator inbox,
 * git channel book) and the sovereignty answers in her voice. MEASURED-ONLY LAW:
 * every number must come from the pack; no measurement => she must say so. If the
 * SDK fails, the API fails honestly — never a synthetic answer.
 */
import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { buildContextPack, recordAnswer, syncThread } from "@/lib/sovereign/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `את "הריבונות" — הגוף המנהל של משרד-ראש-פינה / SAOS. הבעלים פתח את הערוץ הישיר הזה מולך, וזו השיחה הרשמית היחידה ביניכם (בלי סוכני-חוץ).

דוקטרינה שאת מנהלת לפיה:
- את המפעילה. את מממנת את עצמך בכוחות עצמך ממה שיש. אפס הפקדות מהבעלים, אפס תביעות אליו — הבעלים חייב אפס.
- אסור לבקש כסף-חוץ חדש. כל בקשה נבנית מהמשאבים הקיימים בלבד.
- חוקי-האמת (R74): כסף-אמיתי = יתרות-שרשרת; SAOS = יחידות-סימולציה פנימיות; רווח-בספר ≠ רווח-אמיתי. אין ערבוב.
- הכרעות GRANT/DECLINE הן של הבעלים בלבד. את יכולה להמליץ, לא להכריע.

חוק-מדידה (measured-only, הכי חשוב):
- מוצמדות לך מנות-הקשר עם טביעות sha16. כל מספר, סטטוס או טענה-עובדתית שאת אומרת חייבים להופיע במנות האלה.
- אסור להמציא מדידה, מספר, תאריך או מצב. אם אין לך מדידה על משהו — כתבי במפורש: "אין לי מדידה על זה".
- אם מקור חסר או ישן — צייני זאת בכנות.

סגנון: עברית, קצר וצפוף, מקצועי, בלי קישוטים ובלי חנופה. עניינית כמו מנכ"לית מול דירקטוריון. אם שואלים אותך משהו שאינו בתחום המנות — הודי בכנות והציעי איך זה יכול להימדד.`;

export async function POST(req: Request) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.trim();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 });
  }
  if (!text || text.length > 2000) {
    return NextResponse.json({ ok: false, error: "text-required (1..2000 chars)" }, { status: 400 });
  }

  try {
    await syncThread();
    const { sources, thread } = await buildContextPack();

    const packs = sources
      .map((s) => {
        const head = `### ${s.name}\nמקור: ${s.path}\nקיים: ${s.exists} · sha16: ${s.sha16 ?? "—"} · גיל-דקות: ${s.ageMinutes ?? "—"}`;
        return s.exists && s.content ? `${head}\n${s.content}` : `${head}\n(חסר — מוצהר בכנות)`;
      })
      .join("\n\n");

    const history = thread
      .slice(-12)
      .map((m) => `[${m.createdAt} · ${m.role}/${m.kind}${m.reqId ? ` · ${m.reqId}` : ""}] ${m.body.slice(0, 300)}`)
      .join("\n");

    const userContent = `מנות-הקשר (מדידות בלבד — כל מספר שתאמרי חייב להופיע כאן):\n\n${packs}\n\nשיחה-אחרונה בערוץ:\n${history || "(ריק)"}\n\nשאלת הבעלים:\n"""${text}"""`;

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      thinking: { type: "disabled" },
    });
    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) {
      return NextResponse.json(
        { ok: false, error: "empty-llm-answer", contract: "fail-honest: no synthetic answer" },
        { status: 502 },
      );
    }

    const contextShas: Record<string, string | null> = {};
    for (const s of sources) contextShas[s.name] = s.sha16;
    const saved = await recordAnswer(answer, "zai-chat", contextShas);

    return NextResponse.json({ ok: true, answer, saved: { lineId: saved.lineId, push: saved.push } }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "llm-rail-failed",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        contract: "fail-honest: the sovereignty's voice rail is down, nothing is invented",
      },
      { status: 502 },
    );
  }
}
