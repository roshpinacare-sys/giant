/* publish-feed.mjs — מוציא-פיד-המחיר-הריבוני ל-Console Pages
 * מקור-האמת: mini-services/giants-anchor/state/anchor-log.jsonl (בינאנס-אמת, כל-60ש׳).
 * מטרה (Task 23): פעימת-הענן על Actions נחסמת-שיטתית-מול-מקורות-המחיר (429/blocks)
 * → האורגניזם-מודד-בעצמו-ומפרסם; הענן-צורך כמקור-עגינה אחד-מתוך-כמה (median+MAD
 * לא-מאפשר-למקור-יחיד-להטות). fail-honest · אפס-סודות · דילוג-כנה-כשאין-שינוי. */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ANCHOR_LOG = "/home/z/my-project/mini-services/giants-anchor/state/anchor-log.jsonl";
const DOMAIN = "/home/z/work/console";
const OUT = path.join(DOMAIN, "dex", "feed.json");

function sh(dir, args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: dir, timeout: 60_000, maxBuffer: 4_000_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).slice(0, 300))) : resolve(stdout));
  });
}

function lastAnchor() {
  const raw = fs.readFileSync(ANCHOR_LOG, "utf8").trim().split("\n").filter(Boolean);
  for (let i = raw.length - 1; i >= 0; i--) {
    try { return JSON.parse(raw[i]); } catch { /* שורה-קרועה — אחורה */ }
  }
  throw new Error("no-anchor-entry");
}

const snap = lastAnchor();
const prices = snap?.prices ?? {};
const pick = (k) => {
  const p = prices[k];
  return p && typeof p.usdt === "number" && p.usdt > 0 ? { usd: p.usdt, src: p.src ?? "binance", at: p.at ?? snap.at } : null;
};
const doc = {
  schema: "saos.feed/1",
  publishedAt: new Date().toISOString(),
  source: "giants-anchor :3023 (binance live, measured by the sovereign organism)",
  prices: { steem: pick("STEEM"), hive: pick("HIVE"), btc: pick("BTC"), eth: pick("ETH") },
};
doc.fresh = Object.values(doc.prices).some(Boolean);
if (!doc.fresh) { console.error("feed-bad: no usable prices"); process.exit(0); }
const body = JSON.stringify(doc, null, 1);

try {
  const st = await sh(DOMAIN, ["status", "--porcelain"]);
  if (!st.trim()) await sh(DOMAIN, ["pull", "--rebase", "-X", "ours", "origin", "main"]).catch((e) => console.error("pull-warn:", String(e).slice(0, 120)));
} catch { /* כנה */ }
fs.writeFileSync(OUT, body);
await sh(DOMAIN, ["add", "dex/feed.json"]);
let dirty = true;
try { await sh(DOMAIN, ["diff", "--cached", "--quiet"]); dirty = false; } catch { dirty = true; }
if (!dirty) { console.log("no-changes"); process.exit(0); }
const steemUsd = doc.prices.steem?.usd ?? "?";
await sh(DOMAIN, ["commit", "-m", `saos feed: steem=${steemUsd} (organism-measured, binance live) [skip ci]`, "--", "dex/feed.json"]);
await sh(DOMAIN, ["push", "origin", "main"]);
console.log(`published dex/feed.json · steem=${steemUsd}`);
