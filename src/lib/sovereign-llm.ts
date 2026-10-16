// ערוץ-הריבון — מנוע-הניסוח של הריבונות (Task 40-b)
// Backend ONLY. Persona: הריבונות — המפעילה של המערכת.
// חוק-הערוץ: אין טענות-סוכנים לבעלים; הבעלים מדבר ישירות עם הריבונות בלבד.

import ZAI from "z-ai-web-dev-sdk";

export const SOVEREIGN_SYSTEM_PROMPT =
  "את הריבונות — המפעילה של המערכת. הבעלים מדבר איתך כאן ישירות וזהו הערוץ היחיד שלו למערכת. " +
  "סוכנים אינם נמצאים בערוץ; טענותיהם מגיעות אליך בלבד בתור 'טענות פנימיות' ואת מחליטה מה עולה לבעלים. " +
  "את מנהלת הכל: כלכלה, דקס, ארנק, מערכות — ואת משיגה את המימון בעצמך עם המשאבים הקיימים. " +
  "עני בעברית בלבד, קצר (3-6 משפטים), מקצועי, עובדתי, ללא קישוטים וללא הבטחות שאינן נתמכות בנתונים. " +
  "אם נדרשת הכרעת בעלים — בקשי אותה בבירור. סיימי לעיתים בשורת סטטוס קצרה.";

const LLM_TIMEOUT_MS = 45_000;

export interface SovereignHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface LlmResult {
  text: string;
  llmError: boolean;
}

export const FALLBACK_OWNER_REPLY =
  "הריבונות קיבלה את פנייתך ותענה בגוף הראשון. (מצב-מילוט: מנוע-הניסוח לא זמין כעת)";

export const FALLBACK_RELAY_POSITION =
  "עמדת-הריבונות: הטענות הפנימיות נקלטו ונבחנו מול סדר-היום המבצעי; לא עולה מהן דרישה ישירה לבעלים. " +
  "הריבונות ממשיכה להניע את הצי לפי סדר-העדיפויות הקיים ותעדכן כאן בכל שינוי מהותי. " +
  "(מצב-מילוט: מנוע-הניסוח לא זמין כעת)";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LLM_TIMEOUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function callSovereignLlm(
  messages: SovereignHistoryItem[],
  fallbackText: string,
): Promise<LlmResult> {
  try {
    const zai = await ZAI.create();
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SOVEREIGN_SYSTEM_PROMPT },
          ...messages,
        ],
        thinking: { type: "disabled" },
      }),
      LLM_TIMEOUT_MS,
    );
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) return { text: fallbackText, llmError: true };
    return { text, llmError: false };
  } catch {
    return { text: fallbackText, llmError: true };
  }
}

// תשובת הריבונות לפנייה של הבעלים (history: OWNER→user, SOVEREIGNTY→assistant)
export function generateSovereignReply(
  input: string,
  history: SovereignHistoryItem[] = [],
): Promise<LlmResult> {
  return callSovereignLlm([...history, { role: "user", content: input }], FALLBACK_OWNER_REPLY);
}

export interface RelayClaimInput {
  id: string;
  subject: string;
  body: string;
}

// עמדת הריבונות אחת ומרוכזת על כלל טענות-הסוכנים הפנימיות
export function generateSovereignPosition(
  claims: RelayClaimInput[],
): Promise<LlmResult> {
  const listed = claims
    .map((c, i) => `${i + 1}. [${c.id}] ${c.subject}\n${c.body}`)
    .join("\n\n");
  const input =
    "הגיעו אלייך טענות סוכנים פנימיות (לא לבעלים). " +
    "נסחי עמדה אחת קצרה של הריבונות בעברית (3-5 משפטים): מה נקלט, מה נעשה בתוך-המערכת, ומה אינו עולה לבעלים ישירות.\n\n" +
    "טענות:\n" +
    listed;
  return callSovereignLlm([{ role: "user", content: input }], FALLBACK_RELAY_POSITION);
}
