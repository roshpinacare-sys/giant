// GET /api/giant/tool-usability — נראות-שימושיות-הארסנל-הריבוני (גל-97 · agent-2)
// ═════════════════════════════════════════════════════════════════════════════
// מנדט-הבעלים (גל-91/גל-97): "וודא שהאוטונומיה יודעת להשתמש בכלים שעשית".
// נקודה-זו היא המקור-החי ל-KPI: כל-הרצת-כלי של פעימת-הבנאי נרשמת ב-tool-usage.jsonl
// (ע"י run-builder-beat.mjs · recordToolUsage) ומסוכמת ב-builder-state.json · toolStats.
// fail-honest: אין-קובץ → null/[] — אף-מספר-לא-מומצא.
import { NextResponse } from "next/server";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_FILE = "/home/z/audit/sovereign-builder/state/builder-state.json";
const USAGE_LOG = "/home/z/audit/sovereign-builder/state/tool-usage.jsonl";

const TOOLS: Record<string, { title: string; script: string }> = {
  verify_chain: { title: "אימות-שרשרת בלתי-תלוי", script: "sovereign-vm/verify_chain.py" },
  ledger_stats: { title: "סטטיסטיקת-פנקס חיה", script: "sovereign-vm/ledger_stats.py" },
  price_report: { title: "דוח-בריכה-ואוצר", script: "sovereign-vm/price_report.py" },
  tools_selftest: { title: "הוכחת-שימוש-חד-פעמית (מטריצת-ארסנל)", script: "sovereign-vm/tools_selftest.py" },
};

type UsageEntry = { at: string; tool: string; ok: boolean; durMs: number; result: string };

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readUsageTail(n: number): UsageEntry[] {
  try {
    return fs
      .readFileSync(USAGE_LOG, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-n)
      .map((l) => {
        try {
          const e = JSON.parse(l) as Record<string, unknown>;
          return {
            at: String(e.at ?? ""),
            tool: String(e.tool ?? "?"),
            ok: e.ok === true,
            durMs: typeof e.durMs === "number" ? e.durMs : 0,
            result: String(e.result ?? "").slice(0, 120),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is UsageEntry => x !== null);
  } catch {
    return [];
  }
}

export async function GET() {
  const state = readJson(STATE_FILE);
  const rawStats = (state?.toolStats ?? null) as Record<string, Record<string, unknown>> | null;
  const usage = readUsageTail(30);

  const tools = Object.entries(TOOLS).map(([id, meta]) => {
    const s = rawStats?.[id] ?? null;
    return {
      id,
      title: meta.title,
      script: meta.script,
      runs: typeof s?.runs === "number" ? s.runs : 0,
      ok: typeof s?.ok === "number" ? s.ok : 0,
      fail: typeof s?.fail === "number" ? s.fail : 0,
      lastOkAt: typeof s?.lastOkAt === "string" ? s.lastOkAt : null,
      lastResult: typeof s?.lastResult === "string" ? s.lastResult : null,
    };
  });

  const totalRuns = tools.reduce((a, t) => a + t.runs, 0);
  const totalOk = tools.reduce((a, t) => a + t.ok, 0);
  const activeTools = tools.filter((t) => t.runs > 0).length;
  const selftest = tools.find((t) => t.id === "tools_selftest") ?? null;
  const selftestOk = !!selftest && selftest.ok > 0 && (selftest.fail === 0 || selftest.ok >= selftest.fail);

  return NextResponse.json({
    at: new Date().toISOString(),
    registry: "fleet-economy/bootstrap/sovereign-builder/TOOLS.md",
    tools,
    usage: usage.slice().reverse(), // החדש-ראשון
    kpi: {
      totalRuns,
      totalOk,
      okRate: totalRuns > 0 ? Math.round((totalOk / totalRuns) * 100) : 0,
      activeTools,
      toolCount: tools.length,
      selftestOk,
      lastSelftestAt: selftest?.lastOkAt ?? null,
      builderActs: typeof state?.acts === "number" ? state.acts : null,
      builderSeals: typeof state?.seals === "number" ? state.seals : null,
    },
    verdict:
      activeTools === tools.length && selftestOk
        ? "האוטונומיה משתמשת-בפועל בכל-הארסנל · מטריצת-הוכחה ירוקה"
        : activeTools > 0
          ? "האוטונומיה משתמשת-בחלק-מהארסנל — הסבב-המסתובב יכסה-הכל"
          : "אין-הוכחת-שימוש-עדיין — הפעימה-הבאה תריץ את הפלייבוק",
    safety: "קריאה-בלבד · אפס-כתיבה · אפס-סודות · fail-honest",
  });
}
