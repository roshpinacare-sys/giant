// POST /api/giant/channel/directive — הבעלים מצווה כאן (חוק-הערוץ)
// ═════════════════════════════════════════════════════════════════════════
// סוגר את הפריט-הפתוח "קומיט-ישיר-מהמשטח" ב-Pulse/PROTOCOL 20-c:
// הוראת-בעלים שנכתבת בממשק ← מאומתת-שרת (מפתח-מנהל/headcorner) ← נאטמת
// append-only אל directives.jsonl על-הגיט (GitHub Contents API, PAT שרת-בלבד).
// אפס-כתיבה-של-סוכן: רק-סשן-בעלים מאומת כותב כאן. אפס-הצלחה-כוזבת.
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/office-operator";
import { readPat } from "@/lib/office-truth";
import { loadChannel } from "../route";
import { sha256hex } from "@/lib/giant-integrity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = "roshpinacare-sys/Pulse";
const PATH = "state/sovereign-channel/directives.jsonl";

interface GhFile {
  sha?: string;
  content?: string;
  encoding?: string;
}

export async function POST(req: Request) {
  // 1) שער-הבעלים — אפס-כתיבה-בלי-סשן-מאומת
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!verifySession(token)) {
    return NextResponse.json(
      { ok: false, note: "נדרש אימות מפתח-מנהל — אף כתיבה בלעדיו" },
      { status: 401 },
    );
  }

  // 2) קלט-מאומת
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

  // 3) גישת-כתיבה — PAT שרת-בלבד; כשל = כנה
  const pat = await readPat();
  if (!pat) {
    return NextResponse.json(
      { ok: false, note: "אין גישת-כתיבה לשרת — ההוראה לא נשמרה (אפס-שקר)" },
      { status: 503 },
    );
  }

  const headers = {
    authorization: `Bearer ${pat}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
  };

  // 4) קריאת-הזרם-הקנוני (sha + תוכן) — מהסמכות, לא מהמטמון
  let file: GhFile;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}?ref=main`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, note: `קריאת-הזרם נכשלה (HTTP ${res.status})` }, { status: 502 });
    }
    file = (await res.json()) as GhFile;
  } catch {
    return NextResponse.json({ ok: false, note: "השרת לא הצליח להגיע לגיט — נסה שוב" }, { status: 502 });
  }
  const current =
    file.encoding === "base64" && typeof file.content === "string"
      ? Buffer.from(file.content, "base64").toString("utf8")
      : "";

  // 5) מזהה-רציף D-NNNN (המשכיות-מהזרם-האמיתי)
  let max = 0;
  for (const line of current.split(/\r?\n/)) {
    const m = line.match(/"id"\s*:\s*"D-(\d{4})"/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = `D-${String(max + 1).padStart(4, "0")}`;

  // 6) איטום append-only — שורה-אחת-JSONL
  const row: Record<string, unknown> = {
    id,
    at: new Date().toISOString(),
    by: "owner (via GIANT interface — server-authenticated headcorner session)",
    ...(law ? { law } : {}),
    title,
    directive: items,
    status: "ACTIVE",
  };
  const line = JSON.stringify(row);
  const next = current.endsWith("\n") || current === "" ? `${current}${line}\n` : `${current}\n${line}\n`;

  // 7) קומיט-ישיר אל-הזרם
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `${id} — הוראת-בעלים (GIANT interface)`,
        content: Buffer.from(next, "utf8").toString("base64"),
        sha: file.sha,
        branch: "main",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const msg = detail && typeof detail === "object" && "message" in detail ? String((detail as { message: unknown }).message) : "";
      return NextResponse.json(
        { ok: false, note: `האיטום לגיט נכשל (HTTP ${res.status}) ${msg} — ההוראה לא נכנסה לזרם`.trim() },
        { status: 502 },
      );
    }
    const out = (await res.json()) as { commit?: { sha?: string } };
    await loadChannel(true); // רענון-מיידי של-המטמון מהסמכות
    return NextResponse.json({
      ok: true,
      id,
      commitSha: out.commit?.sha ?? null,
      digest: sha256hex(line).slice(0, 16),
      note: `${id} אוטם בזרם-ההוראות הקנוני — חוק-בנחיתה`,
    });
  } catch {
    return NextResponse.json({ ok: false, note: "הקומיט לא הושלם בזמן — אפס-הצלחה-כוזבת" }, { status: 502 });
  }
}
