/**
 * runner-kit — ערכת-ההישרדות של הריבונות: מדידת-אמת של סביבת-הרצה (גל-11).
 * ═══════════════════════════════════════════════════════════════════════════
 * מנדט-הבעלים: "מחברים את הריבונות להפעלה מלאה מכל תיקיות הגיט" + תורת-השרדנות:
 * המכשיר-הוא-המנוע, GitHub-הוא-הספר — כל-סנדבוקס-חדש-חייב-להיות-מסוגל-להתרומם.
 *
 * מה-הוא-מודד (הכל-חי, אפס-סימולציות; כשל = כשל-כנה-מודפס):
 *  1. ראנטיים: node/bun · git · זהות-git
 *  2. PAT: נוכחות (upload/pat.env) · חיות-נמדדת-מול-GitHub — **הערך-לעולם-לא-נדפס**
 *  3. שער-הבעלים: קונפיג-דיגסטים (/home/z/.operator/config.json) — יש/אין (כנה)
 *  4. ספרי-הצי-על-הדיסק: 4-הממתינים + קנון-giant — קיום + קומיט-אחרון-נמדד
 *  5. המופע-החי: dev-server:3000 + דלת-הספרים (/api/giant/books)
 *  6. דוח-אמת: reports/runner-kit-<ts>.json (מקומי-בלבד; אפס-סודות-בדוח)
 *
 * ריצה:  node scripts/runner-kit.mjs
 * סדר-ההתרוממות-בסביבה-חדשה:
 *  1) node scripts/gate-bootstrap.mjs   ← השער
 *  2) node scripts/runner-kit.mjs       ← המדידה-המלאה (הכל-ירוק = ריבונות-חיה)
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";

const T0 = Date.now();
const checks = [];
const add = (id, ok, detail, ms = 0) => {
  checks.push({ id, ok, detail, ms });
  const mark = ok ? "OK  " : "FAIL";
  console.log(`[${mark}] ${id.padEnd(24)} ${detail}${ms ? ` · ${ms}ms` : ""}`);
  return ok;
};
const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 9000, ...opts }, (err, stdout, stderr) =>
      resolve({ err, out: (stdout || "").toString().trim(), errOut: (stderr || "").toString().trim() }),
    );
  });
const timed = async (fn) => {
  const t = performance.now();
  const r = await fn();
  return { r, ms: Math.round(performance.now() - t) };
};

console.log("═══ runner-kit · ערכת-ההישרדות של הריבונות ═══");
console.log("מדידה-קודמת-לכל-טענה · הערך-של-המפתח-לעולם-לא-נדפס\n");

/* 1 · ראנטיים */
{
  const nodeV = process.version;
  add("runtime:node", true, nodeV);
  const bun = await run("bun", ["--version"]);
  add("runtime:bun", !bun.err, bun.err ? "לא-נמצא" : bun.out);
  const git = await run("git", ["--version"]);
  add("tool:git", !git.err, git.err ? "לא-נמצא" : git.out);
  const name = await run("git", ["config", "user.name"]);
  const mail = await run("git", ["config", "user.email"]);
  add("git:identity", !name.err && !mail.err, !name.err && !mail.err ? `${name.out} <${mail.out}>` : "זהות-חסרה (git config)");
}

/* 2 · PAT — נוכחות + חיות-נמדדת; אפס-הדפסת-ערך. הצורה-הקנונית: טוקן-גולם-בקובץ
 * (github_pat_… / ghp_…) — או-מפתח=ערך. מזהים-צורה-ומציגים-רק-קידומת-ציבורית. */
