#!/usr/bin/env bun
/**
 * steem-voice — ערוץ-הקול-החוץ-הריבוני על בלוקצ'יין-steem (אמת-אמיתית)
 * ═════════════════════════════════════════════════════════════════════════════
 * מקור-המפתח: /home/z/.secrets/.env.local (הכספת · STEEM_ACCOUNT + STEEM_POSTING_WIF_A)
 * המשמורת הוכחה חיה: 4/4 MATCH מול-סמכויות-השרשרת (state/custody/steem-custody.jsonl)
 *
 * POST /broadcast {title, body, tags?} → פרסום-אמת על-השרשרת (comment op)
 * POST /transfer  {to, amount, asset?, memo?} → משיכה-אמת-על-השרשרת (transfer op · ESC-11 דיבידנד-OUT)
 * GET  /state   → מצב-הערוץ (בלי-סודות)
 * כלל-אמת: אפס-ערכי-מפתחות בלוגים/תשובות. fail-closed בלי-כספת.
 *
 * ESC-11 (2026-10-19 trace 1a1547818a6c0e55): מסילת-המשיכה-לבעלים — הכספת-נשחזרה
 * מהמקור-הגיט-המוכח (roshpinacare-sys/steem@main/.secrets — טביעות-אצבע-מתועדות,
 * posting-cashmachine מאומת-חי מול-השרשרת). המפתח-active-אינו-הסמכות-החיה (REQ-0008
 * פתוח — נמדד: 0/13 חשבונות-צי מחזיקים-active-חי) → /transfer fail-closed-כנה עד-שהבעלים
 * ימסור סמכות-חיה. תקרות-קשיחות-בקוד: סכום-בודד ≤ 5 STEEM · יומי ≤ 20 STEEM ·
 * יעד-לרשימה-לבנה-בלבד (ריק = כל-יעד-אסור — fail-closed ברירת-מחדל).
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
const stats = { startedAt: Date.now(), broadcasts: 0, errors: 0, lastErr: "", lastAt: 0, lastPermlink: "", transfers: 0, lastTransferAt: 0, lastTransfer: "" };

/* ESC-11 · כספת-חיה-פר-פעולה — הקריאה-טרייה-בכל-פעולה (הכספת-עלולה-להשתקם-בלי-אתחול) */
function keyOk() { const e = readEnv(); return Boolean(e.account && e.postingWif); }
function activeOk() { const e = readEnv(); return Boolean(e.account && e.activeWif); }

/* ── ESC-11 · תקרות-משיכה-קשיחות (בקוד — לא-ניתנות-לעקיפה-מרשת) ── */
const WITHDRAW = { maxPerOpSteem: 5, maxPerDaySteem: 20, allowlist: new Set<string>(["headcorner"]) };
const dayKey = () => new Date().toISOString().slice(0, 10);
let withdrawnToday = { day: dayKey(), steem: 0 };
function budgetLeft() { if (withdrawnToday.day !== dayKey()) return WITHDRAW.maxPerDaySteem; return Math.max(0, WITHDRAW.maxPerDaySteem - withdrawnToday.steem); }

async function transfer(to: string, amount: number, asset: "STEEM" | "SBD", memo: string) {
  const e = readEnv(); // כספת-חיה
  if (!e.account || !e.activeWif) throw new Error("fail-closed: אין-סמכות-active-חיה בכספת (REQ-0008 — נמדד 0/13; הבעלים חייב למסור מפתח-active תקף)");
  if (!WITHDRAW.allowlist.has(to)) throw new Error(`fail-closed: יעד ${to} מחוץ-לרשימה-הלבנה (${[...WITHDRAW.allowlist].join(",")})`);
  if (!(amount > 0)) throw new Error("amount-חייב-חיובי");
  if (amount > WITHDRAW.maxPerOpSteem) throw new Error(`fail-closed: ${amount} > תקרת-op ${WITHDRAW.maxPerOpSteem} STEEM`);
  if (amount > budgetLeft()) throw new Error(`fail-closed: ${amount} > תקרת-יומית-נותרת ${budgetLeft()} STEEM`);
  const c = getClient();
  const key = dhive.PrivateKey.fromString(e.activeWif);
  const ops = [[
    "transfer",
    { from: e.account, to, amount: `${amount.toFixed(3)} ${asset}`, memo: String(memo).slice(0, 200) },
  ]];
  const res = await c.broadcast.sendOperations(ops, key);
  if (withdrawnToday.day !== dayKey()) withdrawnToday = { day: dayKey(), steem: 0 };
  withdrawnToday.steem += amount;
  stats.transfers++; stats.lastTransferAt = Date.now(); stats.lastTransfer = `${amount.toFixed(3)} ${asset} → ${to}`;
  return { txid: res?.id ?? null, from: e.account, to, amount: `${amount.toFixed(3)} ${asset}` };
}

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
      const e = readEnv();
      return Response.json({
        ok: true, service: "steem-voice", port: PORT,
        custody: keyOk() ? "כספת-חיה (posting-מאומת-גיט·טביעות)" : "fail-closed",
        transferCustody: activeOk() ? "active-חי" : "fail-closed (REQ-0008: 0/13 active-חי בכספת)",
        account: e.account || "(חסר)", // שם-חשבון הוא ציבורי
        ...stats,
      });
    }
    if (u.pathname === "/state") {
      const e = readEnv();
      return Response.json({ ok: true, account: e.account || null, rpc: RPC, withdrawCaps: { maxPerOpSteem: WITHDRAW.maxPerOpSteem, maxPerDaySteem: WITHDRAW.maxPerDaySteem, allowlist: [...WITHDRAW.allowlist], leftTodaySteem: budgetLeft() }, ...stats });
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
        const to = String(b.to ?? "").trim().toLowerCase();
        const amount = Number(b.amount ?? 0);
        const asset = String(b.asset ?? "STEEM").toUpperCase() === "SBD" ? "SBD" as const : "STEEM" as const;
        const memo = String(b.memo ?? "");
        if (!to) return Response.json({ ok: false, error: "to-required" }, { status: 200 });
        const r = await transfer(to, amount, asset, memo);
        return Response.json({ ok: true, ...r });
      } catch (e) {
        stats.errors++; stats.lastErr = String(e?.message ?? e).slice(0, 220);
        return Response.json({ ok: false, error: stats.lastErr }, { status: 200 });
      }
    }
    return Response.json({ ok: false, error: "not-found" }, { status: 404 });
  },
});
console.log(`[steem-voice] חי על :${PORT} · חשבון=${E.account ? E.account : "fail-closed"} · כספת=${keyOk() ? "חיה" : "חסרה"}`);
