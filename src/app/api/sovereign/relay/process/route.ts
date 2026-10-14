// ערוץ-הריבון — עיבוד-תור-הטענות הפנימי: טענות-סוכנים → עמדת-ריבונות אחת מרוכזת
// חוק-1: הטענות עצמן לעולם אינן עולות לבעלים — רק עמדת הריבונות.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateSovereignPosition } from "@/lib/sovereign-llm";
import { isOwner } from "@/lib/sovereign-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  // שער-הבעלים: עיבוד-התור-הפנימי הוא פעולת-ניהול (חוק-הפרונט/הבק)
  if (!(await isOwner())) {
    return NextResponse.json(
      { error: "עיבוד-התור-הפנימי דורש מפתח headcorner" },
      { status: 401 },
    );
  }
  try {
    const claims = await db.sovereignMessage.findMany({
      where: { from: "AGENT_RELAY", relayProcessed: false },
      orderBy: { createdAt: "asc" },
    });
    if (claims.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const result = await generateSovereignPosition(
      claims.map((c) => ({ id: c.id, subject: c.subject, body: c.body })),
    );

    const [, count] = await db.$transaction([
      db.sovereignMessage.create({
        data: {
          from: "SOVEREIGNTY",
          kind: "REPORT",
          priority: "NORMAL",
          subject: "עמדת הריבונות על טענות הסוכנים",
          body: result.text,
          status: "UNREAD",
          meta: JSON.stringify({
            llmError: result.llmError,
            sources: claims.map((c) => c.id),
          }),
          repliedAt: new Date(),
        },
      }),
      db.sovereignMessage.updateMany({
        where: { id: { in: claims.map((c) => c.id) } },
        data: { relayProcessed: true },
      }),
    ]);

    return NextResponse.json({ processed: count.count });
  } catch (err) {
    console.error("[sovereign/relay/process POST]", err);
    return NextResponse.json({ error: "נכשל-עיבוד-תור-הטענות" }, { status: 500 });
  }
}
