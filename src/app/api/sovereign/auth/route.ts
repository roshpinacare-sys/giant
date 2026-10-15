// giant · שער-הבעלים: POST (כניסה עם מפתח-headcorner) · GET (בדיקת-הפעלה) · DELETE (יציאה)
// המפתח לעולם לא נרשם בשום לוג. כישלון = 401 כנה.

import { NextResponse } from "next/server";
import {
  OWNER_COOKIE,
  diagnoseKeyInput,
  expectedKeyLength,
  isOwner,
  isOwnerReq,
  ownerSessionToken,
  verifyHeadcorner,
} from "@/lib/sovereign-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = (await isOwnerReq(req)) || (await isOwner());
  return NextResponse.json({ owner });
}

export async function POST(req: Request) {
  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // גוף-לא-תקין = מפתח-ריק → 401
  }
  if (!(await verifyHeadcorner(password))) {
    // דחייה-מאובחנת: רק-תכונות-הקלט-מול-תכונות-המפתח-שבידי-הבעלים-עצמו.
    // הבעלים-מחזיק-בקובץ-המפתח — אורך-המפתח-אינו-חידה-בשבילו; הספירה-עוזרת-לו-לאבחן-חיתוך/היפוך.
    const d = diagnoseKeyInput(password);
    const n = await expectedKeyLength();
    let hint = "המפתח-שונה-מהמפתח-הפעיל";
    if (d.hebrewLayout) {
      hint = `זוהו-אותיות-עבריות-בקלט — המפתח-באנגלית-בלבד: החלף-מקלדת-לאנגלית (התקבלו-${d.normLen}-תווים-תקפים-מתוך-${n})`;
    } else if (d.normLen === 0) {
      hint = "לא-התקבלו-תווים-תקפים — הדבק-את-המפתח-מחדש";
    } else if (d.normLen < n) {
      hint = `העותק-חתוך: התקבלו-${d.normLen}-תווים-מתוך-${n} — העתק-שוב-את-כל-המפתח-עד-הסוף`;
    } else if (d.normLen > n) {
      hint = `העותק-מוסיף-תווים-זרים: התקבלו-${d.normLen}-מתוך-${n} — הדבק-רק-את-המפתח-עצמו`;
    } else {
      hint = `האורך-נכון-(${n})-אך-התווים-שונים-או-בסדר-מוחלף — ייתכן-שההעתקה-מפסקה-עברית-הפכה-את-הסדר: השווה-התחלה-וסוף-מול-קובץ-המפתח-שבידיך`;
    }
    return NextResponse.json(
      { owner: false, error: `מפתח-הבעלים אינו תקין · ${hint}` },
      { status: 401 },
    );
  }
  const token = await ownerSessionToken();
  const res = NextResponse.json({ owner: true, token });
  res.cookies.set(OWNER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ owner: false });
  res.cookies.delete(OWNER_COOKIE);
  return res;
}
