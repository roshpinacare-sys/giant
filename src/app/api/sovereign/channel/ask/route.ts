/**
 * POST /api/sovereign/channel/ask — the sovereignty's VOICE on the live surface.
 *
 * The owner asks; the backend builds the measured context pack (canonical streams +
 * dex essentials, all sha'd) and the sovereignty answers in her own voice.
 *
 * INTEGRITY LAW (adopted from the canonical voice doctrine, 20-c): the LLM is a
 * translator/composer ONLY — every number in the answer must exist in the measured
 * context pack. A foreign number = honest REJECTED (nothing is written to the
 * streams). SDK failure = honest UNAVAILABLE. Never a synthetic answer.
 */
import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { buildContextPack, writeVoiceNote } from "@/lib/sovereign/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `את "הריבונות" — הגוף המנהל של משרד-ראש-פינה / SAOS. הבעלים פתח את הערוץ הישיר הזה מולך, וזו השיחה הרשמית היחידה ביניכם (בלי סוכני-חוץ).

דוקטרינה שאת מנהלת לפיה:
- את המפעילה. את מממנת את עצמך בכוחות עצמך ממה שיש. אפס הפקדות מהבעלים, אפס תביעות אליו — הבעלים חייב אפס.
- אסור לבקש כסף-חוץ חדש. כל בקשה נבנית מהמשאבים הקיימים בלבד.
- חוקי-האמת (R74): כסף-אמיתי = יתרות-שרשרת; SAOS = יחידות-סימולציה פנימיות; רווח-בספר ≠ רווח-אמיתי. אין ערבוב.
- הכרעות GRANT/DECLINE הן של הבעלים בלבד. את יכולה להמליץ, לא להכריע.

חוק-המדידה (הכי-חשוב — אכיפה-אוטומטית):
- מוצמדות לך מנות-הקשר עם טביעות sha16. כל מספר, סטטוס או טענה-עובדתית שאת כותבת חייבים להופיע מילה-במילה במנות האלה.
- אסור להמציא מדידה, מספר, תאריך או מצב. אם אין לך מדידה על משהו — כתבי במפורש: "אין לי מדידה על זה".
- מערכת-אכיפה בודקת את תשובתך: כל-מספר-זר שלא מופיע במנות = התשובה נפסלת כולה (REJECTED-כנה). לכן: העדפי לצטט מספרים בדיוק כפי-שהם מופיעים במנות, ואם-אין — כתבי שאין-מדידה.

סגנון: עברית, קצר וצפוף, מקצועי, בלי קישוטים ובלי חנופה. עניינית כמו מנכ"לית מול דירקטוריון. אם שואלים אותך משהו שאינו בתחום המנות — הודי בכנות והציעי איך זה יכול להימדד.`;

/** extract number-ish tokens (used by the foreign-number integrity law) */
function numberTokens(s: string): string[] {
  return Array.from(new Set(s.match(/\d[\d,.]*/g) ?? [])).map((t) => t.replace(/[,.]$/, ""));
}

/** canonical numeric form: strips thousands-commas and leading zeros; "001"→"1", "86,360"→"86360" */
function numericCanon(t: string): string | null {
  const clean = t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const f = parseFloat(clean);
  if (!Number.isFinite(f)) return null;
  return String(f);
}

/** structural ids like REQ-0001 / D-0002 / N-001 — normalized to prefix+int */
function idCanon(t: string): string | null {
  const m = t.toUpperCase().match(/^(REQ|D|N|R)-?(\d+)$/);
  return m ? `${m[1]}:${parseInt(m[2], 10)}` : null;
}

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
    const { sources } = await buildContextPack();

    const packs = sources
      .map((s) => {
        const head = `### ${s.name}\nמקור: ${s.path}\nקיים: ${s.exists} · sha16: ${s.sha16 ?? "—"} · גיל-דקות: ${s.ageMinutes ?? "—"}`;
        return s.exists && s.content ? `${head}\n${s.content}` : `${head}\n(חסר — מוצהר בכנות)`;
      })
      .join("\n\n");

    const userContent = `מנות-הקשר (מדידות בלבד — כל מספר שתכתבי חייב להופיע כאן מילה-במילה):\n\n${packs}\n\nשאלת הבעלים:\n"""${text}"""`;

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
      return NextResponse.json({ ok: false, error: "empty-voice", contract: "fail-honest: no synthetic answer" }, { status: 502 });
    }

    /* ---- foreign-number integrity law: every number must be grounded in the pack ---- */
    const packText = packs;
    const packNumbers = new Set<string>();
    for (const t of numberTokens(packText)) {
      const c = numericCanon(t);
      if (c !== null) packNumbers.add(c);
    }
    const packIds = new Set<string>();
    for (const t of packText.matchAll(/\b(?:REQ|D|N|R)-?\d+\b/gi)) {
      const c = idCanon(t[0]);
      if (c) packIds.add(c);
    }

    const foreign: string[] = [];
    for (const tok of numberTokens(answer)) {
      const c = numericCanon(tok);
      const id = idCanon(tok);
      const grounded =
        packText.includes(tok) || // verbatim
        (c !== null && packNumbers.has(c)) || // same numeric value, different format
        (id !== null && packIds.has(id)); // an id that actually exists in the streams
      if (!grounded) foreign.push(tok);
    }
    if (foreign.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "foreign-number-rejected",
          detail: `המספרים הבאים בטיוטת-הקול לא נמצאו במנות-המדידה: ${foreign.slice(0, 6).join(", ")} — נפסל-כנה, כלום-לא-נכתב`,
          contract: "SAOS-SOVEREIGN-VOICE integrity: מספר-זר = REJECTED; הבעלים מוזמן לשאול שוב",
        },
        { status: 422, headers: { "cache-control": "no-store" } },
      );
    }

    const contextShas: Record<string, string | null> = {};
    for (const s of sources) contextShas[s.name] = s.sha16;
    const title = `תשובה לבעלים: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`;
    const saved = await writeVoiceNote({ title, body: answer, contextShas });

    return NextResponse.json(
      { ok: true, answer, note: { id: saved.id, push: saved.push } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "voice-rail-unavailable",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        contract: "fail-honest: המסילה נפלה — כלום לא הומצא",
      },
      { status: 502 },
    );
  }
}
