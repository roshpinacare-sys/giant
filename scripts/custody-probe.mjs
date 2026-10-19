#!/usr/bin/env bun
/**
 * custody-probe.mjs — אימות-משמורת steem חי (חוק-graphene)
 * WIF → secp256k1 → pubkey → שווה-מול-סמכות-השרשרת של החשבון.
 * מדפיס טביעות-אצבע בלבד — אפס חומר-מפתח בפלט.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrivateKey } from "@hiveio/dhive";

const ENV_FILE = "/home/z/.secrets/.env.local";
const RPC = "https://api.steemit.com";

const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8").replace(/\r/g, "").split("\n")
    .map((l) => l.split("=", 2))
    .filter((p) => p.length === 2 && /^[A-Z_0-9]+$/.test(p[0]))
);

const ACCOUNT = env.STEEM_ACCOUNT;
const fams = [
  ["owner", "STEEM_OWNER_WIF_A"],
  ["active", "STEEM_ACTIVE_WIF_A"],
  ["posting", "STEEM_POSTING_WIF_A"],
  ["memo", "STEEM_MEMO_WIF_A"],
];

const rpcCall = async (method, params) => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const j = await r.json();
  return j.result;
};

const acc = await rpcCall("condenser_api.get_accounts", [[ACCOUNT]]);
if (!acc?.length) {
  console.log(JSON.stringify({ verdict: "ACCOUNT-NOT-FOUND", account: ACCOUNT }));
  process.exit(1);
}

const authOf = (a, role) => {
  const out = a[role]?.key_auths?.[0]?.[0] ?? null;
  return out;
};

const fp = (k) => createHash("sha256").update(k).digest("hex").slice(0, 12);

const results = [];
for (const [role, slot] of fams) {
  const wif = env[slot];
  if (!wif) { results.push({ role, slot, verdict: "SLOT-MISSING" }); continue; }
  let pub = null;
  try { pub = PrivateKey.fromString(wif).createPublic().toString(); }
  catch (e) { results.push({ role, slot, verdict: "WIF-INVALID", err: String(e).slice(0, 40) }); continue; }
  const chainKey = authOf(acc[0], role);
  const match = chainKey === pub;
  results.push({
    role, slot,
    verdict: match ? "MATCH" : (chainKey ? "MISMATCH" : "NO-CHAIN-KEY"),
    pubFp: fp(pub),
    chainFp: chainKey ? fp(chainKey) : null,
  });
}

const matches = results.filter((r) => r.verdict === "MATCH").length;
console.log(JSON.stringify({
  verdict: `${matches}/4 MATCH`,
  account: ACCOUNT,
  steemPowerVests: acc[0].vesting_shares,
  balance: acc[0].balance,
  sbd: acc[0].sbd_balance,
  results,
  at: new Date().toISOString(),
}, null, 1));
process.exit(matches >= 3 ? 0 : 2);
