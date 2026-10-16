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

/* ── הגנת-ברוטפורס (גל-61 · ביקורת-אבטחה) ─────────────────────────────
 * לפני-כן: שער-הבעלים-קיבל-ניסיונות-בלתי-מוגבלים — והינט-האבחון-חשף-את
 * אורך-המפתח-לכל-בודק (אורקל). החוק-החדש: 5-כשלים-בטווח-10-דק → 429
 * עם-התקררות-אקספוננציאלית (2^כשלים-דק, תקרה-60). הצלחה-מאפסת.
 * בזיכרון-השרת (מופע-יחיד) — כנה-ומדוד: ריסטרט-מנקה (המפתח-ארוך-דיו). */
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_THRESHOLD = 5;
const failMap = new Map<string, { count: number; firstAt: number; lastAt: number }>();

function attemptKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || "").trim() || "local";
}

function tooManyAttempts(key: string): { blocked: boolean; retrySec: number } {
  const e = failMap.get(key);
  if (!e) return { blocked: false, retrySec: 0 };
  const now = Date.now();
  if (now - e.firstAt > FAIL_WINDOW_MS) {
    failMap.delete(key);
    return { blocked: false, retrySec: 0 };
  }
  if (e.count < FAIL_THRESHOLD) return { blocked: false, retrySec: 0 };
  const cooldownMs = Math.min(60, 2 ** Math.min(6, e.count - FAIL_THRESHOLD + 1)) * 60 * 1000;
  const sinceLast = now - e.lastAt;
  if (sinceLast < cooldownMs) {
    return { blocked: true, retrySec: Math.ceil((cooldownMs - sinceLast) / 1000) };
  }
  return { blocked: false, retrySec: 0 };
}

function recordFailure(key: string): void {
  const now = Date.now();
  const e = failMap.get(key);
  if (!e || now - e.firstAt > FAIL_WINDOW_MS) {
    failMap.set(key, { count: 1, firstAt: now, lastAt: now });
  } else {
    e.count += 1;
    e.lastAt = now;
  }
}

function recordSuccess(key: string): void {
  failMap.delete(key);
}

export async function GET(req: Request) {
  const owner = (await isOwnerReq(req)) || (await isOwner());
  return NextResponse.json({ owner });
}

export async function POST(req: Request) {
  const aKey = attemptKey(req);
  const gate = tooManyAttempts(aKey);
  if (gate.blocked) {
    return NextResponse.json(
      { owner: false, error: `יותר-מדי-ניסיונות-כושלים — השער-נעול-זמנית · נסה-שוב-בעוד ${gate.retrySec} שניות` },
      { status: 429, headers: { "retry-after": String(gate.retrySec) } },
    );
  }
  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // גוף-לא-תקין = מפתח-ריק → 401
  }
  if (!(await verifyHeadcorner(password))) {
    recordFailure(aKey);
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
  recordSuccess(aKey);
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
