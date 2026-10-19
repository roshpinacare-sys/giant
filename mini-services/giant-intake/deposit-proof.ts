/* deposit-proof.ts — Task 23 · הוכחת-רכבת-הפקדות STEEM→רשת (אמת-מלאה, idempotent)
 * ═══════════════════════════════════════════════════════════════════════════
 * נמדד-חי (2026-10-19): יצירת-לקוחות-dhive מרובים-בתהליך מפילה-את-bun בשתיקה —
 * המגדל משדר-בהצלחה-רק-עם לקוח-יחיד-חם (getClient ממומש). עתה: אותו-דפוס בדיוק.
 * כספת-נכתבת-לפני-השידורים — מוות-שקט לא אובד-חומר-מפתח.
 */
import dhive from "@hiveio/dhive";
import bs58 from "bs58";
import ellipticMod from "elliptic";
import { createHash, randomBytes } from "crypto";
import fs from "fs";

const RPC = "https://api.justyy.com"; // השידור-על-api.steemit.com תלוי (נמדד)
const VAULT_OUT = "/home/z/.secrets/steem/deposit-proof.json";
const ENV_LOCAL = "/home/z/.secrets/.env.local";
const FUND = 100;
const NEW_ACCOUNT = "hcsaosdep01";

const sha256 = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());
const rmd160 = (b: Uint8Array) => new Uint8Array(createHash("ripemd160").update(b).digest());
const cat = (...bs: Uint8Array[]) => {
  const total = bs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bs) { out.set(b, o); o += b.length; }
  return out;
};
function loadEnvName(path: string, name: string): string {
  const m = fs.readFileSync(path, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!m) throw new Error(`fail-closed: ${name} לא נמצא בכספת`);
  return m[1].trim();
}
function loadFreshActive(account: string): string {
  const d = JSON.parse(fs.readFileSync("/home/z/.secrets/steem/fresh-account.json", "utf8"));
  if (d.name !== account) throw new Error(`fail-closed: כספת-fresh היא של ${d.name} לא ${account}`);
  return dhive.PrivateKey.fromSeed(account + "active" + d.passes.active).toString();
}

/* ── זוג-saos1 ── */
const ec = new (ellipticMod as unknown as { ec: new (curve: string) => object }).ec("secp256k1");
let privHex = "";
let pub33 = new Uint8Array(33);
for (let i = 0; i < 8; i++) {
  const cand = randomBytes(32);
  const k = ec.keyFromPrivate(Array.from(cand));
  if (k.getPrivate().cmp(ec.curve.n) < 0 && !k.getPrivate().isZero()) {
    privHex = cand.toString("hex");
    pub33 = new Uint8Array(k.getPublic().encode("array", true));
    break;
  }
}
if (!privHex) throw new Error("keygen-failed");
const stmPub = "STM" + bs58.encode(cat(pub33, rmd160(sha256(pub33)).slice(0, 4)));
const payload = rmd160(sha256(pub33));
const addr = "saos1" + bs58.encode(cat(payload, sha256(sha256(payload)).slice(0, 4)));

/* ── כספת לפני-הכל ── */
if (!fs.existsSync(VAULT_OUT)) {
  fs.writeFileSync(VAULT_OUT, JSON.stringify({ at: new Date().toISOString(), privHex, stmPub, saos1Addr: addr, txids: {} as Record<string, string> }, null, 1), { mode: 0o600 });
  fs.chmodSync(VAULT_OUT, 0o600);
}
const vault = JSON.parse(fs.readFileSync(VAULT_OUT, "utf8"));

/* ── לקוח-יחיד-חם (דפוס-המגדל) ── */
const client = new dhive.Client(RPC, { timeout: 20_000, chainId: "0".repeat(64) });
async function send(from: string, wif: string, to: string, amount: string, memo: string): Promise<string> {
  const key = dhive.PrivateKey.fromString(wif);
  const res = await client.broadcast.sendOperations([["transfer", { from, to, amount, memo }]], key);
  const txid = String((res as { id?: string })?.id ?? (res as { transaction_id?: string })?.transaction_id ?? "");
  if (!txid) throw new Error("broadcast-no-txid-in-response");
  console.info(`[proof] sent ${from}→${to} ${amount}`);
  return txid;
}
async function findLanded(from: string, to: string, amount: string): Promise<string | null> {
  try {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "condenser_api.get_account_history", params: [from, -1, 20] }),
      signal: AbortSignal.timeout(12_000),
    });
    const j = await r.json();
    for (const [, ev] of (j?.result ?? []) as Array<[number, { op: [string, Record<string, string>]; trx_id: string }]>) {
      if (ev.op?.[0] !== "transfer") continue;
      const b = ev.op[1];
      if (b.from === from && b.to === to && b.amount === amount) return ev.trx_id;
    }
  } catch { /* fail-honest */ }
  return null;
}

const headWif = loadEnvName(ENV_LOCAL, "STEEM_ACTIVE_WIF_A");
const depWif = loadFreshActive(NEW_ACCOUNT);

/* 1. מימון (idempotent — אם-כבר-נחת, לא-שולחים-שוב) */
let tx1 = vault.txids?.fund ?? "";
if (!tx1) {
  const landed = await findLanded("headcorner", NEW_ACCOUNT, `${FUND}.000 STEEM`);
  if (landed) { tx1 = landed; console.info("[proof] funding already landed"); }
  else tx1 = await send("headcorner", headWif, NEW_ACCOUNT, `${FUND}.000 STEEM`, "task23 deposit-rail funding (operator proof)");
  vault.txids.fund = tx1; fs.writeFileSync(VAULT_OUT, JSON.stringify(vault, null, 1), { mode: 0o600 });
}
console.info("[proof] fund txid:", tx1.slice(0, 18));

/* 2. הפקדה אמת (idempotent) */
let tx2 = vault.txids?.deposit ?? "";
if (!tx2) {
  const landed = await findLanded(NEW_ACCOUNT, "headcorner", `${FUND}.000 STEEM`);
  if (landed) { tx2 = landed; console.info("[proof] deposit already landed"); }
  else tx2 = await send(NEW_ACCOUNT, depWif, "headcorner", `${FUND}.000 STEEM`, addr);
  vault.txids.deposit = tx2; fs.writeFileSync(VAULT_OUT, JSON.stringify(vault, null, 1), { mode: 0o600 });
}
console.info("[proof] deposit txid:", tx2.slice(0, 18));

console.log(JSON.stringify({ ok: true, saos1Addr: vault.saos1Addr, stmPub: vault.stmPub, fundTxid: tx1, depositTxid: tx2 }, null, 1));
