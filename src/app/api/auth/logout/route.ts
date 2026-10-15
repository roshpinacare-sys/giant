/**
 * POST /api/auth/logout — יציאה-אמיתית: מחיקת-הסשן-מהבסיס + ניקוי-הקוקי
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE, destroySession } from "@/lib/sovereign-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return res;
}
