/* claim-proof.ts — Task 23 · התביעה-החתומה על-ההפקדה-האמת (custom_json על השרשרת)
 * חוזה-מעטפת מלא (saos-live.js · cloud-beat verifyEnvelope):
 *   env = {v:1, id:"<ms>-<hex6>", by: saos1, pub: STM, k:"deposit.claim", cur, amt, ref: txid} + sig
 *   digest = sha256(canon(env פחות-sig)) · sig = hex65 [recid+31 || r32 || s32]
 * שידור: custom_json id=saos.weave.live.v1 · required_posting_auths=[hcsaosdep01]
 * אפס-סודות בפלט/גיט — הכל מהכספת (600). */
import dhive from "@hiveio/dhive";
import ellipticMod from "elliptic";
import { createHash, randomBytes } from "crypto";
import fs from "fs";

const RPC = "https://api.justyy.com";
const OP_ID = "saos.weave.live.v1";

const sha256 = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const canon = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
};

const proof = JSON.parse(fs.readFileSync("/home/z/.secrets/steem/deposit-proof.json", "utf8"));
const fresh = JSON.parse(fs.readFileSync("/home/z/.secrets/steem/fresh-account.json", "utf8"));
const account = fresh.name;
const postingWif = dhive.PrivateKey.fromSeed(account + "posting" + fresh.passes.posting);

const ref = proof.txids.deposit;
if (!ref) throw new Error("fail-closed: אין-txid-הפקדה בכספת");
const id = `${Date.now()}-${hex(randomBytes(6))}`;
const env: Record<string, unknown> = {
  v: 1, id, by: proof.saos1Addr, pub: proof.stmPub,
  k: "deposit.claim", cur: "STEEM", amt: 100, ref,
};
const digest = sha256(new TextEncoder().encode(canon(env)));
const ec = new (ellipticMod as unknown as { ec: new (curve: string) => object }).ec("secp256k1");
const key = ec.keyFromPrivate(proof.privHex, "hex");
const sig = key.sign(digest, { canonical: true, pers: undefined });
const r32 = Buffer.from(sig.r.toArray("be", 32));
const s32 = Buffer.from(sig.s.toArray("be", 32));
const compact = Buffer.concat([Buffer.from([(sig.recoveryParam ?? 0) + 31]), r32, s32]);
env.sig = hex(compact);

const client = new dhive.Client(RPC, { timeout: 20_000, chainId: "0".repeat(64) });
const op = ["custom_json", {
  required_auths: [], required_posting_auths: [account],
  id: OP_ID, json: JSON.stringify(env),
}];
const res = await client.broadcast.sendOperations([op], postingWif);
const txid = String((res as { id?: string })?.id ?? (res as { transaction_id?: string })?.transaction_id ?? "");
console.log(JSON.stringify({ ok: true, claimTxid: txid, envId: id, ref, by: proof.saos1Addr }, null, 1));
