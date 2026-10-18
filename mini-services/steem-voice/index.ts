#!/usr/bin/env bun
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
function getClient() {
  if (!client) client = new dhive.Client(RPC, { timeout: 15_000 });
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

const srv = Bun.serve({
  port: PORT,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/health") {
      return Response.json({
        ok: true, service: "steem-voice", port: PORT,
        custody: keyOk() ? "כספת-חיה (4/4-הוכח)" : "fail-closed",
        account: E.account || "(חסר)", // שם-חשבון הוא ציבורי
        ...stats,
      });
    }
    if (u.pathname === "/state") {
      return Response.json({ ok: true, account: E.account || null, rpc: RPC, ...stats });
    }
    if (u.pathname === "/broadcast" && req.method === "POST") {
      try {
        const b = await req.json().catch(() => ({}));
        const title = String(b.title ?? "").trim();
        const body = String(b.body ?? "").trim();
        if (!title || !body) return Response.json({ ok: false, error: "title+body-required" }, { status: 200 });
        const r = await broadcast(title, body, Array.isArray(b.tags) ? b.tags.map(String) : undefined);
        return Response.json({ ok: true, ...r, url: `https://steemit.com/@${E.account}/${r.permlink}` });
      } catch (e) {
        stats.errors++; stats.lastErr = String(e?.message ?? e).slice(0, 200);
        return Response.json({ ok: false, error: stats.lastErr }, { status: 200 });
      }
    }
    return Response.json({ ok: false, error: "not-found" }, { status: 404 });
  },
});
console.log(`[steem-voice] חי על :${PORT} · חשבון=${E.account ? E.account : "fail-closed"} · כספת=${keyOk() ? "חיה" : "חסרה"}`);
