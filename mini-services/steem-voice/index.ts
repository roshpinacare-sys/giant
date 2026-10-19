/* ESC-14-c · ריצה תחת node (--watch): ה-native secp256k1 של dhive נבנה ל-ABI של node
 * ומפיל תהליך-bun על symbol-error (נמדד 3 פעמים חי 17:0xZ). המרה ל-node:http — עובד
 * תחת-שניהם; ההשקה בפועל: node --watch index.ts. */
/**
 * steem-voice — ערוץ-הקול-החוץ-הריבוני על בלוקצ'יין-steem (אמת-אמיתית)
 * ═════════════════════════════════════════════════════════════════════════════
 * מקור-המפתח: /home/z/.secrets/.env.local (הכספת · STEEM_ACCOUNT + STEEM_POSTING_WIF_A)
 * המשמורת הוכחה חיה: 4/4 MATCH מול-סמכויות-השרשרת (state/custody/steem-custody.jsonl)
 *
 * POST /broadcast {title, body, tags?} → פרסום-אמת על-השרשרת (comment op)
 * GET  /state   → מצב-הערוץ (בלי-סודות)
 * כלל-אמת: אפס-ערכי-מפתחות בלוגים/תשובות. fail-closed בלי-כספת.
 */
import fs from "fs";
import http from "node:http";
import dhive from "@hiveio/dhive";

const PORT = Number(process.env.STEEM_VOICE_PORT ?? 3023);
const ENV_FILE = "/home/z/.secrets/.env.local";
const RPC = process.env.STEEM_RPC ?? "https://api.steemit.com";

function readEnv() {
  try {
    const txt = fs.readFileSync(ENV_FILE, "utf8").replace(/\r/g, "");
    const get = (k) => {
      const lines = txt.split("\n").filter((l) => l.startsWith(`${k}=`));
      if (!lines.length) return "";
      return lines[lines.length - 1].slice(k.length + 1).trim().replace(/^["']|["']$/g, ""); // כמו source: שורה-אחרונה גוברת
    };
    return { account: get("STEEM_ACCOUNT"), postingWif: get("STEEM_POSTING_WIF_A") };
  } catch { return { account: "", postingWif: "" }; }
}
const E = readEnv();
let client = null;
/* חוק-החתימה (נמדד-חי 2026-10-18): @hiveio/dhive חותם כבררת-מחדל עם chain-id של
 * HIVE (beeab0de…) — השידור ל-STEEM (chain-id אפסים) נדחה "Missing Posting Authority"
 * גם-כשהמפתח-מוכח-נכון. התיקון: chainId אפסים של STEEM. */
const STEEM_CHAIN_ID = "0000000000000000000000000000000000000000000000000000000000000000";
function getClient() {
  if (!client) client = new dhive.Client(RPC, { timeout: 15_000, chainId: STEEM_CHAIN_ID });
  return client;
}
const stats = { startedAt: Date.now(), broadcasts: 0, errors: 0, lastErr: "", lastAt: 0, lastPermlink: "" };

function keyOk() { return Boolean(E.account && E.postingWif); }

async function broadcast(title, body, tags) {
  if (!keyOk()) throw new Error("fail-closed: אין-כספת/מפתח-פרסום");
  const c = getClient();
  const key = dhive.PrivateKey.fromString(E.postingWif);
  const now = new Date();
  const permlink = `sv-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.getTime().toString(36)}`;
  const parentPermlink = (tags && tags[0] ? String(tags[0]) : "saos").toLowerCase().replace(/[^a-z0-9-]/g, "") || "saos";
  const ops = [
    [
      "comment",
      {
        parent_author: "",
        parent_permlink: parentPermlink,
        author: E.account,
        permlink,
        title: String(title).slice(0, 200),
        body: String(body).slice(0, 60_000),
        json_metadata: JSON.stringify({ tags: tags && tags.length ? tags : ["saos"], app: "saos-sovereign-voice" }),
      },
    ],
  ];
  const res = await c.broadcast.sendOperations(ops, key);
  stats.broadcasts++; stats.lastAt = Date.now(); stats.lastPermlink = permlink;
  return { permlink, parentPermlink, blockInfo: res?.id ?? null };
}

const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (u.pathname === "/health") {
    return json(res, 200, {
      ok: true, service: "steem-voice", port: PORT,
      custody: keyOk() ? "כספת-חיה (4/4-הוכח)" : "fail-closed",
      account: E.account || "(חסר)", // שם-חשבון הוא ציבורי
      ...stats,
    });
  }
  if (u.pathname === "/state") {
    return json(res, 200, { ok: true, account: E.account || null, rpc: RPC, ...stats });
  }
  if (u.pathname === "/broadcast" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const b = JSON.parse(body || "{}");
        const title = String(b.title ?? "").trim();
        const bbody = String(b.body ?? "").trim();
        if (!title || !bbody) return json(res, 200, { ok: false, error: "title+body-required" });
        const r = await broadcast(title, bbody, Array.isArray(b.tags) ? b.tags.map(String) : undefined);
        return json(res, 200, { ok: true, ...r, url: `https://steemit.com/@${E.account}/${r.permlink}` });
      } catch (e) {
        stats.errors++; stats.lastErr = String(e?.message ?? e).slice(0, 200);
        return json(res, 200, { ok: false, error: stats.lastErr });
      }
    });
    return;
  }
  return json(res, 404, { ok: false, error: "not-found" });
});
srv.listen(PORT, "127.0.0.1");
console.log(`[steem-voice] חי על :${PORT} · חשבון=${E.account ? E.account : "fail-closed"} · כספת=${keyOk() ? "חיה" : "חסרה"}`);
