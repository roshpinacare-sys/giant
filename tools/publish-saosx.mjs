/* publish-saosx.mjs — מוציא-ה-SNAPSHOT הציבורי של SAOSX לאתר-Domain
 * :3025/snapshot → token.json (commit+push לריפו-Domain) · fail-honest · אפס-סודות */
import { execFile } from "node:child_process";

const SNAP = "http://127.0.0.1:3025/snapshot";
const DOMAIN = "/home/z/work/domain";

function sh(dir, args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: dir, timeout: 60_000, maxBuffer: 4_000_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).slice(0, 300))) : resolve(stdout));
  });
}

const r = await fetch(SNAP, { signal: AbortSignal.timeout(8000) }).catch((e) => { console.error("snapshot-fetch-fail:", String(e).slice(0, 120)); process.exit(0); });
const s = await r.json().catch(() => null);
if (!s || !s.ok && !s.supply) { console.error("snapshot-bad:", JSON.stringify(s)?.slice(0, 200)); process.exit(0); }

const doc = {
  schema: "saosx.token/1",
  publishedAt: new Date().toISOString(),
  source: "sovereign-token :3025 (signed ledger, secp256k1)",
  ...s,
};
const body = JSON.stringify(doc, null, 1);

/* pull רק-אם-העץ-נקי (עץ-מלוכלך = דלג; push יידחה-בכנות אם-יש-מירוץ — המחזור-הבא מנסה-שוב) */
try {
  const st = await sh(DOMAIN, ["status", "--porcelain"]);
  if (!st.trim()) await sh(DOMAIN, ["pull", "--rebase", "-X", "ours", "origin", "main"]).catch((e) => console.error("pull-warn:", String(e).slice(0, 120)));
} catch { /* כנה */ }
const fs = await import("node:fs");
fs.writeFileSync(`${DOMAIN}/token.json`, body);
await sh(DOMAIN, ["add", "token.json"]);
let dirty = true;
try { await sh(DOMAIN, ["diff", "--cached", "--quiet"]); dirty = false; } catch { dirty = true; }
if (!dirty) { console.log("no-changes"); process.exit(0); }
await sh(DOMAIN, ["commit", "-m", `saosx snapshot: seq=${s.lastSeq} supply=${s.supply} verifyOk=${s.verifyOk} [skip ci]`, "--", "token.json"]);
await sh(DOMAIN, ["push", "origin", "main"]);
console.log(`published token.json · seq=${s.lastSeq}`);
