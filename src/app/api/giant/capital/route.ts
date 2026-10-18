// GET /api/giant/capital — מנוע-ההון הריבוני · שבע-אסטרטגיות נמדדות-חי
// ═══════════════════════════════════════════════════════════════════════════
// Steem-RPC-ציבורי + CoinGecko + קבצי-אמת מקומיים (estate/Domain) — אפס-סודות,
// אפס-שחזור-מספרים-ישנים (חוק-הבעלים: הגיט הוא שכבת-הקיום · מדידה-קודמת-לטענה).
// תוכניות-הצבה/הדלגציה = מסמכים-בלבד (approved:false מוצק) — אין-נתיב-ביצוע.
// cache 60 שניות כמו כל-דלת-כלכלית.
import { NextResponse } from "next/server";
import { measureCapital } from "@/lib/giant/capital";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: Awaited<ReturnType<typeof measureCapital>> } | null = null;
const CACHE_MS = 60_000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }
    const data = await measureCapital();
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        note: `כשל-מנוע-ההון-כנה: ${e instanceof Error ? e.message : "unknown"}`,
        measuredAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
