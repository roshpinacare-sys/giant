// giant · שער-הבעלים: POST (כניסה עם מפתח-headcorner) · GET (בדיקת-הפעלה) · DELETE (יציאה)
// המפתח לעולם לא נרשם בשום לוג. כישלון = 401 כנה.

import { NextResponse } from "next/server";
import {
  OWNER_COOKIE,
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
    return NextResponse.json(
      { owner: false, error: "מפתח-הבעלים אינו תקין" },
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
