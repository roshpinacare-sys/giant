/**
 * POST /api/sovereign/gate — the owner's gate (מפתח-מנהל → session token).
 * Mirrors FleetHQ unlock: key compared against a salted sha256 hash stored OUTSIDE
 * all repos (/home/z/.operator/config.json); never logged/echoed/persisted;
 * rate-limited 5/min per process; memory-only session token (10 min TTL).
 * Every owner write in the channel requires this gate. No agent writes in the owner's name.
 *
 * מיזוג-גיאנט (המיזוג-האמיתי): השער-האחד-של-הבעלים. שתי-אמתות, לא-שני-שערים:
 *  1. דיגסטים-רשומים מחוץ-לריפו (/home/z/.operator/config.json) — דוקטרינת-הצי.
 *  2. קובץ-המפתח-החי של הבעלים (upload/headcorner.txt, לא-נעקב-בגיט) — אמת-המכונה.
 *     קריאת-שורת-המפתח-בלבד (שורה-0=תווית, שורה-1=מפתח — התיקון-השורשי 2065ae8)
 *     + נרמול-סבילות-העתקה מלא (מרכאות/רווחים/שורות/bidi/zero-width/רישיות).
 * אבחון-דחייה-כנה: השער מסביר מה שגוי בלי לחשוף דבר על הסוד.
 */
import { NextResponse } from "next/server";
import { checkKey, issueToken, ensureGateTruths } from "@/lib/sovereign/gate";
import { verifyHeadcorner, diagnoseKeyInput, expectedKeyLength } from "@/lib/sovereign-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* per-process 5/min window (attempts counted, never stored) */
let _windowStart = Date.now();
let _attempts = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - _windowStart > 60_000) {
    _windowStart = now;
    _attempts = 0;
  }
  _attempts += 1;
  return _attempts > 5;
}

/* אבחון-דחייה-כנה — תכונות-הקלט-בלבד, אפס-חשיפת-סוד */
async function rejectReason(key: string): Promise<string> {
  const { hebrewLayout, normLen } = diagnoseKeyInput(key);
  const expected = await expectedKeyLength();
  if (hebrewLayout) return "זוהתה מקלדת עברית — העבר לאנגלית והדבק שוב";
  if (normLen === 0) return "הקלט ריק — הדבק את מפתח-הבעלים";
  if (expected > 0 && normLen < expected) return `המפתח חתוך — התקבלו ${normLen} מתוך ${expected} (העתק את השורה כולה)`;
  if (expected > 0 && normLen > expected) return `המפתח מוגדל — התקבלו ${normLen} תווים במקום ${expected} (בדוק שורות-נוספות שנדבקו)`;
  if (expected > 0 && normLen === expected) return "האורך נכון אך התווים שונים — ייתכן סדר-מוחלף (היפוך-bidi) או עותק-חלקי; העתק מקובץ-המקור";
  return "מפתח לא מאומת";
}

export async function POST(req: Request) {
  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    if (typeof body.key === "string") key = body.key;
  } catch {
    // fallthrough → generic failure below
  }

  if (!key || key.length > 256) {
    return NextResponse.json(
      { ok: false, error: "invalid", reason: key ? rejectReasonSync(key) : "הקלט ריק — הדבק את מפתח-הבעלים" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  if (rateLimited()) {
    return NextResponse.json({ ok: false, error: "too-many-attempts" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  /* שתי-האמתות של השער-האחד (מיזוג-גיאנט): דיגסטים-מחוץ-לריפו וגם קובץ-המפתח-החי
   * Task 18: לפני-הפסיקה — ריפוי-עצמי (אחרי-קציר-סנדבוקס שני-קבצי-האמת נעלמים) */
  await ensureGateTruths();
  const ok = (await checkKey(key)) || (await verifyHeadcorner(key));
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "invalid", reason: await rejectReason(key) },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const { token, ttlMs } = issueToken();
  return NextResponse.json({ ok: true, token, ttlMs, label: "owner" }, { headers: { "cache-control": "no-store" } });
}

/* ניתוח-מהיר בלי-I/O עבור-קלט-ארוך-מדי (לא-אמור-לקרות עם-מפתח-אמת) */
function rejectReasonSync(key: string): string {
  const { hebrewLayout, normLen } = diagnoseKeyInput(key);
  if (hebrewLayout) return "זוהתה מקלדת עברית — העבר לאנגלית והדבק שוב";
  if (normLen === 0) return "הקלט ריק — הדבק את מפתח-הבעלים";
  return "קלט-חריג באורך — העתק את מפתח-הבעלים מקובץ-המקור";
}
