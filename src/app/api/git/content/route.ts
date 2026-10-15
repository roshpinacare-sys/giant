// giant · קריאת-קובץ-מהגיט (מאובטחת: ריפו-מותר, אין-טרוורסל, איסור-סודות, תקרת-קריאה)

import { NextResponse } from "next/server";
import { readRepoFile } from "@/lib/git-content";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? "";
  const rel = url.searchParams.get("path") ?? "";
  if (!repo || !rel) {
    return NextResponse.json({ ok: false, error: "חסר repo או path" }, { status: 400 });
  }
  try {
    const result = await readRepoFile(repo, rel);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "קובץ-לא-זמין (לא-קיים-או-אסור)" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[git/content]", err);
    return NextResponse.json({ ok: false, error: "נכשלה-קריאת-הקובץ" }, { status: 500 });
  }
}
