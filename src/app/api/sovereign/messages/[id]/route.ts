// ערוץ-הריבון — PATCH: סימון-נקרא / הכרעת-בעלים (אישור|דחייה) על בקשות-מימון והכרעות
// הכרעה מייצרת אישור-קבלה קצר של הריבונות (דטרמיניסטי, ללא LLM).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isOwner } from "@/lib/sovereign-auth";

export const dynamic = "force-dynamic";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }),
  z.object({
    action: z.literal("decide"),
    requestStatus: z.enum(["APPROVED", "DECLINED"]),
  }),
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף-הבקשה-אינו-JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "בקשה-לא-תקינה" }, { status: 400 });
  }

  // שער-הבעלים: סימון/הכרעה הן פעולות-ניהול-בעלים (חוק-הפרונט/הבק)
  if (!(await isOwner())) {
    return NextResponse.json(
      { error: "פעולת-בעלים דורשת מפתח headcorner" },
      { status: 401 },
    );
  }

  try {
    const message = await db.sovereignMessage.findUnique({ where: { id } });
    if (!message) {
      return NextResponse.json({ error: "הודעה-לא-נמצאה" }, { status: 404 });
    }

    if (parsed.data.action === "read") {
      if (message.status !== "UNREAD") {
        return NextResponse.json({ message });
      }
      const updated = await db.sovereignMessage.update({
        where: { id },
        data: { status: "READ" },
      });
      return NextResponse.json({ message: updated });
    }

    // action === 'decide'
    if (message.kind !== "FUNDING" && message.kind !== "DECISION") {
      return NextResponse.json(
        { error: "ניתן-להכריע-רק-על בקשות-מימון והכרעות" },
        { status: 409 },
      );
    }
    if (message.requestStatus !== "PENDING") {
      return NextResponse.json(
        { error: "ההכרעה-כבר-נסגרה", message },
        { status: 409 },
      );
    }

    const approved = parsed.data.requestStatus === "APPROVED";
    const amountPart =
      typeof message.amount === "number" && message.currency
        ? ` (${new Intl.NumberFormat("he-IL").format(message.amount)} ${message.currency})`
        : "";
    const ackBody = approved
      ? `הבעלים אישר: "${message.subject}"${amountPart}. הריבונות פועלת בהתאם — ההכרעה נרשמה וניישמת בסדר-היום המבצעי.`
      : `הבעלים דחה: "${message.subject}". הריבונות פועלת בהתאם — הנושא מושהה ויוצג שוב רק עם נתיב חלופי נתמך-נתונים.`;

    const [updated, ack] = await db.$transaction([
      db.sovereignMessage.update({
        where: { id },
        data: { requestStatus: parsed.data.requestStatus, status: "READ" },
      }),
      db.sovereignMessage.create({
        data: {
          from: "SOVEREIGNTY",
          kind: "REPORT",
          priority: approved ? "NORMAL" : "HIGH",
          subject: "רישום-הכרעה",
          body: ackBody,
          status: "UNREAD",
          meta: JSON.stringify({ decidedOn: message.id, decision: parsed.data.requestStatus }),
          repliedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ message: updated, ack });
  } catch (err) {
    console.error("[sovereign/messages/:id PATCH]", err);
    return NextResponse.json({ error: "נכשל-עדכון-ההודעה" }, { status: 500 });
  }
}
