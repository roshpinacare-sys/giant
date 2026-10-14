// giant · שער-הבעלים (headcorner) — חוק-הפרונט/הבק מ-giant/SPEC-CHANNEL.md
// הסוד נקרא server-side מ-upload/headcorner.txt בלבד; אף-פעם לא בלוג, לא בפלט, לא בגיט.

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";

const HEAD_PATH = "/home/z/my-project/upload/headcorner.txt";
export const OWNER_COOKIE = "giant_owner";

async function headcornerSecret(): Promise<string> {
  return (await readFile(HEAD_PATH, "utf8")).trim();
}

// נרמול-דו-צדדי: הסוד-בקובץ עשוי-להכיל-רווחים/שורות; הבעלים-מקליד-בכל-סגנון.
// שני-הצדדים עוברים את-אותה-פונקציה — אין-פגיעה-בהשוואה, יש-סבילות-הקלדה.
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// אסימון-הפעלה נגזר (לא הסוד עצמו) — עוגיית-HttpOnly בלבד
export async function ownerSessionToken(): Promise<string> {
  const secret = await headcornerSecret();
  return createHash("sha256")
    .update(`giant-owner-v1:${normalizeKey(secret)}`)
    .digest("hex");
}

// השוואה timing-safe דרך hash — הסוד והקלט לעולם לא נרשמים
export async function verifyHeadcorner(input: string): Promise<boolean> {
  try {
    const secret = await headcornerSecret();
    if (!secret || !input) return false;
    const a = createHash("sha256").update(normalizeKey(input)).digest();
    const b = createHash("sha256").update(normalizeKey(secret)).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// בדיקת-הרשאת-בעלים לפי עוגייה חתומה
export async function isOwner(): Promise<boolean> {
  try {
    const store = await cookies();
    const value = store.get(OWNER_COOKIE)?.value;
    if (!value) return false;
    const expected = await ownerSessionToken();
    return (
      value.length === expected.length &&
      timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}

// בדיקת-הרשאה עם תמיכת-iframe: קובץ-עוגיות נחסם בתצוגה-מקדימה-מוטמעת,
// לכן הפרונט שולח את אסימון-ההפעלה הנגזר בכותרת x-giant-owner.
// האסימון אינו הסוד — הוא SHA-256 נגזר ממנו ואינו חושף דבר.
export async function isOwnerReq(req: Request): Promise<boolean> {
  try {
    const header = req.headers.get("x-giant-owner");
    if (header) {
      const expected = await ownerSessionToken();
      if (
        header.length === expected.length &&
        timingSafeEqual(Buffer.from(header), Buffer.from(expected))
      ) {
        return true;
      }
    }
  } catch {
    // נופל-לבדיקת-העוגייה
  }
  return isOwner();
}
