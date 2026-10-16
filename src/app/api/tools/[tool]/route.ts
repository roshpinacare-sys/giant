// /api/tools/[tool] · כלי-תפעול לולאבק/מפעיל — פסקי-קריאה-בלבד מ-tools/fleet, אפס-כתיבת-מדינה.
// אימות=לולאבק: השרת נקשר ל-127.0.0.1; מארח לא-לולאבקי (כולל x-forwarded-host) → 403.
// רשימת-הכלים מקודדת-קשיח; לכל-כלי argv קבוע (שום-קלט-משתמש לא מגיע לתהליך-הילד);
// stdout נחתך ל-50KB · תום-פקיעה 15ש׳ · שם-לא-מוכר = 404.

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const TIMEOUT_MS = 15_000;
const MAX_STDOUT = 50 * 1024;
const MAX_STDERR = 4 * 1024;

type ToolSpec = { file: string; args: string[]; desc: string };

/** רשימה-לבנה מקודדת: כל-כלי נרץ במצב-הקריאה-בלבד שלו, argv מוצמד — לא ניתן להזרקה. */
const TOOLS: Record<string, ToolSpec> = {
  // federation-scan: מוצמד ל---verify-ledger = אימות-שרשרת-חשיבות קריאה-בלבד (אפס-כתיבה).
  // מצב-הסריקה-המלא (כותב-קבלות, דורש federation/FEDERATION.json) לא נחשף כאן בכוונה.
  "federation-scan": {
    file: "tools/fleet/federation-scan.mjs",
    args: ["--verify-ledger"],
    desc: "federation LEDGER.jsonl hash-chain verify (read-only)",
  },
  // agent-gate: מוצמד ל-selftest = מאפיין 12-וקטורים על עץ-/tmp זמני; מצבי
  // challenge/verify/report/register לעולם לא נחשפים דרך ה-API.
  "agent-gate": {
    file: "tools/fleet/agent-gate.mjs",
    args: ["selftest"],
    desc: "agent-gate 12-vector selftest (temp-tree, zero repo writes)",
  },
};

function hostnameOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `http://${raw}`).hostname;
  } catch {
    return raw.split(":")[0] || null;
  }
}

function isLoopback(req: Request): boolean {
  const allowed = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "::ffff:127.0.0.1"]);
  const candidates = [
    hostnameOf(new URL(req.url).host),
    hostnameOf(req.headers.get("host")),
    hostnameOf(req.headers.get("x-forwarded-host")),
  ].filter((h): h is string => !!h);
  // אם-שרשרת-מארחים נוכחת ואינה-לולאבקית — זו-גישה-חוץ: נדחית.
  return candidates.length > 0 && candidates.every((h) => allowed.has(h));
}

function runTool(spec: ToolSpec): Promise<{ code: number | null; stdout: string; stderr: string; truncated: boolean; timedOut: boolean; ms: number; spawnError?: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    const started = Date.now();
    try {
      child = spawn(process.execPath, [path.join(ROOT, spec.file), ...spec.args], {
        cwd: ROOT,
        env: process.env,
      });
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", truncated: false, timedOut: false, ms: 0, spawnError: String(e).slice(0, 200) });
      return;
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outLen = 0;
    let truncated = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* כבר-מת */ }
    }, TIMEOUT_MS);
    child.stdout?.on("data", (d: Buffer) => {
      if (outLen < MAX_STDOUT) {
        const take = d.subarray(0, Math.min(d.length, MAX_STDOUT - outLen));
        out.push(take);
        outLen += take.length;
        if (outLen >= MAX_STDOUT) truncated = true;
      } else {
        truncated = true;
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (err.length < 64) err.push(d.subarray(0, MAX_STDERR));
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: "", stderr: String(e).slice(0, 200), truncated: false, timedOut: false, ms: Date.now() - started, spawnError: String(e).slice(0, 200) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8").slice(0, MAX_STDERR),
        truncated,
        timedOut,
        ms: Date.now() - started,
      });
    });
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  if (!isLoopback(req)) {
    return NextResponse.json({ error: "כלי-תפעול זמינים מלולאבק בלבד (מפעיל)" }, { status: 403 });
  }
  const { tool } = await params;
  const spec = TOOLS[tool];
  if (!spec) {
    return NextResponse.json(
      { error: `כלי-לא-מוכר: ${tool}`, available: Object.keys(TOOLS) },
      { status: 404 },
    );
  }
  const r = await runTool(spec);
  if (r.spawnError) {
    return NextResponse.json({ ok: false, tool, error: "spawn-failed", detail: r.spawnError }, { status: 500 });
  }
  if (r.timedOut) {
    return NextResponse.json({ ok: false, tool, error: `timeout after ${TIMEOUT_MS}ms`, stdout: r.stdout.slice(0, MAX_STDOUT) }, { status: 504 });
  }
  return NextResponse.json({
    ok: r.code === 0,
    tool,
    desc: spec.desc,
    cmd: `${path.basename(process.execPath)} ${spec.file} ${spec.args.join(" ")}`,
    exitCode: r.code,
    durationMs: r.ms,
    truncated: r.truncated,
    stdout: r.stdout,
    ...(r.stderr ? { stderr: r.stderr } : {}),
  });
}
