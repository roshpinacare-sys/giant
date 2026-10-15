// giant · עוגן-ההישרדות (sovereign anchor) — הריבונות-חייבת-לשרוד-מחיקת-סנדבוקס
// הוראת-הבעלים: "אתם סנדבוקס שנמחק... מחברים את הריבונות להפעלה מלאה".
//
// מה-זה-עושה-באמת:
//  • קורא-את-הפאט-מ-upload/pat.env (server-side בלבד — הפאט-מעולם-לא-חוזר-בתשובה-ולא-נרשם)
//  • מודד-חי מול-הענן (git ls-remote): שני-קווי-השושלת בריפו roshpinacare-sys/giant
//  • עגון: קומיט-יתום-טרי-של-עץ-המערכת-הנוכחי (ללא-סודות — upload/ לא-נעקב)
//    + דחיפה ל-refs/heads/sovereign/main. ראש-השושלת-נחקק-בהודעת-הקומיט.
//  • למה-יתום-ולא-היסטוריה-מלאה: הקומיט-הראשון (c185c80) נשא-את-הפאט-הגולמי
//    והיסטוריה-זו-נחסמת-על-ידי-GitHub-Push-Protection — ונכון-שתיחסם.

import { execFile } from "child_process";
import { readFile } from "fs/promises";
import path from "path";

const SYS = "/home/z/my-project";
const PAT_PATH = path.join(SYS, "upload", "pat.env");
const CLOUD_URL = "https://github.com/roshpinacare-sys/giant.git";
const ANCHOR_REF = "refs/heads/sovereign/main";
const SIBLING_REF = "refs/heads/main";

export interface AnchorStatus {
  ok: boolean;
  error?: string;
  localHead: string | null;
  cloud: {
    live: boolean;
    siblingMain: string | null; // קו-הסוכנים-המקבילים — לא-נוגעים-בו
    sovereignMain: string | null; // עוגן-הריבונות
    anchorLineageHead: string | null; // ראש-השושלת-שנחקק-בעוגן
    anchorAt: string | null; // חותמת-העגינה-מהודעת-הקומיט
  };
  anchored: boolean; // האם-עץ-העוגן-בענן == ראש-השושלת-המקומי-האחרון-שנעגן
  behind: number; // כמה-קומיטים-מקומיים-מאוחרים-מהעגינה-האחרונה (0 = עגון-מלא)
}

async function git(args: string[], timeoutMs = 12_000): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", SYS, ...args],
      { timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim().split("\n").slice(-1)[0] || err.message));
        else resolve(stdout);
      },
    );
  });
}

async function readToken(): Promise<string | null> {
  try {
    const raw = (await readFile(PAT_PATH, "utf8")).trim();
    return raw.length >= 20 ? raw : null;
  } catch {
    return null;
  }
}

function authedUrl(token: string): string {
  // לעולם-לא-נרשם-ולא-מוחזר — רק-בזיכרון-תהליך-ה-git-עצמו
  return `https://x-access-token:${token}@${CLOUD_URL.replace("https://", "")}`;
}

function lsRemoteLine(out: string, ref: string): string | null {
  for (const line of out.split("\n")) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && /^[0-9a-f]{40}$/.test(sha)) return sha;
  }
  return null;
}

async function localCommitSubject(sha: string): Promise<string | null> {
  try {
    return (await git(["log", "-1", "--format=%B", sha])).trim();
  } catch {
    return null; // אובייקט-לא-קיים-מקומית
  }
}

export function parseAnchorMessage(msg: string | null): {
  lineageHead: string | null;
  at: string | null;
} {
  if (!msg) return { lineageHead: null, at: null };
  const head = msg.match(/lineage\s+([0-9a-f]{40})/)?.[1] ?? null;
  const at = msg.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/)?.[1] ?? null;
  return { lineageHead: head, at };
}

async function countBehind(from: string, to: string): Promise<number> {
  try {
    const out = await git(["rev-list", "--count", `${from}..${to}`]);
    return Number(out.trim()) || 0;
  } catch {
    return -1; // לא-ניתן-למדוד (היסטוריות-נפרדות/אובייקטים-חסרים)
  }
}

// קאש-קצר-לשמירה-על-לחיצות-רשת-מיותרות
let cache: { at: number; value: AnchorStatus } | null = null;
const CACHE_MS = 20_000;

export async function anchorStatus(force = false): Promise<AnchorStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const status: AnchorStatus = {
    ok: false,
    localHead: null,
    cloud: {
      live: false,
      siblingMain: null,
      sovereignMain: null,
      anchorLineageHead: null,
      anchorAt: null,
    },
    anchored: false,
    behind: -1,
  };
  try {
    const [head, token] = await Promise.all([
      git(["rev-parse", "HEAD"]).catch(() => null),
      readToken(),
    ]);
    status.localHead = head ? head.trim() : null;
    if (!token) {
      status.error = "פאט-לא-זמין-בשרת (upload/pat.env)";
      return finish(status);
    }
    const ls = await git(
      ["ls-remote", authedUrl(token), ANCHOR_REF, SIBLING_REF],
      15_000,
    );
    status.cloud.live = true;
    status.cloud.sovereignMain = lsRemoteLine(ls, ANCHOR_REF);
    status.cloud.siblingMain = lsRemoteLine(ls, SIBLING_REF);
    if (status.cloud.sovereignMain) {
      const subject = await localCommitSubject(status.cloud.sovereignMain);
      const parsed = parseAnchorMessage(subject);
      status.cloud.anchorLineageHead = parsed.lineageHead;
      status.cloud.anchorAt = parsed.at;
      if (parsed.lineageHead && status.localHead) {
        status.anchored = parsed.lineageHead === status.localHead;
        status.behind = status.anchored
          ? 0
          : await countBehind(parsed.lineageHead, status.localHead);
      }
    } else {
      // אין-עוגן-בענן עדיין (הוארכ-לארכיון-ע"י-הצי) — זה-מצב-מוגדר, לא-שגיאה
      status.behind = 0;
      status.anchored = false;
    }
    status.ok = true;
    return finish(status);
  } catch (err) {
    status.error = err instanceof Error ? err.message : "שגיאת-עיגון";
    return finish(status);
  }
}

