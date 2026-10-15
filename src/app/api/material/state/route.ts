// /api/material/state — אינדקס-החומר-החי מכל-תיקיות-הגיט (ציבורי: מטא-בלבד)
// תשובה: ספירות, קטגוריות, ריפו-ים, מסמכי-giant, ואינדקס-מלא-לחיפוש-לקוח.

import { NextResponse } from "next/server";
import { materialIndex } from "@/lib/material-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const index = await materialIndex();
  return NextResponse.json(
    {
      ok: true,
      totals: index.totals,
      byCategory: index.byCategory,
      byRepo: index.byRepo,
      giantDocs: index.giantDocs.map((d) => ({
        id: d.id,
        repo: d.repo,
        relPath: d.relPath,
        title: d.title,
        bytes: d.bytes,
      })),
      docs: index.docs,
      scannedAt: index.scannedAt,
      rootsScanned: index.rootsScanned,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
