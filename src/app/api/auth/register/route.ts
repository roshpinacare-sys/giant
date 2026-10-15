/**
 * POST /api/auth/register — רישום-אמיתי (T74 · הצי-הוא-הלקוח-הראשון)
 *
 * גוף: { email, password, name?, crewId? }
 *  · crewId רשות — אם-נשלח, מאומת-מול-רישום-הצי-החי (Domain/agents/registry.json); מזהה-זר נדחה.
 *  · scrypt מקומי · אפס-תלות-חוץ · סשן-מיידי-בקוקי-HttpOnly.
 * fail-honest: 400-אימות · 409-אימייל-קיים · 503-רישום-הצי-לא-נקרא.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE, createSession, crewIdExists, hashPassword,
  sessionCookieOptions, validateEmail,
} from "@/lib/sovereign-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  crewId?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "גוף-הבקשה-לא-JSON-תקין" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : null;
  const crewId = typeof body.crewId === "string" && body.crewId.trim() ? body.crewId.trim().slice(0, 60) : null;

  if (!validateEmail(email)) {
    return NextResponse.json({ ok: false, error: "אימייל-לא-תקין" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "סיסמה-קצרה-מדי — מינימום 8 תווים" }, { status: 400 });
  }

  if (crewId) {
    const exists = await crewIdExists(crewId);
    if (exists === null) {
      return NextResponse.json(
        { ok: false, error: "רישום-הצי לא נקרא כרגע — הצב-סוכן-רק-כשהרישום-חי, או-הירשם-בלי-מזהה" },
        { status: 503 },
      );
    }
    if (!exists) {
      return NextResponse.json(
        { ok: false, error: "מזהה-הסוכן לא נמצא ברישום-הצי-החי — אפס-זיוף-זהות" },
        { status: 400 },
      );
    }
  }

  const dup = await db.user.findUnique({ where: { email } });
  if (dup) {
    return NextResponse.json({ ok: false, error: "האימייל כבר רשום — היכנס-או-בחר-אחר" }, { status: 409 });
  }

  const user = await db.user.create({
    data: { email, name, crewId, passwordHash: hashPassword(password) },
  });

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, crewId: user.crewId },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
