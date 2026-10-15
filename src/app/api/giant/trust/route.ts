// GET /api/giant/trust — מפת-האמון של הצי (GIANT wave-5)
// ═════════════════════════════════════════════════════════════════════════
// סריקת-אמון מדודה על כל-הספרים של roshpinacare-sys (דפוס dsh-trust-check):
// · עץ-גיט לכל-ספר → capabilities + signals + redLines — חשיפה, לעולם לא פסק-דין.
// · ?deep=<repo> → סריקת-תוכן נקודתית (≤12 קבצים × ≤24KB), מדווח file:line בלבד,
//   אפס-תוכן-סודות (חוק-strix: שמות ומספרים, לעולם לא גוף-הסוד).
// · כשל = unscanned עם-השגיאה-עצמה — "לא נבדק" לעולם לא מתחפש ל"נקי".
import { NextResponse } from "next/server";
import { runTrustScan, deepScanRepo } from "@/lib/giant/trust-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep");
  try {
    if (deep !== null && deep.length > 0) {
      const payload = await runTrustScan(false);
      const row = payload.rows.find((r) => r.name === deep);
      if (!row) {
        return NextResponse.json(
          { ok: false, note: `הספר ${deep} לא נמצא בצי — לא נבדק (כנה)` },
          { status: 404, headers: { "cache-control": "no-store" } },
        );
      }
      const scan = await deepScanRepo(deep, row.signals, row.branch);
      return NextResponse.json({ ok: true, repo: deep, scan }, { headers: { "cache-control": "no-store" } });
    }
    const force = url.searchParams.get("force") === "1";
    const payload = await runTrustScan(force);
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, note: `כשל-סריקה-כנה: ${e instanceof Error ? e.message : "לא-ידוע"}`, rows: [] },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
