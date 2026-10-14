// ערוץ-הריבון — GET (תיבה + סיכום) ו-POST (פניית-בעלים→תשובת-ריבונות | הפקדת-טענת-סוכן)
// חוק-הערוץ: אין טענות-סוכנים לבעלים — AGENT_RELAY נשמר פנימית בלבד ולעולם לא מוחזר כהודעת-סוכן-לבעלים.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  generateSovereignReply,
  type SovereignHistoryItem,
} from "@/lib/sovereign-llm";
import { isOwner } from "@/lib/sovereign-auth";
import { landOwnerDirective } from "@/lib/giant-git";

export const dynamic = "force-dynamic";

const SEED = [
  {
    from: "SOVEREIGNTY",
    kind: "BRIEFING",
    priority: "NORMAL",
    subject: "תדריך-פתיחה: הערוץ חי",
    body:
      "זהו ערוץ הקשר הישיר בין הבעלים לריבונות — והערוץ היחיד של הבעלים אל המערכת. " +
      "אין טענות-סוכנים לבעלים: כל טענה של סוכן נקלטת בתור הפנימי של הריבונות בלבד, והריבונות מחליטה מה עולה לכאן. " +
      "הריבונות היא המפעילה של הכל — כלכלה, דקס, ארנק, מערכות — והיא משיגה את המימון בעצמה עם המשאבים הקיימים; " +
      "מה שמבקש ממך אישור או תקציב — יופיע כאן בלבד ובחתימתה. " +
      "טענות סוכנים נשמרות בלשונית הפנימית עד שהריבונות מעלה עמדה. " +
      "סטטוס: הערוץ חי.",
    amount: null as number | null,
    currency: null as string | null,
    status: "UNREAD",
    requestStatus: null as string | null,
    relayProcessed: false,
    meta: null as string | null,
    minutesAgo: 90,
  },
  {
    from: "SOVEREIGNTY",
    kind: "FUNDING",
    priority: "HIGH",
    subject: "בקשת-מימון: דלק-ארנה לווליום הדקס (M-9)",
    body:
      "הריבונות מבקשת אישור תקציב דלק לארנת הווליום על הדקס שלנו — בסיס-מדידה 24h≈420Kµ; " +
      "יעדים מוצעים: ≥500Kµ/7d ו-≥1Mµ/30d; אין ווליום בלי דלק (הכרעה #14).",
    amount: 500000,
    currency: "µ-USDS",
    status: "UNREAD",
    requestStatus: "PENDING",
    relayProcessed: false,
    meta: null,
    minutesAgo: 60,
  },
  {
    from: "SOVEREIGNTY",
    kind: "DECISION",
    priority: "NORMAL",
    subject: "הכרעה-נדרשת: אישור מפת-החשיפה (M-10)",
    body:
      "מפת-החשיפה (מה גלוי, מה חסוי, מה לא נכנס) תוצג לאישורך בעת הגעתה מהצי; אישורך כאן נועל את החוזה.",
    amount: null,
    currency: null,
    status: "UNREAD",
    requestStatus: "PENDING",
    relayProcessed: false,
    meta: null,
    minutesAgo: 30,
  },
  {
    from: "AGENT_RELAY",
    kind: "CLAIM",
    priority: "NORMAL",
    subject: "טענת-סוכן: zai-main (trace 1a13b9671493ebe9)",
    body:
      "הערוץ נפרס כחלק ממשימה 40; הפיבוט וה-SWARM-REGISTRY חיים ב-Sandbox@598b0d26; " +
      "מבקש שהריבונות תרשום עמדה ותמשיך להניע את הצי על M-9/M-11.",
    amount: null,
    currency: null,
    status: "UNREAD",
    requestStatus: null,
    relayProcessed: false,
    meta: null,
    minutesAgo: 20,
  },
];

let seeding: Promise<void> | null = null;