function finish(s: AnchorStatus): AnchorStatus {
  cache = { at: Date.now(), value: s };
  return s;
}

// העגון-עצמו: קומיט-של-עץ-HEAD-הנוכחי + דחיפה-ל-sovereign/main.
// גל-18 · שיעור-שנמדד-חי: ls-remote-שמחזיר-ריק-ברגע-חמוד (תקלה-רגעית) היה-מפיל-את
// העגינה-ל-`--force`-לא-מוגן — ובהרצה-ידנית-אף-מחק-את-העוגן-לשתי-דקות (שוחזר).
// מעכשיו: מדידה-ריקה/כושלת = עגינה-נדחית-בכנות (fail-closed); והעוגן-הקודם
// מתווסף-כהורה-אמיתי (commit-tree -p) — השושלת-חיה-בהיסטוריית-הגיט-עצמה, לא-רק-בהודעה.
export async function performAnchor(): Promise<
  { ok: true; anchorSha: string; lineageHead: string } | { ok: false; error: string }
> {
  try {
    const token = await readToken();
    if (!token) return { ok: false, error: "פאט-לא-זמין-בשרת (upload/pat.env)" };
    const head = (await git(["rev-parse", "HEAD"])).trim();
    const tree = (await git(["rev-parse", "HEAD^{tree}"])).trim();
    const at = new Date()
      .toISOString()
      .replace(/\.\d+Z$/, "Z");
    // מדידה-קודמת-לכל-דבר: ההודעה-וההורה-נגזרים-מהמדידה — לא-להפך (תיקון-TDZ-מגל-18b)
    const lsOut = await git(["ls-remote", authedUrl(token), ANCHOR_REF], 15_000);
    const current = lsOut.trim().split(/\s+/)[0] ?? "";
    if (!/^[0-9a-f]{40}$/.test(current) && lsOut.trim() !== "") {
      return { ok: false, error: `מדידת-העוגן-בענן-פגומה (${lsOut.trim().slice(0, 40)}) — נדחה fail-closed` };
    }
    /* עוגן-קיים = הורה-אמיתי (שושלת-רציפה); עוגן-חסר-לגמרי (תשובה-ריקה) = שורש-ראשון.
     * שתי-האפשרויות-מגובות-במדידה-מוצלחת בלבד — לעולם-לא-כשל-שקט-שמתפרש-כריק.
     * תיקון-גל-58: העוגן-הקודם-חי-בענן-בלבד (קומיטי-עוגן-יתומים) — חובה-fetch-לפני-שרשור-הורה,
     * אחרת commit-tree -p נופל על "not a valid object". כשל-fetch = דחייה-כנה (fail-closed). */
    const parentArgs = /^[0-9a-f]{40}$/.test(current) ? ["-p", current] : [];
    if (parentArgs.length > 0) {
      try {
        await git(["fetch", authedUrl(token), ANCHOR_REF], 30_000);
      } catch (fetchErr) {
        return {
          ok: false,
          error: `לא-ניתן-להביא-את-העוגן-הקודם-מהענן (${fetchErr instanceof Error ? fetchErr.message : "fetch"}) — נדחה fail-closed`,
        };
      }
    }
    const msg =
      `sovereign anchor snapshot · lineage ${head} · ${at}\n\n` +
      (parentArgs.length > 0
        ? `Chained onto the previous anchor (${current}) — the sovereign\n` +
          `lineage is a real git parent chain now (wave-18 law), not message-only.\n`
        : `First anchor: no previous anchor measured in the cloud.\n`) +
      `The living tree of the giant system carries no secret in this tree\n` +
      `(GitHub Push Protection correctly blocks the original lineage history:\n` +
      `commit c185c80 carried upload/pat.env with the raw PAT). ` +
      `Landed via the owner-gated anchor API from the living system.`;
    const anchorSha = (await git(["commit-tree", tree, ...parentArgs, "-m", msg])).trim();
    // force-with-lease-תמיד: הדחיפה-נכשלת-אם-העוגן-זז-בענן-מאז-המדידה — ואף-פעם-לא-נוגעים-ב-main.
    await git(
      ["push", `--force-with-lease=${ANCHOR_REF}:${current}`, authedUrl(token), `${anchorSha}:${ANCHOR_REF}`],
      30_000,
    );
    cache = null; // אנוס-מדידה-חיה-בסטטוס-הבא
    return { ok: true, anchorSha, lineageHead: head };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאת-עיגון",
    };
  }
}
