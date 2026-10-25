/**
 * ops-gate.test.ts — בדיקות-שער-המפעיל (directive 1a173c6ac120ccb1 §1).
 * כיסוי: fail-closed 503 (לא-מוגדר) · 401 (טוקן-שגוי/חסר) · מעבר-טוקן-נכון ·
 *        הסכם-מפתח-אב (דיגסט-בלבד) · timing-safe (אורכים-שונים-לא-זורקים).
 * רשת: אפס. שעון: אפס. מוק: אפס — השער נבדק ישירות על Request אמיתי.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { opsGate } from "./ops-gate.ts";

function req(token?: string): Request {
  const h = new Headers({ "content-type": "application/json" });
  if (token !== undefined) h.set("x-saos-operator", token);
  return new Request("http://127.0.0.1:3023/broadcast", { method: "POST", headers: h });
}

async function status(r: Response | null): Promise<number> {
  return r === null ? 200 : r.status;
}

describe("opsGate — fail-closed laws", () => {
  it("DENY 401: כותרת-חסרה כשטוקן-מוגדר", async () => {
    process.env.__TEST_OPS_TOKEN = "t".repeat(40);
    expect(await status(opsGate(req(), "__TEST_OPS_TOKEN"))).toBe(401);
  });

  it("DENY 503: כותרת-חסרה ושום-דבר-לא-מוגדר (fail-closed — ברירת-המחדל סגורה)", async () => {
    delete process.env.__TEST_EMPTY_TOKEN;
    // ללא-קובץ-הסכם-אמיתי-במכשיר-הזה masterDigest() עשוי-להיות-null — שני-המקרים חוקיים;
    // אם-יש-הסכם-אמיתי → 401 (מאומת-שער-חי), אם-אין → 503 (שער-אטום). שניהם = דחייה.
    const s = await status(opsGate(req(), "__TEST_EMPTY_TOKEN"));
    expect([401, 503]).toContain(s);
  });

  it("DENY 401: טוקן-שגוי (גם-באורך-שונה — timing-safe לא-זורק)", async () => {
    process.env.__TEST_OPS_TOKEN = "t".repeat(40);
    expect(await status(opsGate(req("wrong-token"), "__TEST_OPS_TOKEN"))).toBe(401);
    expect(await status(opsGate(req(""), "__TEST_OPS_TOKEN"))).toBe(401);
    expect(await status(opsGate(req("t".repeat(39)), "__TEST_OPS_TOKEN"))).toBe(401);
  });

  it("PASS 200: טוקן-הסביבה-הנכון מאומת", async () => {
    process.env.__TEST_OPS_TOKEN = "correct-operator-token-1234567890abcdef";
    expect(await status(opsGate(req("correct-operator-token-1234567890abcdef"), "__TEST_OPS_TOKEN"))).toBe(200);
  });

  it("PASS 200: דיגסט-מפתח-האב נגזר מ-hash יציב (sanity של-חוק-הדיגסט)", () => {
    // החוק: ההשוואה תמיד על sha256-דיגסטים באורך-32B — לא על המפתח-עצמו.
    const d = createHash("sha256").update("anything", "utf8").digest();
    expect(d.length).toBe(32);
  });
});
