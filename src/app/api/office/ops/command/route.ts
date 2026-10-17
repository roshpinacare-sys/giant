import { SAOS_PROJECT_ROOT } from "@/lib/saos-paths";
// POST /api/office/ops/command — מנוע-הפקודות של המפעיל: הדרך החכמה להשפיע חזק
// על כל-האוטונומיה דרך צ'אט-המשרד. כל-פקודה: מדידה → ביצוע → רישום-כנה.
// חוק-אפס-חשיפה: הטוקן/המפתח לעולם לא ביומן; היומן מחזיק כוונה+תוצאה בלבד.
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/office-operator";
import {
  dispatchWorkflow,
  journalToGit,
  measureFeeds,
  measureOrders,
  measureRuns,
  measureStasis,
  readPat,
} from "@/lib/office-truth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HELP = [
  "פקודות-המפעיל (עברית או אנגלית):",
  "· מצב / status — תמונת-מצב מלאה (הזנות + מסילות + פקודות + ריצות)",
  "· דופק / feeds — גיל 9 הזנות-החדר מול המכסות",
  "· מסילות / stasis — מצב שער-מסילות-ההון החי",
  "· פקודות / orders — פקודות-עבודה פתוחות",
  "· ריצות / runs — 12 הריצות האחרונות ב-Domain",
  "· הפעל <workflow> [ריפו] / dispatch — הפעלה אמיתית (ברירת-מחדל Domain). למשל: הפעל office-pulse",
  "· רענן / refresh — דופק + רופא-הגריד מופעלים מיד",
  "· רשום <טקסט> / note — רישום-מפעיל עמיד בגיט (Sandbox/ops/office/operator-journal.jsonl) — האוטונומיה קוראת אותו",
  "· עזרה / help — הרשימה הזאת",
].join("\n");

