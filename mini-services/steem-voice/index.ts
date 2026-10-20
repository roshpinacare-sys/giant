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
    return { account: get("STEEM_ACCOUNT"), postingWif: get("STEEM_POSTING_WIF_A"), activeWif: get("STEEM_ACTIVE_WIF_A") };
  } catch { return { account: "", postingWif: "", activeWif: "" }; }
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

/* ══ ESC-11 · הרגל-החוץ · מסילת-transfer ═══════════════════════════════════
 * POST /transfer {to, amount, memo?} → העברת-STEEM אמת-על-השרשרת (transfer op,
 * מפתח-ACTIVE מהכספת). זה-הקילומטר-האחרון של מסילת-הדיבידנד (µ→STEEM→בעלים).
 *
 * שערים-קשוחים (כל-אחד-כנה-ומתועד):
 *   T-1 · fail-closed בלי-מפתח-ACTIVE-חי
 *   T-2 · תקרת-נזק: ≤ MAX_TRANSFER_STEEM (env, ברירת-מחדל 1.000 STEEM) פר-קריאה
 *   T-3 · קצב: תהליך-אחד-לשעה (מפתח-כבד — השער-הוגן)
 *   T-4 · אפס-סודות: הקבלה-מתעדת txid/מספרים — לעולם-לא-מפתחות
 *   T-5 · כנות: כשל-RPC/אימות = הודעה-כנה, הכסף-לא-נזז */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const TRANSFER_RECEIPTS = "/home/z/my-project/mini-services/steem-voice/state/transfer-receipts.jsonl";
const MAX_TRANSFER_STEEM = Number(process.env.STEEM_VOICE_MAX_TRANSFER ?? 1.0);
const TRANSFER_COOLDOWN_MS = 60 * 60 * 1000;
let lastTransferAt = 0;
const tstats = { transfers: 0, transferErrors: 0, lastTransferAt: 0, lastTxid: "", lastTransfer: "" };

function assetOk(amount: string): { ok: boolean; value: number; asset: string; str: string } {
  const m = /^([0-9]+(\.[0-9]{1,3})?) (STEEM|SBD)$/.exec(String(amount ?? "").trim());
  if (!m) return { ok: false, value: 0, asset: "", str: "" };
  const value = Number(m[1]);
  const str = `${value.toFixed(3)} ${m[3]}`; // פורמט-גרפני-מחייב: 3-ספרות
  return { ok: value > 0 && value <= MAX_TRANSFER_STEEM, value, asset: m[3], str };
}

async function transfer(to: string, amount: string, memo: string) {
  if (!E.account || !E.activeWif) throw new Error("fail-closed: אין-כספת/מפתח-ACTIVE (T-1)");
  const a = assetOk(amount);
  if (!a.ok) throw new Error(`bad-amount (T-2: חייב "X.XXX STEEM|SBD" ≤ ${MAX_TRANSFER_STEEM})`);
  if (Date.now() - lastTransferAt < TRANSFER_COOLDOWN_MS) throw new Error("rate-limited: תהליך-אחד-לשעה (T-3)");
  const toOk = /^[a-z0-9][a-z0-9.-]{1,15}$/.test(String(to ?? ""));
  if (!toOk) throw new Error("bad-recipient");
  const c = getClient();
  const key = dhive.PrivateKey.fromString(E.activeWif);
  const ops = [["transfer", { from: E.account, to: String(to), amount: a.str, memo: String(memo ?? "").slice(0, 2000) }]];
  const res = await c.broadcast.sendOperations(ops, key);
  lastTransferAt = Date.now();
  tstats.transfers++; tstats.lastTransferAt = lastTransferAt;
  tstats.lastTxid = String(res?.id ?? "");
  tstats.lastTransfer = `${a.str} → ${to}`;
  try {
    mkdirSync(dirname(TRANSFER_RECEIPTS), { recursive: true });
    appendFileSync(TRANSFER_RECEIPTS, JSON.stringify({ schema: "STEEM-VOICE-TRANSFER/1", at: new Date().toISOString(), from: E.account, to, amount: a.str, txid: tstats.lastTxid, memo: String(memo ?? "").slice(0, 120) }) + "\n");
  } catch { /* קבלה-לעולם-לא-מפילה */ }
  return { txid: tstats.lastTxid, amount: a.str, to };
}

const srv = Bun.serve({
  port: PORT,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/health") {
      return Response.json({
        ok: true, service: "steem-voice", port: PORT,
        custody: keyOk() ? "כספת-חיה (4/4-הוכח)" : "fail-closed",
        activeKey: E.activeWif ? "חי (transfer-זמין)" : "fail-closed",
        account: E.account || "(חסר)", // שם-חשבון הוא ציבורי
        ...stats, transfers: tstats.transfers, lastTxid: tstats.lastTxid || null,
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
    if (u.pathname === "/transfer" && req.method === "POST") {
      try {
        const b = await req.json().catch(() => ({}));
        const r = await transfer(String(b.to ?? ""), String(b.amount ?? ""), String(b.memo ?? ""));
        return Response.json({ ok: true, ...r });
      } catch (e) {
        tstats.transferErrors++; 
        return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }, { status: 200 });
      }
    }
    return Response.json({ ok: false, error: "not-found" }, { status: 404 });
  },
});
console.log(`[steem-voice] חי על :${PORT} · חשבון=${E.account ? E.account : "fail-closed"} · כספת=${keyOk() ? "חיה" : "חסרה"}`);
