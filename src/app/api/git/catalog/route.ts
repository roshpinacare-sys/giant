// giant · קטלוג-התוכן-הטוב-מכל-התיקיות (גיט→מוצר)

import { NextResponse } from "next/server";
import { buildCatalog } from "@/lib/git-content";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sections = await buildCatalog();
    const totalFiles = sections.reduce((n, s) => n + s.files.length, 0);
    return NextResponse.json({ ok: true, sections, totalFiles });
  } catch (err) {
    console.error("[git/catalog]", err);
    return NextResponse.json({ ok: false, error: "נכשלה-בניית-הקטלוג" }, { status: 500 });
  }
}
