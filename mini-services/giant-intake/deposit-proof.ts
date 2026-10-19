/* deposit-proof.ts — Task 23 · הוכחת-רכבת-הפקדות STEEM→רשת (אמת-מלאה, רץ-פעם-אחת)
 * ═══════════════════════════════════════════════════════════════════════════
 * רצף (הכל על השרשרת האמתית, אפס-טסטנט):
 *   1. זוג-מפתחות saos1 חדש — אותו-חוזה קריפטוגרפי של saos-live/envelope.ts:
 *      pub33 (secp256k1 מכווץ) → STM-pub (bs58+ripemd160(sha256)) → כתובת
 *      saos1 = bs58(rmd160(sha256(pub33)) + sha256(sha256(payload))[:4]).
 *   2. מימון headcorner→cashmachine 100 STEEM — העברת-מפעיל (funding-shape,
 *      דפוס operator→xfer@* המותר-בדוקטרינת-הביקורת; נמדד ומתועד בוורקלוג).
 *   3. הפקדה אמת: cashmachine→headcorner 100 STEEM עם ממוא = כתובת-ה-saos1
 *      (בדיוק מה שהארנק הציבורי מורה למשתמשים). צורת-חוץ→משמורת.
 * אפס-סודות בפלט/בגיט: המפתח-הפרטי נשמר-בכספת בלבד (chmod 600, מחוץ-לעץ-האטימה).
 */
import dhive from "@hiveio/dhive";
import bs58 from "bs58";
import ellipticMod from "elliptic";
import { createHash, randomBytes } from "crypto";
import fs from "fs";

const RPCS = ["https://api.steemit.com", "https://api.justyy.com", "https://steem-api.linuxcoding.com"];
const VAULT_OUT = "/home/z/.secrets/steem/deposit-proof.json";
const ENV_LOCAL = "/home/z/.secrets/.env.local";
const ARMY = "/home/z/.secrets/steem/army-keys.json";
const FUND = 100; // STEEM — מעל רף-האבק (96) ובתוך-תקרת-הזיכוי-האוטומטי ($5.18 מול 250)

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
function loadArmyActive(account: string): string {
  const d = JSON.parse(fs.readFileSync(ARMY, "utf8"));
  const acc = (d.accounts ?? []).find((a: { name: string }) => a.name === account);
  const wif = acc?.gens?.map((g: { activeWif?: string }) => g.activeWif).find(Boolean);
  if (!wif) throw new Error(`fail-closed: אין-activeWif ל-${account} בכספת`);
  return wif;
}

/* ── 1. זוג-saos1 ── */
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

/* ── 2+3. העברות אמת ── */
const headWif = loadEnvName(ENV_LOCAL, "STEEM_ACTIVE_WIF_A");
const cashWif = loadArmyActive("cashmachine");

async function send(from: string, wif: string, to: string, amount: string, memo: string): Promise<string> {
  let lastErr: unknown = null;
  for (const rpc of RPCS) {
    try {
      const client = new dhive.Client(rpc, { timeout: 15_000, chainId: "0".repeat(64) });
      const key = dhive.PrivateKey.fromString(wif);
      const res = await client.broadcast.sendOperations([["transfer", { from, to, amount, memo }]], key);
      const txid = String((res as { id?: string })?.id ?? (res as { transaction_id?: string })?.transaction_id ?? "");
      if (!txid) throw new Error("broadcast-no-txid-in-response");
      console.info(`[proof] sent via ${rpc}`);
      return txid;
    } catch (e) {
      lastErr = e;
      console.error(`[proof] broadcast-fail ${rpc}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      // לפני-הניסיון-הבא: ייתכן שהשידור כן נחת — בודקים את ההיסטוריה במקום לשדר כפול
      const landed = await findRecentTransfer(from, to, amount);
      if (landed) { console.info(`[proof] tx landed-despite-error via ${rpc}: ${landed}`); return landed; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function findRecentTransfer(from: string, to: string, amount: string): Promise<string | null> {
  for (const rpc of RPCS) {
    try {
      const r = await fetch(rpc, {
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
    } catch { /* מקור-הבא */ }
  }
  return null;
}

const fundMemo = "task23 deposit-rail funding (operator proof)";
console.info(`[proof] funding headcorner→cashmachine ${FUND}.000 STEEM …`);
const tx1 = await send("headcorner", headWif, "cashmachine", `${FUND}.000 STEEM`, fundMemo);
await new Promise((r) => setTimeout(r, 4_000)); // נחיתה-להיסטוריה
console.info(`[proof] deposit cashmachine→headcorner ${FUND}.000 STEEM memo=saos1… …`);
const tx2 = await send("cashmachine", cashWif, "headcorner", `${FUND}.000 STEEM`, addr);
/* ── כספת ── */
const vault = { at: new Date().toISOString(), privHex, stmPub, saos1Addr: addr, txids: { fund: tx1, deposit: tx2 }, fundMemo };
fs.writeFileSync(VAULT_OUT, JSON.stringify(vault, null, 1), { mode: 0o600 });
fs.chmodSync(VAULT_OUT, 0o600);

/* פלט-ציבורי בלבד */
console.log(JSON.stringify({ ok: true, saos1Addr: addr, stmPub, fundTxid: tx1, depositTxid: tx2 }, null, 1));
