/**
 * GET /api/auth/me — מי-הסשן-הנוכחי (fail-honest: אין-סשן = user:null, אף-משתמש-מזויף לא ייוולד)
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sovereign-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ ok: true, user });
}
