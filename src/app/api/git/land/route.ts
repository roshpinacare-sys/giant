// giant · נחיתת-הוראת-בעלים לקו-הבליעה-הקנוני בגיט (inbox.jsonl → commit → push)
// שער-headcorner חובה (חוק-הפרונט/הבק). כנות-מלאה: pushed אמת או כישלון-מפורש.

import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerReq } from "@/lib/sovereign-auth";
import { landOwnerDirective } from "@/lib/giant-git";

export const dynamic = "force-dynamic";

const landSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json(
      { error: "נחיתת-הוראות דורשת מפתח-בעלים (headcorner)" },
      { status: 401 },
    );
  }
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף-הבקשה אינו JSON" }, { status: 400 });
  }
  const parsed = landSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "בקשה-לא-תקינה" }, { status: 400 });
  }
  const result = await landOwnerDirective(parsed.data.text);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
