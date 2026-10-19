/**
 * patch-secp.ts — preflight: quarantine the bun-crashing native secp256k1
 * binding and install the pure-JS SAOS shim (SAOS-SECP-SHIM-v1).
 * Idempotent: skips when the shim marker is present. Requires `elliptic`
 * and `bn.js` resolvable from this service's node_modules (bun add elliptic).
 * חוק-אמת (2026-10-18): הבינארי הנייטיב מוגדר מול node::Buffer — מפיל את
 * תהליך-ה-bun בעת-חתימה. ה-shim מיישם בדיוק את 8 הפונקציות ש-dhive צורך.
 */
import fs from "fs";
import path from "path";

const PKG = path.join(import.meta.dir, "node_modules", "secp256k1");
const IDX = path.join(PKG, "index.js");
const NATIVE = path.join(PKG, "build", "Release", "secp256k1.node");

const SHIM = `/* SAOS-SECP-SHIM-v1 (pure-JS, elliptic) — replaces native binding that
 * crashes bun (undefined symbol: _ZN4node6Buffer). See patch-secp.ts. */
"use strict";
const EC = require("elliptic").ec;
const BN = require("bn.js");
const ec = new EC("secp256k1");
const toBuf = (x) => Buffer.isBuffer(x) ? x : Buffer.from(x);
const pad32 = (bn) => Buffer.from(bn.toString(16).padStart(64, "0"), "hex");
function publicKeyVerify(p) { try { ec.curve.decodePoint(toBuf(p)); return true; } catch { return false; } }
function publicKeyConvert(p, c = true) { return Buffer.from(ec.curve.decodePoint(toBuf(p)).encode("array", c !== false)); }
function publicKeyCreate(k, c = true) { return Buffer.from(ec.keyFromPrivate(toBuf(k)).getPublic().encode("array", c !== false)); }
function publicKeyTweakMul(p, t, c = true) { return Buffer.from(ec.curve.decodePoint(toBuf(p)).mul(new BN(toBuf(t))).encode("array", c !== false)); }
function privateKeyVerify(k) { const b = toBuf(k); if (b.length !== 32) return false; const x = new BN(b); return x.cmpn(0) > 0 && x.cmp(ec.curve.n) < 0; }
function sign(m, k) { const s = ec.keyFromPrivate(toBuf(k)).sign(toBuf(m), { canonical: true }); return { signature: Buffer.concat([pad32(s.r), pad32(s.s)]), recovery: s.recoveryParam }; }
function verify(m, sig, p) { try { const b = toBuf(sig); return ec.keyFromPublic(toBuf(p)).verify(toBuf(m), { r: new BN(b.slice(0, 32)), s: new BN(b.slice(32, 64)) }); } catch { return false; } }
function recover(m, sig, rec, c = true) { const b = toBuf(sig); const pt = ec.recoverPubKey(toBuf(m), { r: new BN(b.slice(0, 32)), s: new BN(b.slice(32, 64)) }, rec); return Buffer.from(pt.encode("array", c !== false)); }
module.exports = { __saosShim: "SAOS-SECP-SHIM-v1", privateKeyVerify, publicKeyConvert, publicKeyCreate, publicKeyTweakMul, publicKeyVerify, recover, sign, verify };
`;

function main() {
  try {
    if (fs.existsSync(IDX) && fs.readFileSync(IDX, "utf8").includes("SAOS-SECP-SHIM-v1")) {
      if (fs.existsSync(NATIVE)) { fs.renameSync(NATIVE, NATIVE + ".quarantined"); console.log("[patch-secp] shim-חי · native-שרד-בעץ-זה → הסגר"); }
      else console.log("[patch-secp] shim כבר-חי — דילוג");
      return;
    }
    fs.mkdirSync(PKG, { recursive: true });
    fs.writeFileSync(IDX, SHIM);
    const pj = path.join(PKG, "package.json");
    let meta: any = { name: "secp256k1", version: "3.8.0" };
    try { meta = JSON.parse(fs.readFileSync(pj, "utf8")); } catch {}
    meta.main = "index.js";
    meta.version = String(meta.version ?? "3.8.0").includes("saos-shim") ? meta.version : `${meta.version}-saos-shim`;
    meta.description = "SAOS pure-JS shim (SAOS-SECP-SHIM-v1)";
    fs.writeFileSync(pj, JSON.stringify(meta, null, 1));
    if (fs.existsSync(NATIVE)) fs.renameSync(NATIVE, NATIVE + ".quarantined");
    console.log("[patch-secp] shim הותקן · native הועבר-להסגר");
  } catch (e) {
    console.error("[patch-secp] FAIL:", String(e).slice(0, 120)); // לא-הורגים-את-השירות — dhive ייכשל fail-closed אם-משהו-שבור
  }
}
main();
