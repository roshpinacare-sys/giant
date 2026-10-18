import { NextResponse } from "next/server";
import { execFile } from "node:child_process";

export const dynamic = "force-dynamic";

/**
 * הכנת-עסקה-לחתימת-דפדפן (T-524 · מגשר-המפתחות-המוכן)
 * =====================================================
 * קריאה-לסקריפט-הגשר-הקנוני של המנוע (hive-authority-browser.mjs prepare).
 * הפלט = חומר-ציבורי-בלבד: chainId, עסקה-לא-חתומה-מסודרת, כותרת.
 * אפס-סודות: המפתח-של-הבעלים-לעולם-לא-נוגע-בשרת — הדפדפן-חותם-מקומית.
 * הפעולה: account_update2 שמוסיף-בתוספת-בלבד (additive) את מפתח-המנוע
 * לסמכות-ה-posting של headcorner — owner/active/memo לא-נוגעים (null).
 * fail-closed: כשל-סקריפט/צומת = כנה.
 */

const SCRIPT = "/home/z/audit/repos/steem/mini-services/saos-engine/hive-authority-browser.mjs";
const CWD = "/home/z/audit/repos/steem/mini-services/saos-engine";

function runScript(args: string[], stdin?: string, timeoutMs = 30_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      "bun",
      [SCRIPT, ...args],
      { cwd: CWD, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: { ...process.env } },
      (err, stdout, stderr) => {
        const code = err ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    );
    if (stdin !== undefined) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    }
  });
}

function parseLastJson(text: string): Record<string, unknown> | null {
  const lines = text.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

export async function POST() {
  const { stdout } = await runScript(["prepare"]);
  const parsed = parseLastJson(stdout);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "prepare-failed", raw: stdout.slice(-400) }, { status: 502 });
  }
  return NextResponse.json(parsed);
}
