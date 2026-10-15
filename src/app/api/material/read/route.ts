// /api/material/read?repo=t36/Sandbox&rel=giant/MERGE-AGREEMENT.md
// קריאת-מסמך-בודד-חיה-מהגיט → מסך. חסימות: רק-md, נתיבים-רגישים, תקרת-גודל,
// והצנחת-טוקנים-בהגנה-רבת-שכבות (גם-אם-מסמך-חמק-לתיקייה-חסויה).

import { NextRequest, NextResponse } from "next/server";
import { readMaterialDoc } from "@/lib/material-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get("repo") ?? "";
  const rel = req.nextUrl.searchParams.get("rel") ?? "";
  if (!repo || !rel) {
    return NextResponse.json({ ok: false, error: "repo-ו-rel-נדרשים" }, { status: 400 });
  }
  const res = await readMaterialDoc(repo, rel);
  if (!res.ok) {
    return NextResponse.json(res, { status: 404 });
  }
  return NextResponse.json(res, { headers: { "cache-control": "no-store" } });
}
