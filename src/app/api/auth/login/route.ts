/**
 * POST /api/auth/login — כניסה-אמיתית (T74)
 * הודעת-שגיאה-גנרית-כנה על-כל-כשל (לא-חושפת-איזה-שדה-דודד).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession, sessionCookieOptions, verifyPassword } from "@/lib/sovereign-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "גוף-הבקשה-לא-JSON-תקין" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "נדרשים אימייל וסיסמה" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  const okUser = user && verifyPassword(password, user.passwordHash);
  if (!okUser || !user) {
    return NextResponse.json({ ok: false, error: "אימייל או סיסמה שגויים" }, { status: 401 });
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, crewId: user.crewId },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