async function ensureSeed(): Promise<void> {
  const count = await db.sovereignMessage.count();
  if (count > 0) return;
  if (!seeding) {
    seeding = (async () => {
      // בדיקה-חוזרת בתוך-הנעילה — מונע זריעה-כפולה בבקשות-מקבילות
      const c = await db.sovereignMessage.count();
      if (c > 0) return;
      const now = Date.now();
      await db.sovereignMessage.createMany({
        data: SEED.map((s) => ({
          from: s.from,
          kind: s.kind,
          priority: s.priority,
          subject: s.subject,
          body: s.body,
          amount: s.amount,
          currency: s.currency,
          status: s.status,
          requestStatus: s.requestStatus,
          relayProcessed: s.relayProcessed,
          meta: s.meta,
          createdAt: new Date(now - s.minutesAgo * 60_000),
        })),
      });
    })().finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

function buildSummary(
  messages: Array<{
    from: string;
    status: string;
    requestStatus: string | null;
    amount: number | null;
    currency: string | null;
    relayProcessed: boolean;
  }>,
) {
  let unreadForOwner = 0;
  let pendingRequests = 0;
  let pendingAmount = 0;
  let pendingCurrency: string | null = null;
  let relayUnprocessed = 0;
  for (const m of messages) {
    if (m.from === "SOVEREIGNTY" && m.status === "UNREAD") unreadForOwner += 1;
    if (m.requestStatus === "PENDING") {
      pendingRequests += 1;
      if (typeof m.amount === "number") {
        pendingAmount += m.amount;
        pendingCurrency = m.currency ?? pendingCurrency;
      }
    }
    if (m.from === "AGENT_RELAY" && !m.relayProcessed) relayUnprocessed += 1;
  }
  return { unreadForOwner, pendingRequests, pendingAmount, pendingCurrency, relayUnprocessed };
}

const postSchema = z.object({
  from: z.enum(["OWNER", "AGENT_RELAY"]),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1).max(20_000),
  amount: z.number().nonnegative().finite().optional(),
  currency: z.string().trim().min(1).max(24).optional(),
  priority: z.enum(["NORMAL", "HIGH", "CRITICAL"]).optional(),
});

export async function GET() {
  try {
    await ensureSeed();
    const owner = await isOwner();
    const messages = await db.sovereignMessage.findMany({
      orderBy: { createdAt: "asc" },
    });
    // חוק-הפרונט/הבק: התור-הפנימי (טענות-סוכנים) חסוי לכל מי שאינו בעלים
    const visible = owner
      ? messages
      : messages.filter((m) => m.from !== "AGENT_RELAY");
    const summary = buildSummary(messages);
    return NextResponse.json({ messages: visible, summary, owner });
  } catch (err) {
    console.error("[sovereign/messages GET]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-הערוץ" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף-הבקשה-אינו-JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "בקשה-לא-תקינה", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { from, subject, body, amount, currency, priority } = parsed.data;

  try {
    await ensureSeed();

    if (from === "AGENT_RELAY") {
      // חוק-1: טענת-סוכן נפדנת לתור-הפנימי בלבד — לא מוצגת לבעלים כהודעה ישירה.
      const claim = await db.sovereignMessage.create({
        data: {
          from: "AGENT_RELAY",
          kind: "CLAIM",
          priority: priority ?? "NORMAL",
          subject: subject?.slice(0, 300) || "טענת-סוכן",
          body,
          status: "UNREAD",
          relayProcessed: false,
        },
      });
      return NextResponse.json({ claim }, { status: 201 });
    }

    // שער-הבעלים: כתיבה כבעלים דורשת מפתח-headcorner (חוק-הפרונט/הבק)
    if (!(await isOwner())) {
      return NextResponse.json(
        { error: "כתיבה-כבעלים דורשת מפתח headcorner" },
        { status: 401 },
      );
    }

    // OWNER → פנייה ישירה לריבונות + ניסוח תשובה
    const ownerMessage = await db.sovereignMessage.create({
      data: {
        from: "OWNER",
        kind: "REPLY",
        priority: priority ?? "NORMAL",
        subject: subject?.slice(0, 300) || "פניית בעלים",
        body,
        status: "UNREAD",
      },
    });

    // היסטוריית-שיחה: 12 ההודעות האחרונות של בעלים↔ריבונות (OWNER→user, SOVEREIGNTY→assistant)
    const recent = await db.sovereignMessage.findMany({
      where: { from: { in: ["OWNER", "SOVEREIGNTY"] } },
      orderBy: { createdAt: "desc" },
      take: 13,
    });
    const history: SovereignHistoryItem[] = recent
      .reverse()
      .filter((m) => m.id !== ownerMessage.id)
      .slice(-12)
      .map((m) => ({
        role: m.from === "OWNER" ? ("user" as const) : ("assistant" as const),
        content: `${m.subject}\n${m.body}`,
      }));

    const result = await generateSovereignReply(body, history);

    const reply = await db.sovereignMessage.create({
      data: {
        from: "SOVEREIGNTY",
        kind: "REPORT",
        priority: "NORMAL",
        subject: "תשובת הריבונות",
        body: result.text,
        status: "UNREAD",
        meta: JSON.stringify({ llmError: result.llmError }),
        repliedAt: new Date(),
      },
    });

    await db.sovereignMessage.update({
      where: { id: ownerMessage.id },
      data: { status: "ANSWERED" },
    });

    // חוק-הערוץ-האחד (giant/SPEC-CHANNEL.md): כל הוראת-בעלים נוחתת לקו-הבליעה-הקנוני
    // בגיט (inbox.jsonl → commit → push). כישלון-נחיתה לא כושל את הפנייה — מדווח-כנות ב-meta.
    const land = await landOwnerDirective(body).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : "land-failure",
    }));
    const ownerMessageFull = await db.sovereignMessage.update({
      where: { id: ownerMessage.id },
      data: {
        meta: JSON.stringify({ gitLand: land }),
      },
    });

    const ownerMessageAnswered = { ...ownerMessageFull, status: "ANSWERED" };
    return NextResponse.json(
      { ownerMessage: ownerMessageAnswered, reply },
      { status: 201 },
    );
  } catch (err) {
    console.error("[sovereign/messages POST]", err);
    return NextResponse.json({ error: "נכשלה-רישום-הפנייה" }, { status: 500 });
  }
}
