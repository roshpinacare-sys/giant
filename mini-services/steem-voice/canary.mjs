#!/usr/bin/env bun
/* קנרית-ESC-11 — הוכחת-מסילה בסקריפט-עצמאי (השירות-מת-בשקת-בשידור — תופסים-את-השגיאה-כאן)
 * 0.001 STEEM headcorner→headcorner · אפס-תזוזת-כסף · הוכחת-חתימה+שידור+אימות-מלאים */
import dhive from "@hiveio/dhive";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ENV_FILE = "/home/z/.secrets/.env.local";
const RPC = process.env.STEEM_RPC ?? "https://api.steemit.com";
const RECEIPT = "/home/z/my-project/mini-services/steem-voice/state/canary-receipts.jsonl";

const txt = readFileSync(ENV_FILE, "utf8").replace(/\r/g, "");
const get = (k) => {
  const lines = txt.split("\n").filter((l) => l.startsWith(`${k}=`));
  return lines.length ? lines[lines.length - 1].slice(k.length + 1).trim().replace(/^["']|["']$/g, "") : "";
};
const account = get("STEEM_ACCOUNT");
const activeWif = get("STEEM_ACTIVE_WIF_A");
if (!account || !activeWif) { console.log("fail-closed: אין-כספת"); process.exit(1); }

const STEEM_CHAIN_ID = "0".repeat(64);
const c = new dhive.Client(RPC, { timeout: 15_000, chainId: STEEM_CHAIN_ID });
const key = dhive.PrivateKey.fromString(activeWif);

// מדידה-כנה לפני: יתרת-השמורת-אמת
const [acc] = await c.database.getAccounts([account]);
console.log(`custody ${account}: ${acc.balance} STEEM · ${acc.sbd_balance} SBD`);

const ops = [["transfer", {
  from: account, to: account, amount: "0.001 STEEM",
  memo: "ESC-11 rail canary | SAOS sovereign dividend lane | zero-value self-transfer proof",
}]];
console.log("broadcasting…");
try {
  const res = await c.broadcast.sendOperations(ops, key);
  console.log("RESULT:", JSON.stringify(res?.id ?? res).slice(0, 120));
  // אימות-בלתי-תלוי: מציאת-ה-txid-בהיסטוריית-החשבון
  const txid = String(res?.id ?? "");
  let verified = false;
  if (txid) {
    await new Promise((r) => setTimeout(r, 2500));
    const hist = await c.call("condenser_api", "get_account_history", [account, -1, 10]);
    for (const [, ev] of (hist ?? [])) {
      const t = ev?.op?.[1];
      if (ev?.op?.[0] === "transfer" && t?.amount === "0.001 STEEM" && t?.memo?.includes("ESC-11")) {
        if (String(ev.trx_id) === txid) verified = true;
      }
    }
  }
  console.log(`verified-in-account-history: ${verified}`);
  try {
    mkdirSync(dirname(RECEIPT), { recursive: true });
    appendFileSync(RECEIPT, JSON.stringify({ schema: "ESC11-CANARY/1", at: new Date().toISOString(), account, txid, verified, custodyBefore: acc.balance }) + "\n");
  } catch { /* כנה */ }
} catch (e) {
  console.log("BROADCAST-ERROR:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
}
