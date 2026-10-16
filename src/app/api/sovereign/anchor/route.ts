// giant · שער-עוגן-ההישרדות — מדידת-עגינה-חיה (GET) ועגינה-בפועל (POST)
// שעור-בעלים בלבד: העגינה-מזיזה-את-הזיכרון-הריבוני-בענן.
// הפאט-נשאר-בשרת; אין-בתשובה-אף-סוד-ואף-URL-מאומת.

import { NextResponse } from "next/server";
import { anchorStatus, performAnchor } from "@/lib/anchor";
import { isOwnerReq } from "@/lib/sovereign-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json({ ok: false, error: "401-בעלים-בלבד" }, { status: 401 });
  }
  const status = await anchorStatus(true); // force — הבעלים-מבקש-אמת-חיה
  return NextResponse.json(status, { status: status.ok ? 200 : 502 });
}

export async function POST(req: Request) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json({ ok: false, error: "401-בעלים-בלבד" }, { status: 401 });
  }
  const res = await performAnchor();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
  }
  const status = await anchorStatus(true);
  return NextResponse.json({ ok: true, anchorSha: res.anchorSha, lineageHead: res.lineageHead, status });
}
