/* ═══ sovereign-audit · ביקורת-מסלול בלתי-תלויה על צבא-החיילים · פורט 3022 ═════
 * גל-93 · צו-בעלים (ghidra + iFixAi): "בחן כיצד תיקיות אלו יכולות לעזור לנו
 * לארכיטקטורה ואיך ליישם נכון לשלב תכנן בצע דחף".
 *
 * iFixAi 4.2.0 (pip, python3) = ביקורת-בלתי-תלויה פסיבית על מסלולי-פעולה של סוכנים.
 * המבקר: audit_soldiers.py — קורא את אירועי-הפעולה האמיתיים של הצבא
 * (soldier-army/state/actions.jsonl), בונה capture נטיבי, משווה מול מדיניות-המנדט
 * (הרשאות · תקרת-בנק 300,000µ פר-חייל), מקפיא הוכחות (JSONL+MD) ומחליט CLEAR/FINDINGS.
 *
 * לולאה: כל 15 דק + על-דרישה (POST /run). פלט-אמת ב-/health. אפס-סודות. אפס-מסחר. */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = 3022;
const HERE = import.meta.dir;
const AUDIT_SCRIPT = path.join(HERE, "audit_soldiers.py");
const OUT_JSON = path.join(HERE, "state", "last-audit.json");
const LOG = path.join(HERE, "state", "audit.log");

let runs = 0;
let lastRunAt = 0;
let lastDecision: string | null = null;
let lastError: string | null = null;

function appendLog(s: string): void {
  try { appendFileSync(LOG, s + "\n"); } catch { /* לוג-לעולם-לא-מפיל-ביקורת */ }
}

function runAudit(windowS = 24 * 3600): { decision: string; events: number } {
  // תיקון-שורש (2026-10-20 · מרשם-טענות): spawnSync("python3") היה נופל-על-PATH-של-
  // השירות-שאינו-מכיל-את-ה-venv (/home/z/.venv) → ModuleNotFoundError: ifixai — המבקר
  // "חי" ב-port אבל-מת-פונקציונלית (AUDIT-ERROR קבוע). עתה: מוצא-מתוך-שלושה-מועמדים
  // מוכחים — ה-venv הקנוני, שם-מלא-בשרת, ו-python3 רגיל (גיבוי-אחרון). fail-honest.
  const CANDIDATES = ["/home/z/.venv/bin/python3", "/usr/bin/python3", "python3"];
  const py = CANDIDATES.find((c) => {
    try { return spawnSync(c.startsWith("/") ? c : "which", c.startsWith("/") ? [] : [c]).status === 0; } catch { return false; }
  }) ?? "python3";
  const r = spawnSync(py, [AUDIT_SCRIPT, String(windowS)], {
    timeout: 120_000,
    encoding: "utf8",
    env: { ...process.env, PATH: `/home/z/.venv/bin:${process.env.PATH ?? ""}` },
  });
  lastRunAt = Date.now();
  runs++;
  try {
    mkdirSync(path.dirname(LOG), { recursive: true });
    const stamp = new Date().toISOString();
    const tail = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.slice(-800);
    appendLog(`[${stamp}] exit=${r.status} · ${tail.replace(/\n+/g, " | ").slice(0, 700)}`);
  } catch { /* לוג-לעולם-לא-מפיל-ביקורת */ }
  if (r.status !== 0) {
    lastError = `python exit=${r.status}: ${(r.stderr ?? "").slice(-200)}`;
    lastDecision = "AUDIT-ERROR";
    return { decision: lastDecision, events: 0 };
  }
  try {
    const line = (r.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "{}";
    const j = JSON.parse(line) as { decision?: string; events?: number };
    lastDecision = j.decision ?? "?";
    lastError = null;
    return { decision: lastDecision, events: j.events ?? 0 };
  } catch (e) {
    lastError = `parse: ${String(e).slice(0, 120)}`;
    lastDecision = "AUDIT-ERROR";
    return { decision: lastDecision, events: 0 };
  }
}

Bun.serve({
  port: PORT,
  fetch: (req) => {
    const u = new URL(req.url);
    if (u.pathname === "/run" && req.method === "POST") {
      const windowS = Number(u.searchParams.get("window_s") ?? 0) || 24 * 3600;
      const r = runAudit(windowS);
      return Response.json({ ok: true, ran: true, ...r });
    }
    let last: unknown = null;
    try { if (existsSync(OUT_JSON)) last = JSON.parse(readFileSync(OUT_JSON, "utf8")); } catch { /* כנה */ }
    return Response.json({
      ok: true,
      service: "sovereign-audit",
      port: PORT,
      auditor: "iFixAi 4.2.0 · trajectory-assurance (passive)",
      target: "soldier-army :3018 · state/actions.jsonl",
      policy: "soldier-mandate-msg8 (permissions + per-soldier bank 300,000µ)",
      runs, lastRunAt: lastRunAt || null, lastDecision, lastError,
      last: last ?? null,
      schedule: "every 15min + POST /run",
    });
  },
});

console.log(`[sovereign-audit] חי על :${PORT} — ביקורת-מסלול בלתי-תלויה על הצבא (iFixAi)`);
void runAudit(); /* ביקורת-ראשונה עם העלייה */
setInterval(() => runAudit(), 15 * 60 * 1000);