let token = null;
{
  const patPath = path.join(process.cwd(), "upload", "pat.env");
  let shape = null;
  try {
    const raw = (await readFile(patPath, "utf8")).trim();
    const kv = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([A-Za-z0-9_]+)/);
    const bare = !kv && /^[A-Za-z0-9_]+$/.test(raw) ? raw : null;
    if (kv) {
      shape = { form: "key=value", key: kv[1] };
      token = kv[2];
    } else if (bare) {
      shape = { form: "raw-token", key: bare.slice(0, 11) };
      token = bare;
    }
  } catch {
    /* חסר — כנה */
  }
  add("pat:presence", Boolean(token), shape ? `צורה=${shape.form} · מזהה=${shape.key}… (הערך-לא-מודפס)` : "upload/pat.env חסר-או-צורה-לא-מזוהה");
  if (token) {
    const { r, ms } = await timed(async () => {
      try {
        const res = await fetch("https://api.github.com/user", {
          headers: { authorization: `Bearer ${token}`, "user-agent": "runner-kit" },
          signal: AbortSignal.timeout(9000),
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        const j = await res.json();
        return { ok: true, detail: `חי · login=${j.login} · scope-אומת-בריצה` };
      } catch (e) {
        return { ok: false, detail: `כשל-רשת-כנה` };
      }
    });
    add("pat:alive", r.ok, r.detail, ms);
    if (r.ok) {
      const { r: org, ms: ms2 } = await timed(async () => {
        try {
          /* roshpinacare-sys הוא-משתמש (נמדד: /orgs/... → 404) — הנקודה-הקנונית: /user/repos */
          const res = await fetch("https://api.github.com/user/repos?per_page=100&affiliation=owner&visibility=all", {
            headers: { authorization: `Bearer ${token}`, "user-agent": "runner-kit" },
            signal: AbortSignal.timeout(9000),
          });
          const j = await res.json();
          return { ok: Array.isArray(j), detail: Array.isArray(j) ? `${j.length} ספרים-נראים-מהטוקן (owner)` : `HTTP ${res.status}` };
        } catch {
          return { ok: false, detail: "כשל-רשת-כנה" };
        }
      });
      add("pat:org-reach", org.ok, org.detail, ms2);
    }
  }
}

/* 3 · שער-הבעלים (דיגסטים-בלבד — אפס-הדפסה) */
{
  let ok = false, detail = "חסר — הרץ: node scripts/gate-bootstrap.mjs";
  try {
    const cfg = JSON.parse(await readFile("/home/z/.operator/config.json", "utf8"));
    ok = typeof cfg.salt === "string" && Array.isArray(cfg.hashes) && cfg.hashes.length >= 4;
    detail = ok ? `קונפיג-דיגסטים קיים · ${cfg.hashes.length} צורות-מומלחות · נוצר ${cfg.created ?? "—"}` : "קונפיג-לא-שלם";
  } catch {
    /* חסר — כנה */
  }
  add("gate:digest-config", ok, detail);
}

/* 4 · ספרי-הצי-על-הדיסק — קיום + קומיט-אחרון-נמדד */
{
  const repos = [
    ["saos-agents", "/home/z/lane/saos-agents"],
    ["Defi", "/home/z/lane/Defi"],
    ["Adsmarket", "/home/z/lane/Adsmarket"],
    ["saos-markets", "/home/z/lane/saos-markets"],
    ["giant(קנון)", "/home/z/channels/giant"],
  ];
  for (const [name, p] of repos) {
    const exists = await access(p).then(() => true, () => false);
    if (!exists) { add(`repo:${name}`, false, "לא-על-הדיסק"); continue; }
    const { r, ms } = await timed(async () => {
      const g = await run("git", ["log", "-1", "--format=%h %cs"], { cwd: p });
      return g.err ? { ok: false, detail: "לא-ריפו-גיט" } : { ok: true, detail: `קומיט-אחרון ${g.out}` };
    });
    add(`repo:${name}`, r.ok, r.detail, ms);
  }
}

/* 5 · המופע-החי */
{
  const { r, ms } = await timed(async () => {
    try {
      const res = await fetch("http://localhost:3000/", { signal: AbortSignal.timeout(6000) });
      return { ok: res.ok, detail: `dev-server HTTP ${res.status}` };
    } catch {
      return { ok: false, detail: "לא-עונה (הרץ: bun run dev)" };
    }
  });
  add("live:dev-server", r.ok, r.detail, ms);
  const { r: books, ms: ms2 } = await timed(async () => {
    try {
      const res = await fetch("http://localhost:3000/api/giant/books", { signal: AbortSignal.timeout(9000) });
      const j = await res.json();
      const okCount = (j.books ?? []).filter((b) => b.ok).length;
      return { ok: j.ok === true, detail: `${okCount}/${(j.books ?? []).length} ספרים-חיים` };
    } catch {
      return { ok: false, detail: "הדלת-לא-נמדדה" };
    }
  });
  add("live:books-door", books.ok, books.detail, ms2);
}

/* 6 · דוח-אמת (מקומי; אפס-סודות) */
const allOk = checks.every((c) => c.ok);
const report = {
  at: new Date().toISOString(),
  totalMs: Date.now() - T0,
  ok: allOk,
  passed: checks.filter((c) => c.ok).length,
  failed: checks.filter((c) => !c.ok).length,
  checks,
};
try {
  await mkdir("reports", { recursive: true });
  const out = path.join("reports", `runner-kit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(out, JSON.stringify(report, null, 1));
  console.log(`\nדוח-אמת: ${out}`);
} catch {
  console.log("\nדוח-אמת: כתיבה-נכשלה (המדידה-עצמה-מודפסת-למעלה)");
}

console.log("════════════════════════════════════════════════");
console.log(allOk ? `הכל-נמדד-ירוק · ${report.passed}/${checks.length} · הריבונות-חיה-בסביבה-הזאת` : `לא-הכל-ירוק · ${report.passed}/${checks.length} — הכשלים-הם-כנים-וקריאים-למעלה`);
process.exit(allOk ? 0 : 1);