function parseIntent(text: string): { intent: string; arg1: string; arg2: string; note: string } {
  const t = text.trim();
  const lower = t.toLowerCase();
  const has = (...words: string[]) => words.some((w) => lower === w || lower.startsWith(w + " "));

  if (has("עזרה", "help", "פקודות?")) return { intent: "help", arg1: "", arg2: "", note: "" };
  if (has("מצב", "status", "תמונת מצב", "מצב כללי")) return { intent: "status", arg1: "", arg2: "", note: "" };
  if (has("דופק", "feeds", "הזנות")) return { intent: "feeds", arg1: "", arg2: "", note: "" };
  if (has("מסילות", "stasis", "הון", "מסילות הון")) return { intent: "stasis", arg1: "", arg2: "", note: "" };
  if (has("פקודות", "orders")) return { intent: "orders", arg1: "", arg2: "", note: "" };
  if (has("ריצות", "runs")) return { intent: "runs", arg1: "", arg2: "", note: "" };
  if (has("רענן", "refresh")) return { intent: "refresh", arg1: "", arg2: "", note: "" };
  if (has("הפעל", "dispatch", "הרץ")) {
    const parts = t.split(/\s+/).slice(1).filter(Boolean);
    return { intent: "dispatch", arg1: parts[0] ?? "", arg2: parts[1] ?? "Domain", note: "" };
  }
  if (has("רשום", "note", "רישום", "פתק")) {
    return { intent: "note", arg1: "", arg2: "", note: t.split(/\s+/).slice(1).join(" ").slice(0, 500) };
  }
  return { intent: "unknown", arg1: "", arg2: "", note: "" };
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!verifySession(token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.slice(0, 1000);
  } catch {
    return NextResponse.json({ ok: false, reply: "בקשה שגויה" }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ ok: false, reply: "פקודה ריקה — נסה עזרה" });
  }

  const pat = await readPat();
  const { intent, arg1, arg2, note } = parseIntent(text);
  let reply = "";
  let data: unknown = null;

  switch (intent) {
    case "help":
      reply = HELP;
      break;

    case "status": {
      const [feeds, stasis, orders, runs] = await Promise.all([
        measureFeeds(pat),
        measureStasis(pat),
        measureOrders(pat),
        measureRuns(pat, "Domain", 8),
      ]);
      const fresh = feeds.filter((f) => f.state === "fresh").length;
      const stale = feeds.filter((f) => f.state === "stale" || f.state === "unknown").map((f) => f.he);
      reply = [
        `תמונת-מצב (${new Date().toISOString().slice(0, 16).replace("T", " ")}Z):`,
        `· הזנות: ${fresh}/9 טריות${stale.length ? ` · דורשות-עין: ${stale.join(", ")}` : " · הכל חי"}`,
        `· מסילות-הון: ${stasis.allOpen ? "פתוחות" : "מדורגות"} — ${stasis.label} (${stasis.allowCount} מסילות)`,
        `· פקודות-עבודה: ${orders.total - orders.open}/${orders.total} סגורות${orders.open ? ` · פתוחות: ${orders.openIds.join(", ")}` : " · אפס פתוחות"}`,
        `· ריצות אחרונות: ${runs ? runs.slice(0, 5).map((r) => `${r.name}=${r.conclusion ?? r.status}`).join(" · ") : "לא-נמדד"}`,
      ].join("\n");
      data = { feeds, stasis, orders, runs };
      break;
    }

    case "feeds": {
      const feeds = await measureFeeds(pat);
      reply = feeds
        .map((f) => `· ${f.he}: ${f.ageMin === null ? "לא-נמדד" : `${f.ageMin} דק' מול מכסה ${f.capMin}`} — ${f.state === "fresh" ? "חי" : f.state === "aging" ? "מזדקן" : f.state === "stale" ? "מפגר" : "לא-ידוע"}`)
        .join("\n");
      data = { feeds };
      break;
    }

    case "stasis": {
      const stasis = await measureStasis(pat);
      reply = `שער-מסילות-ההון: ${stasis.label} · active=${String(stasis.active)} · mode=${stasis.mode} · מסילות-פתוחות=${stasis.allowCount}/7\n(הבלם-החירום חמוש — ביטול = halt-all בשרשרת-הנחיות-הבעלים)`;
      data = { stasis };
      break;
    }

    case "orders": {
      const orders = await measureOrders(pat);
      reply = orders.open
        ? `פתוחות ${orders.open}/${orders.total}: ${orders.openIds.join(", ")}`
        : `אפס פקודות פתוחות (${orders.total}/${orders.total} סגורות — הראשון בתולדות הפנקס)`;
      data = { orders };
      break;
    }

    case "runs": {
      const runs = await measureRuns(pat, "Domain", 12);
      reply = runs
        ? runs.map((r) => `· ${r.name} [${r.event}] ${r.conclusion ?? r.status} · ${r.ageMin ?? "?"} דק'`).join("\n")
        : "לא-נמדד (API כשל)";
      data = { runs };
      break;
    }

    case "refresh": {
      if (!pat) {
        reply = "אין קרדנשל-דיספאץ' בשרת — נכשל בכנות";
        break;
      }
      const [a, b] = await Promise.all([
        dispatchWorkflow(pat, "Domain", "office-pulse.yml"),
        dispatchWorkflow(pat, "Domain", "grid-doctor.yml"),
      ]);
      reply = `רענון-דופק: office-pulse=${a.ok ? "הופעל ✔" : `כשל(${a.status})`} · grid-doctor=${b.ok ? "הופעל ✔" : `כשל(${b.status})`}`;
      break;
    }

    case "dispatch": {
      if (!arg1) {
        reply = "חסר שם-workflow. למשל: הפעל office-pulse";
        break;
      }
      if (!/^[A-Za-z0-9_.-]+$/.test(arg1) || !/^[A-Za-z0-9_-]+$/.test(arg2)) {
        reply = "שם-לא-תקין";
        break;
      }
      if (!pat) {
        reply = "אין קרדנשל-דיספאץ' בשרת — נכשל בכנות";
        break;
      }
      const wf = arg1.includes(".") ? arg1 : `${arg1}.yml`;
      const res = await dispatchWorkflow(pat, arg2, wf);
      reply = res.ok
        ? `הופעל: ${arg2}/${wf} (workflow_dispatch על main) — הריצה תיראה ב"ריצות" בעוד ~דקה`
        : `כשל-דיספאץ' (${res.status === 404 ? "workflow לא נמצא בריפו" : `HTTP ${res.status}`})`;
      break;
    }

    case "note": {
      if (!note.trim()) {
        reply = "רישום ריק — נסה: רשום <טקסט>";
        break;
      }
      const j = await journalToGit({
        at: new Date().toISOString(),
        via: "office-console",
        intent: "note",
        text: note.replace(/[\r\n]+/g, " "),
      });
      reply = j.ok ? `רשום ונשמר בגיט ✔ (${j.note})` : `הרישום נשמר מקומית אך לא נדחף: ${j.note}`;
      break;
    }

    default:
      reply = `לא הבנתי את הפקודה.\n${HELP}`;
  }

  // יומן-מקומי כנה: כוונה+תוצאה בלבד (אף טוקן, אף מפתח, אף תוכן-מפתח)
  try {
    const { appendFile, mkdir } = await import("node:fs/promises");
    await mkdir(`${SAOS_PROJECT_ROOT}/.ops`, { recursive: true });
    await appendFile(
      `${SAOS_PROJECT_ROOT}/.ops/journal.jsonl`,
      JSON.stringify({ at: new Date().toISOString(), intent, ok: reply.length > 0, brief: reply.slice(0, 120).replace(/\n/g, " ") }) + "\n",
      "utf8",
    );
  } catch {
    /* יומן-מקומי הוא העשרה — לא חוסם */
  }

  return NextResponse.json({ ok: true, reply, data }, { headers: { "cache-control": "no-store" } });
}
