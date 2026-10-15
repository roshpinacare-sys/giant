// giant · שער-הבעלים (headcorner) — חוק-הפרונט/הבק מ-giant/SPEC-CHANNEL.md
// הסוד נקרא server-side מ-upload/headcorner.txt בלבד; אף-פעם לא בלוג, לא בפלט, לא בגיט.

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";

const HEAD_PATH = "/home/z/my-project/upload/headcorner.txt";
export const OWNER_COOKIE = "giant_owner";

async function headcornerSecret(): Promise<string> {
  // פורמט-הקובץ (מאומת-מול t35/saos-dex/scripts/verify-headcorner-key.ts):
  //   שורה-0 = שם-החשבון/תווית ("headcorner")
  //   שורה-1 = המפתח-עצמו
  // לעולם-לא-קוראים-את-הקובץ-כולו-כסוד — התווית-הייתה-נדבקת-למפתח
  // והמפתח-האמיתי-של-הבעלים-מעולם-לא-היה-מתאים.
  const raw = await readFile(HEAD_PATH, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  // ריבוי-שורות: משליכים-את-שורת-התווית ולוקחים-את-השורה-הארוכה-שנותרה (המפתח)
  const candidates = lines.filter((l) => l.toLowerCase() !== "headcorner");
  const pool = candidates.length > 0 ? candidates : lines;
  return pool.reduce((a, b) => (b.length > a.length ? b : a));
}

// נרמול-דו-צדדי: הסוד-בקובץ עשוי-להכיל-רווחים/שורות; הבעלים-מקליד-בכל-סגנון.
// שני-הצדדים עוברים את-אותה-פונקציה — אין-פגיעה-בהשוואה, יש-סבילות-הקלדה.
// בעלים-מעתיק-מצ'אט-עברי: תווי-רוחב-אפס, מיון-bidi, מרכאות-מעוקלות, גרשיים-מהדגשת-קוד,
// ותווי-וריאציה-נכנסים-בלי-ראייה — נסלקים-כאן.
// (זו-סבילות-העתקה, לא-החלשה: המפתח-מכיל-רק a-z0-9 — תו-פיסוק-בקלט-לעולם-לא-חלק-ממנו,
// ולכן-השמטתו-אינה-מקבלת-מפתח-שגוי; התווים-האמיתיים-נדרשים-במלואם-ובסדרם.)
function normalizeKey(s: string): string {
  return s
    .replace(
      /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u180E\uFE00-\uFE0F\uFEFF\u00AD\u2018-\u201F\u0060\u0027\u0022]/g,
      "",
    )
    .toLowerCase()
    .replace(/\s+/g, "");
}

// אבחון-דחייה-כנה: מה-ניתן-לומר-על-הקלט-בלי-לחשוף-את-הסוד.
// מציג-רק-תכונות-של-הקלט-עצמו (לא-של-הסוד): האם-זוהו-אותיות-עבריות,
// וכמה-תווים-תקפים-נותרו-אחרי-נרמול (הבעלים-יודע-את-אורך-המפתח-שלו).
export function diagnoseKeyInput(input: string): {
  hebrewLayout: boolean;
  normLen: number;
} {
  const hebrewLayout = /[\u0590-\u05FF]/.test(input);
  return { hebrewLayout, normLen: normalizeKey(input).length };
}

// אורך-המפתח-הפעיל-אחרי-נרמול — לאבחון-דחייה.
// הבעלים-מחזיק-בקובץ-המפתח-עצמו, ולכן-האורך-אינו-מידע-חדש-עבורו;
// ההשוואה-מאפשרת-לו-לזהות-מיד-עותק-חתוך/מוגדל/מוחלף-סדר.
export async function expectedKeyLength(): Promise<number> {
  try {
    const secret = await headcornerSecret();
    return normalizeKey(secret).length;
  } catch {
    return 0;
  }
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
//
// מיזוג-גיאנט (המיזוג-האמיתי): גשר-אסימונים. הממשק-המאוחד מנפיק אסימוני-שער
// (/api/sovereign/gate — זיכרון-בלבד, 10 דק) — הם גם פותחים את APIs-הבעלים כאן.
// שתי-מערכות-אסימון, בעלים-אחד. אין-ייבוא-מעגלי: gate.ts לא מייבא מכאן.
import { verifyToken } from "@/lib/sovereign/gate";

export async function isOwnerReq(req: Request): Promise<boolean> {
  try {
    const header = req.headers.get("x-giant-owner");
    if (header) {
      // 1) אסימון-שער של הממשק-המאוחד (מיזוג-גיאנט)
      if (verifyToken(header)) return true;
      // 2) אסימון-הפעלה נגזר מהמפתח (קו-המקור)
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
