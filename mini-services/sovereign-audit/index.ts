/* ═══ sovereign-audit · ביקורת-מסלול בלתי-תלויה · פורט 3022 · שתי-מסילות ═════
 * גל-93 · צו-בעלים (ghidra + iFixAi): "בחן כיצד תיקיות אלו יכולות לעזור לנו
 * לארכיטקטורה ואיך ליישם נכון לשלב תכנן בצע דחף".
 *
 * גל-94 · תעלות-הכל (צו: "תראה מה שאר הסוכנים עשו ותעל את הכל"): תבנית-iFixAi
 * הוכחה על-הצבא — עתה בשתי-מסילות על-אותו-עיקרון (פסיבי-טהור · קורא-לוגים ·
 * הוכחות-מוקפאות · אפס-סודות · אפס-מסחר):
 *   1. audit_soldiers.py — soldier-army :3018 (מדיניות soldier-mandate-msg8)
 *   2. audit_voice.py    — sovereign-voice :3019 (מדיניות voice-mandate-v1)
 *
 * לולאה: כל 15 דק + על-דרישה (POST /run). פלט-אמת ב-/health. */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = 3022;
const HERE = import.meta.dir;

const LANES = [
  { name: "soldiers", script: path.join(HERE, "audit_soldiers.py"), out: path.join(HERE, "state", "last-audit.json") },
  { name: "voice", script: path.join(HERE, "audit_voice.py"), out: path.join(HERE, "state", "last-audit-voice.json") },
] as const;

/* גל-94 · תיקון-שורש-נמדד: ה-spawnSync("python3") תלוי-PATH-של-השירות — בסנדבוקס-חדש
 * ה-python3-המערכתי-אינו-מחזיק-את-ifixai (הותקן-ב-venv), והמבקר-הבלתי-תלוי-היה-RED
 * קבוע (AUDIT-ERROR · נמדד 11:10/11:25/11:40). הסדר: venv-הבית → PATH → fallback. */
const PYTHON_CANDIDATES = [
  "/home/z/.venv/bin/python3",
  "python3",
];
function resolvePython(): string {
  for (const p of PYTHON_CANDIDATES) {
    if (p === "python3" || existsSync(p)) return p;
  }
  return "python3";
}
const LOG = path.join(HERE, "state", "audit.log");

let runs = 0;
let lastRunAt = 0;
const lastDecisions: Record<string, string | null> = {};
const lastErrors: Record<string, string | null> = {};
let selfHealTried = false;

function appendLog(s: string): void {
  try { appendFileSync(LOG, s + "\n"); } catch { /* לוג-לעולם-לא-מפיל-ביקורת */ }
}

function runLane(lane: (typeof LANES)[number], windowS = 24 * 3600): { decision: string; events: number } {
  const r = spawnSync(resolvePython(), [lane.script, String(windowS)], {
    timeout: 120_000,
    encoding: "utf8",
  });
  lastRunAt = Date.now();
  try {
    mkdirSync(path.dirname(LOG), { recursive: true });
    const stamp = new Date().toISOString();
    const tail = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.slice(-800);
    appendLog(`[${stamp}][${lane.name}] exit=${r.status} · ${tail.replace(/\n+/g, " | ").slice(0, 700)}`);
  } catch { /* לוג-לעולם-לא-מפיל-ביקורת */ }
  if (r.status !== 0) {
    lastErrors[lane.name] = `python exit=${r.status}: ${(r.stderr ?? "").slice(-200)}`;
    lastDecisions[lane.name] = "AUDIT-ERROR";
    /* גל-94 · עוגן-שיקום-עצמי: sandbox-חדש מאבד-את-ifixai (venv-אפמרלי). כשל-מודול →
     * התקנה-עצמית-פעם-בתהליך (venv-python), ואז-ריצה-חוזרת. המבקר-לעולם-לא-נשאר-RED-בשקט. */
    if (/No module named 'ifixai'/.test(r.stderr ?? "") && !selfHealTried) {
      selfHealTried = true;
      const py = resolvePython();
      const inst = spawnSync(py, ["-m", "pip", "install", "-q", "ifixai==4.2.0"], {
        timeout: 180_000, encoding: "utf8",
      });
      appendLog(`[${new Date().toISOString()}] self-heal pip-install exit=${inst.status}`);
      if (inst.status === 0) return runLane(lane, windowS); // ריצה-חוזרת-אחת בלבד
    }
    return { decision: lastDecisions[lane.name] ?? "AUDIT-ERROR", events: 0 };
  }
  try {
    const line = (r.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "{}";
    const j = JSON.parse(line) as { decision?: string; events?: number };
    lastDecisions[lane.name] = j.decision ?? "?";
    lastErrors[lane.name] = null;
    return { decision: lastDecisions[lane.name] ?? "?", events: j.events ?? 0 };
  } catch (e) {
    lastErrors[lane.name] = `parse: ${String(e).slice(0, 120)}`;
    lastDecisions[lane.name] = "AUDIT-ERROR";
    return { decision: lastDecisions[lane.name] ?? "AUDIT-ERROR", events: 0 };
  }
}

/* סדר-קביעת-החמור-מבין-המסילות: FINDINGS > AUDIT-ERROR > NO-EVENTS > CLEAR */
const WORST_ORDER = ["FINDINGS", "AUDIT-ERROR", "NO-EVENTS", "CLEAR"];
function worst(decisions: string[]): string {
  for (const d of WORST_ORDER) if (decisions.includes(d)) return d;
  return decisions[0] ?? "?";
}

function runAuditAll(windowS = 24 * 3600): { decision: string; lanes: Record<string, { decision: string; events: number }> } {
  runs++;
  const lanes: Record<string, { decision: string; events: number }> = {};
  for (const lane of LANES) lanes[lane.name] = runLane(lane, windowS);
  return { decision: worst(Object.values(lanes).map((l) => l.decision)), lanes };
}

Bun.serve({
  port: PORT,
  fetch: (req) => {
    const u = new URL(req.url);
    if (u.pathname === "/run" && req.method === "POST") {
      const windowS = Number(u.searchParams.get("window_s") ?? 0) || 24 * 3600;
      const r = runAuditAll(windowS);
      return Response.json({ ok: true, ran: true, ...r });
    }
    const lasts: Record<string, unknown> = {};
    for (const lane of LANES) {
      try { if (existsSync(lane.out)) lasts[lane.name] = JSON.parse(readFileSync(lane.out, "utf8")); } catch { /* כנה */ }
    }
    return Response.json({
      ok: true,
      service: "sovereign-audit",
      port: PORT,
      auditor: "iFixAi 4.2.0 · trajectory-assurance (passive)",
      lanes: {
        soldiers: "soldier-army :3018 · state/actions.jsonl · policy=soldier-mandate-msg8 (permissions + per-soldier bank 300,000µ)",
        voice: "sovereign-voice :3019 · heal-log+fuel-log · policy=voice-mandate-v1 (respawn@services · fuel@credits · heal-budget 100u, fail=10u)",
      },
      runs, lastRunAt: lastRunAt || null,
      lastDecision: worst(Object.values(lastDecisions).map((d) => d ?? "?")),
      lastDecisions, lastErrors,
      last: lasts,
      schedule: "every 15min + POST /run",
    });
  },
});

console.log(`[sovereign-audit] חי על :${PORT} — שתי-מסילות ביקורת בלתי-תלויה (soldiers+voice · iFixAi)`);
void runAuditAll(); /* ביקורת-ראשונה עם העלייה */
setInterval(() => runAuditAll(), 15 * 60 * 1000);
