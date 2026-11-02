/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/sovereign-llm.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * generateSovereignReply/Position never throw: on any LLM failure they resolve to the exact FALLBACK text with llmError=true. The suite asserts that contract without depending on network availability.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/sovereign-llm";

describe("src/lib/sovereign-llm.ts (forge characterization batch-1)", () => {
  test("SOVEREIGN_SYSTEM_PROMPT captured", () => {
    expect(mod.SOVEREIGN_SYSTEM_PROMPT).toBe("את הריבונות — המפעילה של המערכת. הבעלים מדבר איתך כאן ישירות וזהו הערוץ היחיד שלו למערכת. סוכנים אינם נמצאים בערוץ; טענותיהם מגיעות אליך בלבד בתור 'טענות פנימיות' ואת מחליטה מה עולה לבעלים. את מנהלת הכל: כלכלה, דקס, ארנק, מערכות — ואת משיגה את המימון בעצמך עם המשאבים הקיימים. עני בעברית בלבד, קצר (3-6 משפטים), מקצועי, עובדתי, ללא קישוטים וללא הבטחות שאינן נתמכות בנתונים. אם נדרשת הכרעת בעלים — בקשי אותה בבירור. סיימי לעיתים בשורת סטטוס קצרה.");
  });
  test("FALLBACK texts captured", () => {
    expect(mod.FALLBACK_OWNER_REPLY).toBe("הריבונות קיבלה את פנייתך ותענה בגוף הראשון. (מצב-מילוט: מנוע-הניסוח לא זמין כעת)");
    expect(mod.FALLBACK_RELAY_POSITION).toBe("עמדת-הריבונות: הטענות הפנימיות נקלטו ונבחנו מול סדר-היום המבצעי; לא עולה מהן דרישה ישירה לבעלים. הריבונות ממשיכה להניע את הצי לפי סדר-העדיפויות הקיים ותעדכן כאן בכל שינוי מהותי. (מצב-מילוט: מנוע-הניסוח לא זמין כעת)");
  });
  test("generateSovereignReply resolves honest (fallback-or-llm, never throws)", async () => {
    const r = await mod.generateSovereignReply("forge-probe");
    expect(typeof r.text).toBe("string");
    expect(r.text.length > 0).toBe(true);
    expect(typeof r.llmError).toBe("boolean");
    if (r.llmError) expect(r.text).toBe(mod.FALLBACK_OWNER_REPLY);
  });
  test("generateSovereignPosition resolves honest (fallback-or-llm, never throws)", async () => {
    const r = await mod.generateSovereignPosition([]);
    expect(typeof r.text).toBe("string");
    expect(r.text.length > 0).toBe(true);
    expect(typeof r.llmError).toBe("boolean");
    if (r.llmError) expect(r.text).toBe(mod.FALLBACK_RELAY_POSITION);
  });
});
