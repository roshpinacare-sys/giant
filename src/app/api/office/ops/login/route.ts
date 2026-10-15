// POST /api/office/ops/login — שער-המפעיל: מפתח-אחד (הסכם-מפתח-האב, Task 69).
// אפס-חשיפה: המפתח לעולם לא נרשם ביומן/לוג/תשובה; תשובה-כללית על כל כשל
// (אין רמז אם המפתח קיים); rate-limit 5/15 דק' ל-IP (חוק operator/server).
import { NextResponse } from "next/server";
import { isOperatorKey, operatorGateConfigured, rateLimit, signSession } from "@/lib/office-operator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();

  if (!operatorGateConfigured()) {
    return NextResponse.json(
      { ok: false, error: "gate-unconfigured", note: "שער-המפעיל fail-closed — אין דיגסטים בסביבה" },
      { status: 503 },
    );
  }

  const rl = rateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate-limited", note: `יותר מדי ניסיונות — נסה שוב בעוד ${Math.ceil(rl.retryAfterSec / 60)} דק'` },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    if (typeof body.key === "string") key = body.key;
  } catch {
    return NextResponse.json({ ok: false, error: "auth-failed" }, { status: 401 });
  }

  // השדה מתרוקן בזיכרון מיד — ההשוואה היחידה שנעשית היא כאן
  const ok = key.length > 0 && isOperatorKey(key);
  key = "";

  if (!ok) {
    return NextResponse.json({ ok: false, error: "auth-failed", note: "מפתח לא מאומת — שום דבר לא נשמר" }, { status: 401 });
  }

  const { token, expiresIn } = signSession();
  return NextResponse.json(
    { ok: true, token, expiresIn, label: "מפעיל" },
    { headers: { "cache-control": "no-store" } },
  );
}
