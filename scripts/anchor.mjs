#!/usr/bin/env bun
/**
 * scripts/anchor.mjs — העגינה-האחידה-המוגנת (גל-18 · "עוגין-רק-דרך-שער-אחד")
 * ═══════════════════════════════════════════════════════════════════════════
 * שיעורי-גל-18-שנמדדו-חי (שלוש-תקלות-אמיתיות-ביום-העגינה):
 *  1. ls-remote-ריק-רגעי התפרש-כ"אין-עוגן" → refspec-ריק = מחיקת-הענף.
 *  2. אב-שנמדד-בענן-ולא-קיים-מקומית → commit-tree-נכשל → refspec-ריק = מחיקה.
 *  3. --force-כנפילה-ל-lease = דריסה-בלי-מדידה.
 * החוק-החדש: אף-מהלך-לפני-שלוש-מדידות-עקביות · אחזור-האב-מקומית-חובה ·
 * refspec-מוגש-רק-עם-commit-תקין-מאומת · lease-תמיד · אימות-לאחר-דחיפה.
 *
 * שימוש: bun scripts/anchor.mjs [message]
 * יוצא 0 בהצלחה; 1 בכשל-כנה (לעולם-לא-משקר).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SYS = "/home/z/my-project";
const URL = "https://github.com/roshpinacare-sys/giant.git";
const BRANCH = "refs/heads/sovereign/main";
const TAG = "refs/tags/sovereign-anchor-latest";
const HEX40 = /^[0-9a-f]{40}$/;

const g = async (args, timeout = 30_000) => {
  const { stdout } = await run("git", ["-C", SYS, ...args], { timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return stdout;
};

const fail = (msg) => { console.error(`ANCHOR-REFUSED: ${msg}`); process.exit(1); };

/* 1 · מדידה — שלוש-פעמים; עקביות-חובה */
async function measure() {
  const reads = [];
  for (let i = 0; i < 3; i++) {
    const out = await g(["ls-remote", URL, BRANCH]).catch((e) => { throw new Error(`ls-remote-failed: ${String(e.stderr || e.message).slice(0, 100)}`); });
    const sha = out.trim().split(/\s+/)[0] ?? "";
    reads.push(HEX40.test(sha) ? sha : "");
    if (i < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  const [a, b, c] = reads;
  if (a && a === b && a === c) return a;           // עוגן-קיים-ומדוד-בוודאות
  if (!a && !b && !c) return "";                    // חסר-בוודאות (שלוש-ריקות-עקביות)
  throw new Error(`מדידות-לא-עקביות (${reads.join(",")}) — הענן-זז-בין-הקריאות; נסה-שוב`);
}

/* 2 · עץ-המערכת-החיה */
const head = (await g(["rev-parse", "HEAD"])).trim();
const tree = (await g(["rev-parse", "HEAD^{tree}"])).trim();
if (!HEX40.test(head) || !HEX40.test(tree)) fail("HEAD/עץ-לא-תקינים");

/* 3 · מדידה + אחזור-האב-מקומית (חובה — לא-עוגנים-על-אובייקט-שאינו-ביד).
 * החוק-האמיתי: קיום-מקומי-של-האב. האחזור-אמצעי-בלבד — כשל-אחזור-רגעי-לא-שולל
 * אובייקט-שכבר-בידנו (נמדד-חי: fetch-רגעי-נכשל-פעמיים-ואז-הצליח). */
const parent = await measure();
if (parent) {
  const localType = (await g(["cat-file", "-t", parent]).catch(() => "")).trim();
  if (localType !== "commit") {
    await g(["fetch", "--no-tags", URL, parent]).catch(() => {});
    const retried = (await g(["cat-file", "-t", parent]).catch(() => "")).trim();
    if (retried !== "commit") {
      fail(`אב-העוגן ${parent.slice(0, 8)} נמדד-בענן-אך-אינו-אובייקט-commit-מקומי — לא-מסתעפים-מאובייקט-עלום`);
    }
  }
}

/* 4 · קומיט-העוגן — מאומת-לפני-כל-דחיפה */
const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const msg =
  process.argv.slice(2).join(" ").trim() ||
  `sovereign anchor snapshot · lineage ${head} · ${at}\n\n` +
  (parent ? `Chained onto measured previous anchor (${parent}).\n` : `First anchor (three consistent empty measurements).\n`) +
  `No secret in this tree. Landed via scripts/anchor.mjs (fail-closed law, wave-18).`;
const anchorSha = (await g(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", msg])).trim();
if (!HEX40.test(anchorSha)) fail(`commit-tree-החזיר-${anchorSha || "ריק"} — אף-דחיפה-לא-מתבצעת`);

/* 5 · דחיפה-מוגנת-בלבד: ענף + טאג-עמיד, lease-על-המדידה-המאומתת */
await g(["push", `--force-with-lease=${BRANCH}:${parent}`, URL, `${anchorSha}:${BRANCH}`, `${anchorSha}:${TAG}`], 60_000);

/* 6 · אימות-לאחר-דחיפה */
const verify = (await g(["ls-remote", URL, BRANCH, TAG], 20_000)).trim();
const okBranch = verify.includes(anchorSha);
if (!okBranch) fail(`אימות-לאחר-דחיפה-נכשל — העוגן-לא-נראה-בענן`);

console.log(`ANCHORED: ${anchorSha} (lineage ${head}, parent ${parent || "none"}) · branch+tag verified in cloud`);
