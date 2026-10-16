// giant · מנוע-הגיט-החי (G-2): קריאת-מצב מה-clone-הקנוני + נחיתת-הוראות-בעלים
// חוק-הערוץ-האחד (giant/SPEC-CHANNEL.md): היעד-היחיד הוא
// ops/sovereign/OWNER-CHANNEL/inbox.jsonl (append-bounded 60) — ה-decider קורא-אותו בכל-פעימה.
// כנות-מלאה: אין "הצלחה" בלי pushed אמת; אין-הדפסת-טוקנים (ה-remote מוגן, הפלט-שאנו-מחזירים אינו כולל URL).

import { execFile } from "child_process";
import { readFile, readdir, writeFile } from "fs/promises";
import path from "path";

const SBX = "/home/z/my-project/t36/Sandbox";
const INBOX = path.join(SBX, "ops/sovereign/OWNER-CHANNEL/inbox.jsonl");
const LEDGER = path.join(SBX, "ops/AGENT-LEDGER.md");
const REGISTRY = path.join(SBX, "ops/agents/SWARM-REGISTRY.md");
const PLANS_DIR = path.join(SBX, "ops/plans");
const GIANT_DIR = path.join(SBX, "giant");
const INBOX_BOUND = 60;

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd: SBX, timeout: 30_000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(String(stderr || err.message).slice(0, 400)));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

async function readNonEmptyLines(file: string): Promise<string[]> {
  try {
    return (await readFile(file, "utf8"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

export interface GiantGitState {
  ok: boolean;
  error?: string;
  head: string | null;
  ledger: { count: number; lastLine: string | null };
  registry: { rows: number; lastLine: string | null };
  plans: { files: string[] };
  giant: { files: string[] };
  inbox: { count: number; last: Array<Record<string, string>> };
  commits: { recent: string[] };
}

export async function readGitState(): Promise<GiantGitState> {
  try {
    const [head, ledgerLines, registryLines, planFiles, giantFiles, inboxLines, logOut] =
      await Promise.all([
        runGit(["rev-parse", "--short", "HEAD"]).catch(() => null),
        readNonEmptyLines(LEDGER),
        readNonEmptyLines(REGISTRY),
        readdir(PLANS_DIR).catch(() => [] as string[]),
        readdir(GIANT_DIR).catch(() => [] as string[]),
        readNonEmptyLines(INBOX),
        runGit(["log", "--oneline", "-6"]).catch(() => ""),
      ]);

    const lastSummaries: Array<Record<string, string>> = [];
    for (const line of inboxLines.slice(-5).reverse()) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        lastSummaries.push({
          at: String(obj.at ?? obj.ts ?? ""),
          role: String(obj.role ?? ""),
          source: String(obj.source ?? obj.agent ?? ""),
          kind: String(obj.kind ?? ""),
          text: String(obj.summary ?? obj.text ?? "").slice(0, 180),
        });
      } catch {
        lastSummaries.push({ at: "", role: "?", source: "", kind: "unparsed", text: line.slice(0, 180) });
      }
    }

    return {
      ok: true,
      head,
      // D1-כנה: רק שורות-נתונים בפורמט החוקי (תאריך | ...) — לא הערות/כותרות
      ledger: {
        count: ledgerLines.filter((l) => /^\d{4}-\d{2}-\d{2}\s*\|/.test(l)).length,
        lastLine: ledgerLines.at(-1) ?? null,
      },
      registry: { rows: registryLines.filter((l) => l.startsWith("2026")).length, lastLine: registryLines.filter((l) => l.startsWith("2026")).at(-1) ?? null },
      plans: { files: planFiles.filter((f) => f.endsWith(".md")).sort().reverse() },
      giant: { files: giantFiles.filter((f) => f.endsWith(".md")).sort() },
      inbox: { count: inboxLines.length, last: lastSummaries },
      commits: { recent: logOut.split("\n").filter(Boolean) },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : "git-state-failure",
      head: null,
      ledger: { count: 0, lastLine: null },
      registry: { rows: 0, lastLine: null },
      plans: { files: [] },
      giant: { files: [] },
      inbox: { count: 0, last: [] },
      commits: { recent: [] },
    };
  }
}

export interface LandResult {
  ok: boolean;
  commit?: string;
  pushed?: boolean;
  deduped?: boolean;
  error?: string;
}

// נחיתת-הוראת-בעלים: שורה אחת ל-inbox.jsonl (bounded 60) → commit → push. כנות-מלאה.
export async function landOwnerDirective(text: string): Promise<LandResult> {
  try {
    const lines = await readNonEmptyLines(INBOX);
    // דה-דופ: אותו-טקסט כשורה-אחרונה → אין-כפילות (חוק-אין-כפילויות)
    const last = lines.at(-1);
    if (last) {
      try {
        const obj = JSON.parse(last) as { summary?: unknown; role?: unknown };
        if (obj.role === "owner" && typeof obj.summary === "string" && obj.summary === text) {
          const headNow = await runGit(["rev-parse", "--short", "HEAD"]).catch(() => "");
          return { ok: true, deduped: true, commit: headNow.trim(), pushed: false };
        }
      } catch {
        // שורה-לא-מנותחת → ממשיכים לנחיתה רגילה
      }
    }
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      role: "owner",
      source: "giant-channel",
      kind: "directive",
      summary: text.slice(0, 2000),
    });
    const next = [...lines, entry].slice(-INBOX_BOUND);
    await writeFile(INBOX, next.join("\n") + "\n", "utf8");
    await runGit(["add", "ops/sovereign/OWNER-CHANNEL/inbox.jsonl"]);
    const safeMsg = text.slice(0, 70).replace(/[\r\n"\\]/g, " ");
    await runGit(["commit", "-q", "-m", `owner-directive via giant-channel: ${safeMsg}`]);
    const commit = (await runGit(["rev-parse", "--short", "HEAD"])).trim();
    await runGit(["push", "-q", "origin", "HEAD:main"]);
    return { ok: true, commit, pushed: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : "git-land-failure",
    };
  }
}
