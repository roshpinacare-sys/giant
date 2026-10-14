// POST /api/giant/channel/directive — הבעלים מצווה כאן (חוק-הערוץ)
// ══════════════════════════════════════════════════════════════════════════
// מושתל מ-giant/app (אותו חוזה: title + items[] + law?, מפתח-מנהל → D-NNNN
// append-only בזרם-ההוראות הקנוני) — עם-התאמה-אחת למופע-החי: הכתיבה עצמה
// עוברת דרך writeOwnerDirective (lib/sovereign/channel) — נתיב-הכתיבה
// הקנוני שכבר-רץ כאן (Pulse/state/sovereign-channel/directives.jsonl +
// דחיפת-גיט + קבלה לתיבת-המפעיל). אין משטח-ערוץ-שני ואין עותק-זרם נפרד:
// אותו-קובץ קנוני, אותו-PAT שרת-בלבד, אפס-כתיבת-סוכן.
// אפס-הצלחה-כוזבת: כשל-מדידה חוזר ככשל, מצב-הדחיפה מדווח בכנות.
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/office-operator";
import { writeOwnerDirective } from "@/lib/sovereign/channel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1) שער-הבעלים — אפס-כתיבה-בלי-סשן-מאומת (אותו-שער של עמדת-המפעיל)
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!verifySession(token)) {
    return NextResponse.json(
      { ok: false, note: "נדרש אימות מפתח-מנהל — אף כתיבה בלעדיו" },
      { status: 401 },
    );
  }

  // 2) קלט-מאומת (חוזה-giant/app: title + items[] + law?)
  let title = "";
  let items: string[] = [];
  let law: string | null = null;
  try {
    const body = (await req.json()) as { title?: unknown; items?: unknown; law?: unknown };
    if (typeof body.title === "string") title = body.title.trim();
    if (Array.isArray(body.items)) items = body.items.map((s) => String(s).trim()).filter(Boolean);
    if (typeof body.law === "string" && body.law.trim()) law = body.law.trim().slice(0, 160);
  } catch {
    return NextResponse.json({ ok: false, note: "קלט פגום" }, { status: 400 });
  }
  if (title.length < 3 || title.length > 160) {
    return NextResponse.json({ ok: false, note: "כותרת: 3–160 תווים" }, { status: 400 });
  }
  if (items.length < 1 || items.length > 12 || items.some((s) => s.length < 3 || s.length > 600)) {
    return NextResponse.json({ ok: false, note: "סעיפי-הוראה: 1–12 שורות, 3–600 תווים לשורה" }, { status: 400 });
  }

  // 3) הכתיבה הקנונית — D-NNNN append-only אל הזרם + קבלת-עבודה לתיבת-המפעיל
  //    + דחיפת-גיט מאומתת (PAT נקרא בתוך הספריה, לעולם לא נחשף/נרשם)
  const res = await writeOwnerDirective({ title, points: items, ...(law ? { law } : {}) });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, note: `ההוראה לא נשמרה (${res.error ?? "write-failed"}) — אפס-הצלחה-כוזבת` },
      { status: 502 },
    );
  }

  // 4) כנות-מלאה: id + קומיט + טביעת-השורה — מצב-הדחיפה מדווח כמו-שהוא
  const pushed = Boolean(res.push?.pushed && res.push?.verified);
  const note = pushed
    ? `${res.id} אוטם בזרם-ההוראות הקנוני ונדחף לגיט (commit ${res.push?.commit ?? "?"}) — חוק-בנחיתה`
    : `${res.id} נשמר בזרם הקנוני המקומי; הדחיפה תרכב על הקומיט הבא (${res.push?.error ?? "לא-נדחף"}) · קבלת-עבודה: ${res.inboxId ? "נרשמה" : "לא-נרשמה"}`;

  return NextResponse.json(
    {
      ok: true,
      id: res.id,
      commitSha: res.push?.commit ?? null,
      pushed,
      digest: res.sha16,
      note,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
