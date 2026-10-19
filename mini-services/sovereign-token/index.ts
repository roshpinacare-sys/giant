/* ═══════════════════════════════════════════════════════════════════════════
 * sovereign-token :3025 — SAOSX · SAOS Sovereign Contract Token
 * Task 21-a · הטוקן-הריבוני + מנוע-חוזים-מתקדם
 * ═══════════════════════════════════════════════════════════════════════════
 * חוקי-אמת (המשכיות מ-fleet-economy / giants-anchor / giant-intake):
 *  - fail-honest: אין-ירוק-מזויף. כל-שגיאה כנה; הספר שובר-את-עצמו-להסגר אם-נפרץ.
 *  - append-only: הספר jsonl קשור-השיבוש (hash-chain); הסנאפשוט נגזר ממנו.
 *  - אפס-סודות: ה-WIF נקרא מהכספת בזמן-ריצה, לעולם לא נרשם/מודפס/נשלח.
 *  - כל-היחידות בפנים = מיקרו (1 SAOSX = 1e6 מיקרו, מספרים-שלמים בלבד).
 *
 * אמת-כנה-מתועדת (v1):
 *  - unstake מיידי — אין תקופת-שחרור (unbonding) ב-v1.
 *  - פרסי-סטייקינג נצברים ל-STAKERS בלבד; דלגציה = כוח בלבד (לא ניתן-להוצאה,
 *    לא מניבה פרסים) — בסגנון HP של Steem, ללא מימוש-הצבעה ב-v1.
 *  - חתימה מאשרת כוונה — פעולה חתומה עשויה להישלח שוב (ledger seq = הסדר).
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import EC from "elliptic";

const PORT = 3025;
const SERVICE = "sovereign-token";
const STATE_DIR = path.join(import.meta.dir, "state");
const LEDGER_FILE = path.join(STATE_DIR, "ledger.jsonl");
const SNAP_FILE = path.join(STATE_DIR, "snapshot.json");
const ANCHOR_LOG = path.join(STATE_DIR, "anchor-log.jsonl");
const DEPOSIT_LOG = path.join(STATE_DIR, "deposit-log.jsonl");
const DEPOSIT_SEEN = path.join(STATE_DIR, "deposit-seen.json");
const QUARANTINE_DIR = path.join(STATE_DIR, "quarantine");
const ISSUER_FILE = "/home/z/.secrets/sovereign-token/issuer.json";
const ECONOMY_INGEST = "http://127.0.0.1:3016/tx/ingest";

/* ── קבועי-הטוקן (מספרים-אמיתיים, כל-היחידות מיקרו) ── */
const CAP = 21_000_000n * 1_000_000n;              // 21,000,000 SAOSX
const GEN_STAKING_POOL = 8_400_000n * 1_000_000n;   // 40%
const GEN_VESTING_VAULT = 7_350_000n * 1_000_000n;  // 35%
const GEN_TREASURY = 3_150_000n * 1_000_000n;       // 15%
const GEN_AIRDROP = 2_100_000n * 1_000_000n;        // 10%
const AIRDROP_PER_CLAIM = 1_000n * 1_000_000n;      // 1,000 SAOSX
const APR_BPS_CAP = 5000;                            // תקרה 50%
const APR_BPS_DEFAULT = 1000;                        // 10% פתיחה
const BODY_CAP = 64 * 1024;
const HISTORY_CAP = 200;
const BATCH_MAX = 20;
const REWARD_SCALE = 1_000_000_000_000n;             // דיוק-אינדקס 1e12
const SECONDS_PER_YEAR = 31_536_000n;

const SYS = {
  staking_pool: "staking_pool",
  vesting_vault: "vesting_vault",
  treasury: "treasury",
  airdrop_reserve: "airdrop_reserve",
  htlc_escrow: "htlc_escrow",
  burned: "burned",
} as const;
const SYSTEM_ADDRS = new Set(Object.values(SYS));

/* ── קריפטו ── */
const ec = new (EC as unknown as { ec: new (n: string) => any }).ec("secp256k1");
const sha256b = (b: Buffer) => createHash("sha256").update(b).digest();
const sha256hex = (b: Buffer | string) => sha256b(typeof b === "string" ? Buffer.from(b, "utf8") : b).toString("hex");
const rmd160hex = (b: Buffer) => createHash("ripemd160").update(b).digest("hex");

function canon(v: unknown): string {
  // canonical JSON: מפתחות-ממוינים רקורסיבית, בלי רווחים — בסיס-החתימה וה-hash
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

function addrFromPub(pubHex: string): string | null {
  if (!/^[0-9a-f]{66}$/.test(pubHex)) return null;
  try { ec.curve.decodePoint(Buffer.from(pubHex, "hex")); } catch { return null; }
  return rmd160hex(sha256b(Buffer.from(pubHex, "hex")));
}
function verifySig(op: unknown, pubHex: string, sig: { r: string; s: string }): boolean {
  try {
    if (!/^[0-9a-f]{64}$/.test(sig?.r ?? "") || !/^[0-9a-f]{64}$/.test(sig?.s ?? "")) return false;
    const digest = sha256b(Buffer.from(canon(op), "utf8"));
    return ec.keyFromPublic(Buffer.from(pubHex, "hex")).verify(digest, { r: Buffer.from(sig.r, "hex"), s: Buffer.from(sig.s, "hex") });
  } catch { return false; }
}

/* ── זהות-המנפיק (הכספת — לעולם לא נרשמת) ── */
interface Issuer { wif: string; stmPub: string; pubHex: string; address: string; }
function loadIssuer(): { issuer: Issuer; priv: any } {
  const raw = fs.readFileSync(ISSUER_FILE, "utf8");
  const iss = JSON.parse(raw) as Issuer;
  if (!iss.wif || !iss.pubHex || !iss.address) throw new Error("issuer-file-incomplete");
  // base58check decode (steem-style WIF)
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n; for (const c of iss.wif) { const i = B58.indexOf(c); if (i < 0) throw new Error("wif-bad-char"); num = num * 58n + BigInt(i); }
  let hex = num.toString(16); if (hex.length % 2) hex = "0" + hex;
  const dec = Buffer.from(hex, "hex");
  const payload = dec.subarray(0, dec.length - 4);
  const chk = sha256b(sha256b(payload)).subarray(0, 4);
  if (!chk.equals(dec.subarray(dec.length - 4))) throw new Error("wif-checksum-fail");
  if (payload[0] !== 0x80 || payload.length !== 34 || payload[33] !== 0x01) throw new Error("wif-shape-fail");
  const key = payload.subarray(1, 33);
  const priv = ec.keyFromPrivate(key.toString("hex"));
  const derived = Buffer.from(priv.getPublic().encode("array", true)).toString("hex");
  if (derived !== iss.pubHex) throw new Error("issuer-pub-mismatch"); // fail-closed — זהות-שקרית אסורה
  const addr = addrFromPub(iss.pubHex);
  if (addr !== iss.address) throw new Error("issuer-addr-mismatch");
  return { issuer: iss, priv };
}
const { issuer: ISSUER, priv: ISSUER_PRIV } = loadIssuer();
const ISSUER_ADDR = ISSUER.address;
void ISSUER_PRIV; // בשימוש רק לחתימת-הג'נזיס — לעולם לא בפלט

/* ── מצב-הספר ── */
interface Acct { liquid: bigint; staked: bigint }
const bal = new Map<string, Acct>();
function acct(a: string): Acct { let b = bal.get(a); if (!b) { b = { liquid: 0n, staked: 0n }; bal.set(a, b); } return b; }

interface Vesting { id: string; beneficiary: string; total: bigint; claimed: bigint; cliffTs: number; endTs: number; createdAt: number }
const vestings = new Map<string, Vesting>();
interface Htlc { id: string; from: string; to: string; amount: bigint; hashlock: string; timelock: number; state: "open" | "claimed" | "refunded"; revealedPreimage: string | null; createdAt: number }
const htlcs = new Map<string, Htlc>();
interface Proposal { id: string; ops: any[]; required: number; approvals: string[]; executed: boolean; proposer: string; createdAt: number }
const proposals = new Map<string, Proposal>();
const delegOut = new Map<string, Map<string, bigint>>(); // delegator → delegatee → amt
const airdropClaimed = new Map<string, bigint>();
const staking = {
  aprBps: APR_BPS_DEFAULT,
  lastAccrualTs: Date.now(),
  index: 0n,                    // rewardPerTokenStored (scaled 1e12)
  paidIndex: new Map<string, bigint>(),
  storedAccrued: new Map<string, bigint>(),
};
let seq = 0;
let lastH = "GENESIS-SAOSX";
let burnedTotal = 0n;
let bootAt = Date.now();
let verifyOk = true;
let lastVerify: { at: number; ok: boolean; checked: number; brokenAt: number | null; ms: number } | null = null;
let quarantined: string | null = null;
const historyRing: any[] = []; // זנב-זיכרון ל-/history
const OWNERS = [ISSUER_ADDR];  // v1: N-of-M עם M=1 — הבעלים הוא המנפיק
function totalStaked(): bigint { let s = 0n; for (const a of bal.values()) s += a.staked; return s; }
function supply(): bigint { let s = 0n; for (const a of bal.values()) s += a.liquid + a.staked; return s; }

/* ── הספר: hash-chain ── */
function chainHash(prevH: string, entrySeq: number, op: unknown, pub: string, sig: unknown): string {
  return sha256hex(Buffer.from(prevH + "|" + entrySeq + "|" + canon(op) + "|" + pub + "|" + canon(sig ?? null), "utf8"));
}
function opFrom(op: any): string | null { return op && typeof op === "object" ? (op.from ?? null) : null; }
function opTo(op: any): string | null { return op && typeof op === "object" ? (op.to ?? null) : null; }
function opAmount(op: any): number | null {
  if (!op || typeof op !== "object") return null;
  const a = op.amount ?? op.total ?? null;
  return typeof a === "number" ? a : null;
}
function pushHistory(e: any) { historyRing.push(e); if (historyRing.length > 2000) historyRing.shift(); }
function appendLedger(kind: string, op: unknown, pub: string, sig: { r: string; s: string } | null, ts: number): { seq: number; h: string } {
  const s = seq + 1;
  const h = chainHash(lastH, s, op, pub, sig);
  fs.appendFileSync(LEDGER_FILE, JSON.stringify({ seq: s, ts, kind, op, pub, sig, h }) + "\n");
  seq = s; lastH = h;
  pushHistory({ seq: s, ts, kind, op, from: opFrom(op), to: opTo(op), amount: opAmount(op) });
  return { seq: s, h };
}

/* ── צבירת-פרסי-סטייקינג (rewardPerTokenStored · BigInt בלבד) ──
 * כנות: צבירה וירטואלית; בור-הפרסים נשאב רק בעת claim.
 * אם הבור יבש — התביעה נדחית כנה והצבירה נשמרת. */
function accrue(now: number) {
  const dt = Math.max(0, Math.floor(now / 1000) - Math.floor(staking.lastAccrualTs / 1000));
  staking.lastAccrualTs = now;
  if (dt <= 0) return;
  const tot = totalStaked();
  if (tot <= 0n) return;
  // delta = totalStaked * aprBps * dt / (10000 * 31536000)
  const delta = (tot * BigInt(staking.aprBps) * BigInt(dt)) / (10_000n * SECONDS_PER_YEAR);
  if (delta <= 0n) return;
  staking.index += (delta * REWARD_SCALE) / tot;
}
function accruedOf(a: string): bigint {
  const staked = acct(a).staked;
  const paid = staking.paidIndex.get(a) ?? 0n;
  const stored = staking.storedAccrued.get(a) ?? 0n;
  if (staked <= 0n) return stored;
  return stored + (staked * (staking.index - paid)) / REWARD_SCALE;
}

/* ── יישום-אופציות (חוקי-הספר) ──
 * apply מקבל ts מחייב — בזמן-חי = עת-כתיבת-הרשומה; ב-replay = ts-הרשומה.
 * דטרמיניזם: אותו-מצב + אותו-op + אותו-ts = אותה-תוצאה. */
class OpError extends Error { constructor(public code: string) { super(code); } }

function needInt(v: unknown, min: bigint): bigint {
  if (typeof v === "number" && Number.isInteger(v)) v = BigInt(v);
  if (typeof v === "string") { if (!/^\d+$/.test(v)) throw new OpError("amount-not-integer"); v = BigInt(v); }
  if (typeof v !== "bigint") throw new OpError("amount-not-integer");
  if (v < min) throw new OpError("amount-below-min");
  return v;
}
function move(from: string, to: string, amt: bigint, fieldFrom: "liquid" | "staked" = "liquid", fieldTo: "liquid" | "staked" = "liquid") {
  const f = acct(from), t = acct(to);
  if (f[fieldFrom] < amt) throw new OpError("insufficient-balance");
  f[fieldFrom] -= amt; t[fieldTo] += amt;
}

function applyInner(op: any, actor: string, ts: number, via: string): any {
  if (!op || typeof op !== "object" || Array.isArray(op)) throw new OpError("op-not-object");
  const kind = String(op.op ?? "");
  const isIssuer = actor === ISSUER_ADDR;
  switch (kind) {
    case "transfer": {
      const from = op.from ?? actor;
      if (from !== actor && !(from === SYS.treasury && isIssuer)) throw new OpError("unauthorized-from");
      if (SYSTEM_ADDRS.has(String(op.to))) throw new OpError("system-address-transfer-forbidden");
      if (!/^[0-9a-f]{40}$/.test(String(op.to))) throw new OpError("bad-to-address");
      if (op.memo !== undefined && (typeof op.memo !== "string" || op.memo.length > 128)) throw new OpError("memo-too-long");
      move(from, String(op.to), needInt(op.amount, 1n));
      return { moved: Number(needInt(op.amount, 1n)) };
    }
    case "burn": {
      const amt = needInt(op.amount, 1n);
      move(actor, SYS.burned, amt);
      burnedTotal += amt;
      return { burned: Number(amt), burnedTotal: Number(burnedTotal) };
    }
    case "stake": {
      accrue(ts);
      const amt = needInt(op.amount, 1n);
      move(actor, actor, amt, "liquid", "staked");
      return { staked: Number(amt) };
    }
    case "unstake": {
      accrue(ts);
      const amt = needInt(op.amount, 1n);
      // כנות-v1: מיידי — אין unbonding (מתועד ב-/meta)
      move(actor, actor, amt, "staked", "liquid");
      return { unstaked: Number(amt) };
    }
    case "delegate": {
      if (!/^[0-9a-f]{40}$/.test(String(op.to))) throw new OpError("bad-to-address");
      const amt = needInt(op.amount, 1n);
      const outs = delegOut.get(actor) ?? new Map<string, bigint>();
      let totalOut = 0n; for (const v of outs.values()) totalOut += v;
      if (acct(actor).staked - totalOut < amt) throw new OpError("staked-power-exhausted");
      outs.set(String(op.to), (outs.get(String(op.to)) ?? 0n) + amt);
      delegOut.set(actor, outs);
      return { delegated: Number(amt), to: String(op.to) };
    }
    case "undelegate": {
      if (!/^[0-9a-f]{40}$/.test(String(op.to))) throw new OpError("bad-to-address");
      const amt = needInt(op.amount, 1n);
      const outs = delegOut.get(actor);
      const cur = outs?.get(String(op.to)) ?? 0n;
      if (cur < amt) throw new OpError("delegation-not-found");
      if (cur === amt) outs!.delete(String(op.to)); else outs!.set(String(op.to), cur - amt);
      return { undelegated: Number(amt), to: String(op.to) };
    }
    case "create-vesting": {
      if (!isIssuer) throw new OpError("issuer-only");
      if (!/^[0-9a-f]{40}$/.test(String(op.to))) throw new OpError("bad-beneficiary");
      const total = needInt(op.total, 1n);
      const cliffTs = Number(op.cliffTs), endTs = Number(op.endTs);
      if (!Number.isFinite(cliffTs) || !Number.isFinite(endTs) || endTs <= cliffTs) throw new OpError("bad-vesting-window");
      if (endTs - cliffTs > 10 * 365 * 86400 * 1000) throw new OpError("vesting-window-too-long");
      move(SYS.treasury, SYS.vesting_vault, total);
      const id = "vest-" + (seq + 1);
      vestings.set(id, { id, beneficiary: String(op.to), total, claimed: 0n, cliffTs, endTs, createdAt: ts });
      return { id, total: Number(total), escrowed: true };
    }
    case "claim-vesting": {
      let paid = 0n; const paidIds: string[] = [];
      for (const v of vestings.values()) {
        if (v.beneficiary !== actor) continue;
        const window = Math.max(1, v.endTs - v.cliffTs);
        const elapsed = Math.min(Math.max(ts - v.cliffTs, 0), window);
        const released = (v.total * BigInt(elapsed)) / BigInt(window);
        const payable = released - v.claimed;
        if (payable <= 0n) continue;
        const vault = acct(SYS.vesting_vault);
        const pay = payable < vault.liquid ? payable : vault.liquid;
        if (pay <= 0n) continue;
        vault.liquid -= pay; acct(actor).liquid += pay;
        v.claimed += pay; paid += pay; paidIds.push(v.id);
      }
      if (paid <= 0n) throw new OpError("nothing-claimable");
      return { paid: Number(paid), contracts: paidIds };
    }
    case "set-reward-rate": {
      if (!isIssuer) throw new OpError("issuer-only");
      const apr = Number(op.aprBps);
      if (!Number.isInteger(apr) || apr < 0 || apr > APR_BPS_CAP) throw new OpError(`aprBps-out-of-range-0-${APR_BPS_CAP}`);
      accrue(ts); // הצבירה-עד-עתה בשיעור-הישן
      const old = staking.aprBps;
      staking.aprBps = apr;
      return { aprBps: apr, previous: old };
    }
    case "claim-rewards": {
      accrue(ts);
      const due = accruedOf(actor);
      if (due <= 0n) throw new OpError("nothing-accrued");
      const pool = acct(SYS.staking_pool);
      const pay = due < pool.liquid ? due : pool.liquid;
      if (pay <= 0n) throw new OpError("staking-pool-empty");
      pool.liquid -= pay; acct(actor).liquid += pay;
      staking.storedAccrued.set(actor, due - pay);
      staking.paidIndex.set(actor, staking.index);
      return { claimed: Number(pay), deferred: Number(due - pay) };
    }
    case "airdrop-claim": {
      if (airdropClaimed.has(actor)) throw new OpError("already-claimed");
      if (op.saosAddr !== undefined && (typeof op.saosAddr !== "string" || op.saosAddr.length > 64)) throw new OpError("bad-saosAddr");
      const reserve = acct(SYS.airdrop_reserve);
      const pay = AIRDROP_PER_CLAIM < reserve.liquid ? AIRDROP_PER_CLAIM : reserve.liquid;
      if (pay <= 0n) throw new OpError("airdrop-empty");
      reserve.liquid -= pay; acct(actor).liquid += pay;
      airdropClaimed.set(actor, pay);
      return { paid: Number(pay), saosAddr: String(op.saosAddr ?? "") };
    }
    case "htlc-create": {
      if (!/^[0-9a-f]{40}$/.test(String(op.to))) throw new OpError("bad-to-address");
      if (typeof op.hashlock !== "string" || !/^[0-9a-f]{64}$/.test(op.hashlock)) throw new OpError("bad-hashlock");
      const tlock = Number(op.timelock);
      if (!Number.isInteger(tlock) || tlock <= Math.floor(ts / 1000) || tlock > Math.floor(ts / 1000) + 90 * 86400) throw new OpError("bad-timelock");
      const amt = needInt(op.amount, 1n);
      move(actor, SYS.htlc_escrow, amt);
      const id = "htlc-" + (seq + 1);
      htlcs.set(id, { id, from: actor, to: String(op.to), amount: amt, hashlock: op.hashlock, timelock: tlock, state: "open", revealedPreimage: null, createdAt: ts });
      return { id, amount: Number(amt) };
    }
    case "htlc-claim": {
      const h = htlcs.get(String(op.id ?? ""));
      if (!h || h.state !== "open") throw new OpError("htlc-not-open");
      if (h.timelock <= Math.floor(ts / 1000)) throw new OpError("htlc-expired-use-refund");
      if (typeof op.preimage !== "string") throw new OpError("bad-preimage");
      if (sha256hex(op.preimage) !== h.hashlock) throw new OpError("preimage-mismatch");
      if (actor !== h.to) throw new OpError("only-beneficiary-claims");
      h.state = "claimed"; h.revealedPreimage = op.preimage;
      move(SYS.htlc_escrow, h.to, h.amount);
      return { id: h.id, claimed: Number(h.amount) };
    }
    case "htlc-refund": {
      const h = htlcs.get(String(op.id ?? ""));
      if (!h || h.state !== "open") throw new OpError("htlc-not-open");
      if (h.timelock > Math.floor(ts / 1000)) throw new OpError("htlc-still-locked");
      if (actor !== h.from) throw new OpError("only-creator-refunds");
      h.state = "refunded";
      move(SYS.htlc_escrow, h.from, h.amount);
      return { id: h.id, refunded: Number(h.amount) };
    }
    case "multisig-propose": {
      if (!OWNERS.includes(actor)) throw new OpError("owner-only");
      const inner = op.ops;
      if (!Array.isArray(inner) || inner.length < 1 || inner.length > BATCH_MAX) throw new OpError(`ops-array-1-${BATCH_MAX}`);
      const req = Number(op.required ?? OWNERS.length);
      if (!Number.isInteger(req) || req < 1 || req > OWNERS.length) throw new OpError("bad-required");
      const id = "ms-" + (seq + 1);
      proposals.set(id, { id, ops: inner, required: req, approvals: [actor], executed: false, proposer: actor, createdAt: ts });
      return { id, required: req };
    }
    case "multisig-approve": {
      if (!OWNERS.includes(actor)) throw new OpError("owner-only");
      const p = proposals.get(String(op.id ?? ""));
      if (!p || p.executed) throw new OpError("proposal-not-open");
      if (p.approvals.includes(actor)) throw new OpError("already-approved");
      p.approvals.push(actor);
      return { id: p.id, approvals: p.approvals.length, required: p.required };
    }
    case "multisig-execute": {
      if (!OWNERS.includes(actor)) throw new OpError("owner-only");
      const p = proposals.get(String(op.id ?? ""));
      if (!p || p.executed) throw new OpError("proposal-not-open");
      if (p.approvals.length < p.required) throw new OpError("not-enough-approvals");
      p.executed = true;
      const execActor = OWNERS[0]; // v1: המולטיסיג פועל כבעלי-היחיד
      const results: any[] = [];
      for (const inner of p.ops) {
        if (inner && typeof inner === "object" && typeof inner.op === "string" &&
            (inner.op === "batch" || inner.op.startsWith("multisig-"))) throw new OpError("no-nesting");
        results.push(applyInner(inner, execActor, ts, "multisig"));
      }
      return { id: p.id, executed: p.ops.length, results };
    }
    case "batch": {
      const inner = op.ops;
      if (!Array.isArray(inner) || inner.length < 1 || inner.length > BATCH_MAX) throw new OpError(`ops-array-1-${BATCH_MAX}`);
      const results: any[] = [];
      for (const innerOp of inner) {
        if (innerOp && typeof innerOp === "object" && typeof innerOp.op === "string" &&
            (innerOp.op === "batch" || innerOp.op.startsWith("multisig-"))) throw new OpError("no-nesting");
        results.push(applyInner(innerOp, actor, ts, "batch"));
      }
      return { executed: inner.length, results };
    }
    default:
      throw new OpError("unknown-op");
  }
}

/* אטומיות batch/multisig-execute: עותק-מצב לפני, שחזור בכשל (all-or-nothing) */
function cloneState() {
  return {
    bal: new Map([...bal].map(([k, v]) => [k, { ...v }])),
    vestings: new Map([...vestings].map(([k, v]) => [k, { ...v }])),
    htlcs: new Map([...htlcs].map(([k, v]) => [k, { ...v }])),
    proposals: new Map([...proposals].map(([k, v]) => [k, { ...v, approvals: [...v.approvals] }])),
    delegOut: new Map([...delegOut].map(([k, m]) => [k, new Map(m)])),
    airdrop: new Map(airdropClaimed),
    staking: { ...staking, paidIndex: new Map(staking.paidIndex), storedAccrued: new Map(staking.storedAccrued) },
    burnedTotal, seq, lastH,
  };
}
function restoreState(s: ReturnType<typeof cloneState>) {
  bal.clear(); for (const [k, v] of s.bal) bal.set(k, { ...v });
  vestings.clear(); for (const [k, v] of s.vestings) vestings.set(k, { ...v });
  htlcs.clear(); for (const [k, v] of s.htlcs) htlcs.set(k, { ...v });
  proposals.clear(); for (const [k, v] of s.proposals) proposals.set(k, { ...v, approvals: [...v.approvals] });
  delegOut.clear(); for (const [k, m] of s.delegOut) delegOut.set(k, new Map(m));
  airdropClaimed.clear(); for (const [k, v] of s.airdrop) airdropClaimed.set(k, v);
  staking.aprBps = s.staking.aprBps; staking.lastAccrualTs = s.staking.lastAccrualTs;
  staking.index = s.staking.index; staking.paidIndex = new Map(s.staking.paidIndex); staking.storedAccrued = new Map(s.staking.storedAccrued);
  burnedTotal = s.burnedTotal; seq = s.seq; lastH = s.lastH;
}

/* ── יישום-אופציה חתומה-על-הספר ── */
function applySignedOp(op: unknown, pub: string, sig: { r: string; s: string }): { seq: number; h: string; result: any } {
  if (quarantined) throw new OpError("quarantined:" + quarantined);
  const actor = addrFromPub(pub);
  if (!actor) throw new OpError("bad-pub");
  const kind = (op as any)?.op;
  const atomic = kind === "batch" || kind === "multisig-execute";
  const snap = atomic ? cloneState() : null;
  const ts = Date.now();
  try {
    const result = applyInner(op, actor, ts, "direct");
    const r = appendLedger(String(kind), op, pub, sig, ts);
    snapshotSave();
    return { seq: r.seq, h: r.h, result };
  } catch (e) {
    if (snap) restoreState(snap);
    throw e;
  }
}

/* ── ג'נזיס (seq=1 · חתום-על-ידי-המנפיק · נוצר-פעם-אחת) ── */
function genesisOp() {
  return {
    genesis: true, token: "SAOSX", name: "SAOS Sovereign Contract Token",
    cap: Number(CAP),
    allocs: { staking_pool: Number(GEN_STAKING_POOL), vesting_vault: Number(GEN_VESTING_VAULT), treasury: Number(GEN_TREASURY), airdrop_reserve: Number(GEN_AIRDROP) },
  };
}
function createGenesis() {
  const op = genesisOp();
  const digest = sha256b(Buffer.from(canon(op), "utf8"));
  const s = ISSUER_PRIV.sign(digest, { canonical: true });
  const sig = { r: s.r.toString(16).padStart(64, "0"), s: s.s.toString(16).padStart(64, "0") };
  const ts = Date.now();
  const h = chainHash("GENESIS-SAOSX", 1, op, ISSUER.pubHex, sig);
  fs.appendFileSync(LEDGER_FILE, JSON.stringify({ seq: 1, ts, kind: "genesis", op, pub: ISSUER.pubHex, sig, h }) + "\n");
  seq = 1; lastH = h;
  acct(SYS.staking_pool).liquid = GEN_STAKING_POOL;
  acct(SYS.vesting_vault).liquid = GEN_VESTING_VAULT;
  acct(SYS.treasury).liquid = GEN_TREASURY;
  acct(SYS.airdrop_reserve).liquid = GEN_AIRDROP;
  staking.lastAccrualTs = ts;
  pushHistory({ seq: 1, ts, kind: "genesis", op, from: null, to: null, amount: Number(CAP) });
  snapshotSave();
  console.info(`[sovereign-token] genesis נכתב seq=1 h=${h.slice(0, 16)}… cap=21,000,000 SAOSX`);
}

/* ── סנאפשוט (כתיבה-אטומית tmp+rename) ── */
function snapObj() {
  return {
    savedAt: new Date().toISOString(),
    seq, lastH, burnedTotal: burnedTotal.toString(),
    balances: [...bal.entries()].map(([k, v]) => [k, [v.liquid.toString(), v.staked.toString()]]),
    vestings: [...vestings.values()].map((v) => ({ ...v, total: v.total.toString(), claimed: v.claimed.toString() })),
    htlcs: [...htlcs.values()].map((h) => ({ ...h, amount: h.amount.toString() })),
    proposals: [...proposals.values()],
    delegations: [...delegOut.entries()].map(([d, m]) => [d, [...m.entries()].map(([t, a]) => [t, a.toString()])]),
    airdrop: [...airdropClaimed.entries()].map(([k, v]) => [k, v.toString()]),
    staking: {
      aprBps: staking.aprBps, lastAccrualTs: staking.lastAccrualTs, index: staking.index.toString(),
      paidIndex: [...staking.paidIndex.entries()].map(([k, v]) => [k, v.toString()]),
      storedAccrued: [...staking.storedAccrued.entries()].map(([k, v]) => [k, v.toString()]),
    },
    lastVerify,
  };
}
function snapshotSave() {
  try {
    const tmp = SNAP_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(snapObj()));
    fs.renameSync(tmp, SNAP_FILE);
  } catch (e) { console.error("[sovereign-token] snapshot-save-fail:", String(e).slice(0, 120)); }
}

/* ── שחזור-עלייה: סנאפשוט + שידוד-זנב (הספר-הוא-האמת · דפוס fleet-economy) ── */
function replayEntry(e: any) {
  if (e.kind === "genesis") {
    const a = (e.op?.allocs ?? {}) as Record<string, number>;
    acct(SYS.staking_pool).liquid = BigInt(a.staking_pool ?? 0);
    acct(SYS.vesting_vault).liquid = BigInt(a.vesting_vault ?? 0);
    acct(SYS.treasury).liquid = BigInt(a.treasury ?? 0);
    acct(SYS.airdrop_reserve).liquid = BigInt(a.airdrop_reserve ?? 0);
    staking.lastAccrualTs = e.ts;
  } else if (e.kind === "deposit-intake") {
    /* רשומת-קליטה בלבד — אפס-אפקט-יתרות (כנות: ערוץ-הפקדות STEEM נרשם, לא מומר) */
  } else {
    applyInner(e.op, addrFromPub(e.pub) ?? "", e.ts, "replay");
  }
  seq = e.seq; lastH = e.h;
  pushHistory({ seq: e.seq, ts: e.ts, kind: e.kind, op: e.op, from: opFrom(e.op), to: opTo(e.op), amount: opAmount(e.op) });
}
function loadStateFromDisk(): { replayed: number } {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(LEDGER_FILE) || fs.readFileSync(LEDGER_FILE, "utf8").trim() === "") {
    createGenesis();
    return { replayed: 0 };
  }
  try {
    if (fs.existsSync(SNAP_FILE)) {
      const s = JSON.parse(fs.readFileSync(SNAP_FILE, "utf8"));
      seq = s.seq ?? 0; lastH = s.lastH ?? "GENESIS-SAOSX";
      burnedTotal = BigInt(s.burnedTotal ?? "0");
      for (const [k, v] of s.balances ?? []) bal.set(k, { liquid: BigInt(v[0]), staked: BigInt(v[1]) });
      for (const v of s.vestings ?? []) vestings.set(v.id, { ...v, total: BigInt(v.total), claimed: BigInt(v.claimed) });
      for (const h of s.htlcs ?? []) htlcs.set(h.id, { ...h, amount: BigInt(h.amount) });
      for (const p of s.proposals ?? []) proposals.set(p.id, { ...p });
      for (const [d, arr] of s.delegations ?? []) delegOut.set(d, new Map(arr.map(([t, a]: [string, string]) => [t, BigInt(a)])));
      for (const [k, v] of s.airdrop ?? []) airdropClaimed.set(k, BigInt(v));
      if (s.staking) {
        staking.aprBps = s.staking.aprBps ?? APR_BPS_DEFAULT;
        staking.lastAccrualTs = s.staking.lastAccrualTs ?? Date.now();
        staking.index = BigInt(s.staking.index ?? "0");
        for (const [k, v] of s.staking.paidIndex ?? []) staking.paidIndex.set(k, BigInt(v));
        for (const [k, v] of s.staking.storedAccrued ?? []) staking.storedAccrued.set(k, BigInt(v));
      }
      lastVerify = s.lastVerify ?? null;
    }
  } catch (e) {
    console.error("[sovereign-token] snapshot-corrupt:", String(e).slice(0, 120));
  }
  let replayed = 0;
  const lines = fs.readFileSync(LEDGER_FILE, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    let e: any; try { e = JSON.parse(line); } catch { continue; }
    if (e.seq <= seq) continue;
    try { replayEntry(e); replayed++; }
    catch (err) {
      // כנות: זנב-שלא-ניתן-לשידוד = ספר-תפור → הסגר (לא המצאה, לא דריסה)
      quarantine(`tail-replay-failAt-${e.seq}: ${String(err instanceof OpError ? err.code : err).slice(0, 120)}`);
      return { replayed };
    }
  }
  return { replayed };
}

/* ── אימות-שרשרת מלא מהדיסק (שידוד-צל עצמאי + השוואת-מצב) ── */
function verifyChain(): { ok: boolean; checked: number; brokenAt: number | null; ms: number } {
  const t0 = Date.now();
  let prevH = "GENESIS-SAOSX";
  let s = 0;
  let brokenAt: number | null = null;
  try {
    const lines = fs.readFileSync(LEDGER_FILE, "utf8").split("\n").filter(Boolean);
    const shadowBal = new Map<string, Acct>();
    const sBal = (a: string) => { let b = shadowBal.get(a); if (!b) { b = { liquid: 0n, staked: 0n }; shadowBal.set(a, b); } return b; };
    const shadowVest = new Map<string, any>();
    const shadowHtlc = new Map<string, any>();
    const shadowDeleg = new Map<string, Map<string, bigint>>();
    const shadowAirdrop = new Set<string>();
    const shadowStaking = { aprBps: APR_BPS_DEFAULT, lastAccrualTs: 0, index: 0n, paidIndex: new Map<string, bigint>(), storedAccrued: new Map<string, bigint>() };
    let shadowBurned = 0n;
    let shadowSeq = 0; let shadowLast = "GENESIS-SAOSX";
    const accrueShadow = (now: number) => {
      const dt = Math.max(0, Math.floor(now / 1000) - Math.floor(shadowStaking.lastAccrualTs / 1000));
      shadowStaking.lastAccrualTs = now;
      if (dt <= 0) return;
      let tot = 0n; for (const a of shadowBal.values()) tot += a.staked;
      if (tot <= 0n) return;
      const delta = (tot * BigInt(shadowStaking.aprBps) * BigInt(dt)) / (10_000n * SECONDS_PER_YEAR);
      if (delta <= 0n) return;
      shadowStaking.index += (delta * REWARD_SCALE) / tot;
    };
    const applyShadow = (op: any, actor: string, ts: number): void => {
      const kind = String(op.op ?? "");
      const isIssuer = actor === ISSUER_ADDR;
      const need = (v: any): bigint => { if (typeof v === "number") v = BigInt(Math.trunc(v)); if (typeof v !== "bigint") throw new OpError("amount-not-integer"); return v; };
      const mv = (from: string, to: string, amt: bigint, ff: "liquid" | "staked" = "liquid", tf: "liquid" | "staked" = "liquid") => {
        if (sBal(from)[ff] < amt) throw new OpError("insufficient-balance");
        sBal(from)[ff] -= amt; sBal(to)[tf] += amt;
      };
      switch (kind) {
        case "transfer": { const from = op.from ?? actor; if (from !== actor && !(from === SYS.treasury && isIssuer)) throw new OpError("unauthorized-from"); mv(from, op.to, need(op.amount)); break; }
        case "burn": { const a = need(op.amount); mv(actor, SYS.burned, a); shadowBurned += a; break; }
        case "stake": { accrueShadow(ts); mv(actor, actor, need(op.amount), "liquid", "staked"); break; }
        case "unstake": { accrueShadow(ts); mv(actor, actor, need(op.amount), "staked", "liquid"); break; }
        case "delegate": { const outs = shadowDeleg.get(actor) ?? new Map(); let out = 0n; for (const v of outs.values()) out += v; const a = need(op.amount); if (sBal(actor).staked - out < a) throw new OpError("staked-power-exhausted"); outs.set(op.to, (outs.get(op.to) ?? 0n) + a); shadowDeleg.set(actor, outs); break; }
        case "undelegate": { const outs = shadowDeleg.get(actor); const a = need(op.amount); const cur = outs?.get(op.to) ?? 0n; if (cur < a) throw new OpError("delegation-not-found"); if (cur === a) outs!.delete(op.to); else outs!.set(op.to, cur - a); break; }
        case "create-vesting": { if (!isIssuer) throw new OpError("issuer-only"); const t = need(op.total); mv(SYS.treasury, SYS.vesting_vault, t); const id = "vest-" + (shadowSeq + 1); shadowVest.set(id, { id, beneficiary: op.to, total: t, claimed: 0n, cliffTs: op.cliffTs, endTs: op.endTs }); break; }
        case "claim-vesting": { let paid = 0n; for (const v of shadowVest.values()) { if (v.beneficiary !== actor) continue; const window = Math.max(1, v.endTs - v.cliffTs); const el = Math.min(Math.max(ts - v.cliffTs, 0), window); const released = (v.total * BigInt(el)) / BigInt(window); const payable = released - v.claimed; if (payable <= 0n) continue; const pay = payable < sBal(SYS.vesting_vault).liquid ? payable : sBal(SYS.vesting_vault).liquid; if (pay <= 0n) continue; sBal(SYS.vesting_vault).liquid -= pay; sBal(actor).liquid += pay; v.claimed += pay; paid += pay; } if (paid <= 0n) throw new OpError("nothing-claimable"); break; }
        case "set-reward-rate": { if (!isIssuer) throw new OpError("issuer-only"); accrueShadow(ts); if (!Number.isInteger(op.aprBps) || op.aprBps < 0 || op.aprBps > APR_BPS_CAP) throw new OpError("aprBps-out-of-range"); shadowStaking.aprBps = op.aprBps; break; }
        case "claim-rewards": { accrueShadow(ts); const staked = sBal(actor).staked; const paidI = shadowStaking.paidIndex.get(actor) ?? 0n; const stored = shadowStaking.storedAccrued.get(actor) ?? 0n; const due = staked > 0n ? stored + (staked * (shadowStaking.index - paidI)) / REWARD_SCALE : stored; if (due <= 0n) throw new OpError("nothing-accrued"); const pay = due < sBal(SYS.staking_pool).liquid ? due : sBal(SYS.staking_pool).liquid; if (pay <= 0n) throw new OpError("staking-pool-empty"); sBal(SYS.staking_pool).liquid -= pay; sBal(actor).liquid += pay; shadowStaking.storedAccrued.set(actor, due - pay); shadowStaking.paidIndex.set(actor, shadowStaking.index); break; }
        case "airdrop-claim": { if (shadowAirdrop.has(actor)) throw new OpError("already-claimed"); const reserve = sBal(SYS.airdrop_reserve).liquid; const pay = AIRDROP_PER_CLAIM < reserve ? AIRDROP_PER_CLAIM : reserve; if (pay <= 0n) throw new OpError("airdrop-empty"); sBal(SYS.airdrop_reserve).liquid -= pay; sBal(actor).liquid += pay; shadowAirdrop.add(actor); break; }
        case "htlc-create": { const a = need(op.amount); mv(actor, SYS.htlc_escrow, a); shadowHtlc.set("htlc-" + (shadowSeq + 1), { from: actor, to: op.to, amount: a, hashlock: op.hashlock, timelock: op.timelock, state: "open" }); break; }
        case "htlc-claim": { const h = shadowHtlc.get(op.id); if (!h || h.state !== "open") throw new OpError("htlc-not-open"); if (h.timelock <= Math.floor(ts / 1000)) throw new OpError("htlc-expired"); if (sha256hex(op.preimage) !== h.hashlock) throw new OpError("preimage-mismatch"); if (actor !== h.to) throw new OpError("only-beneficiary"); h.state = "claimed"; mv(SYS.htlc_escrow, h.to, h.amount); break; }
        case "htlc-refund": { const h = shadowHtlc.get(op.id); if (!h || h.state !== "open") throw new OpError("htlc-not-open"); if (h.timelock > Math.floor(ts / 1000)) throw new OpError("htlc-still-locked"); if (actor !== h.from) throw new OpError("only-creator"); h.state = "refunded"; mv(SYS.htlc_escrow, h.from, h.amount); break; }
        case "multisig-propose": { if (!OWNERS.includes(actor)) throw new OpError("owner-only"); if (!Array.isArray(op.ops) || op.ops.length < 1) throw new OpError("bad-ops"); shadowProposals.set("ms-" + (shadowSeq + 1), { ops: op.ops, required: op.required ?? 1, approvals: [actor], executed: false }); break; }
        case "multisig-approve": { if (!OWNERS.includes(actor)) throw new OpError("owner-only"); const p = shadowProposals.get(op.id); if (!p || p.executed) throw new OpError("proposal-not-open"); if (p.approvals.includes(actor)) throw new OpError("already-approved"); p.approvals.push(actor); break; }
        case "multisig-execute": { if (!OWNERS.includes(actor)) throw new OpError("owner-only"); const p = shadowProposals.get(op.id); if (!p || p.executed) throw new OpError("proposal-not-open"); if (p.approvals.length < p.required) throw new OpError("not-enough-approvals"); p.executed = true; for (const inner of p.ops) applyShadow(inner, OWNERS[0], ts); break; }
        case "batch": { if (!Array.isArray(op.ops) || op.ops.length < 1) throw new OpError("bad-ops"); for (const inner of op.ops) { if (inner?.op === "batch" || String(inner?.op ?? "").startsWith("multisig-")) throw new OpError("no-nesting"); applyShadow(inner, actor, ts); } break; }
        default: throw new OpError("unknown-op");
      }
    };
    const shadowProposals = new Map<string, any>();
    for (const line of lines) {
      s++;
      let e: any;
      try { e = JSON.parse(line); } catch { brokenAt = s; break; }
      if (e.seq !== s) { brokenAt = s; break; }
      const h = chainHash(prevH, s, e.op, e.pub ?? "", e.sig ?? null);
      if (h !== e.h) { brokenAt = s; break; }
      if (e.pub && e.pub !== "") {
        if (!verifySig(e.op, e.pub, e.sig ?? { r: "", s: "" })) { brokenAt = s; break; }
      } else if (e.kind !== "deposit-intake") { brokenAt = s; break; }
      try {
        if (e.kind === "genesis") {
          const al = e.op?.allocs ?? {};
          sBal(SYS.staking_pool).liquid = BigInt(al.staking_pool ?? 0);
          sBal(SYS.vesting_vault).liquid = BigInt(al.vesting_vault ?? 0);
          sBal(SYS.treasury).liquid = BigInt(al.treasury ?? 0);
          sBal(SYS.airdrop_reserve).liquid = BigInt(al.airdrop_reserve ?? 0);
          shadowStaking.lastAccrualTs = e.ts;
        } else if (e.kind === "deposit-intake") {
          /* רשומת-קליטה — אפס-אפקט */
        } else {
          applyShadow(e.op, addrFromPub(e.pub) ?? "", e.ts);
        }
      } catch { brokenAt = s; break; }
      prevH = e.h; shadowSeq = s; shadowLast = e.h;
    }
    if (brokenAt === null) {
      // השוואת-מצב: שקלול-סה"כ-האספקה חייב להתאים (עצימות-מלאה ללא-השוואת-כל-כתובת — זול וכנה)
      let shadowSum = 0n; for (const a of shadowBal.values()) shadowSum += a.liquid + a.staked;
      let liveSum = 0n; for (const a of bal.values()) liveSum += a.liquid + a.staked;
      if (shadowSeq !== seq || shadowLast !== lastH || shadowSum !== liveSum || shadowBurned !== burnedTotal) {
        brokenAt = shadowSeq;
      }
    }
  } catch { brokenAt = s; }
  const ms = Date.now() - t0;
  if (brokenAt !== null) console.error(`[sovereign-token] VERIFY-BROKEN at seq=${brokenAt}`);
  return { ok: brokenAt === null, checked: brokenAt === null ? s : s - 1, brokenAt, ms };
}

/* ── הסגר (דפוס fleet-economy — כנה; טוקן = אין-ריפוי-אוטומטי, רק עצירה-כנה) ── */
function quarantine(reason: string) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(QUARANTINE_DIR, `${ts}·${reason.slice(0, 60).replace(/[\/\s]/g, "_")}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of [LEDGER_FILE, SNAP_FILE]) {
      if (fs.existsSync(f)) { try { fs.renameSync(f, path.join(dir, path.basename(f))); } catch { fs.copyFileSync(f, path.join(dir, path.basename(f))); } }
    }
    fs.writeFileSync(path.join(dir, "REASON.txt"), reason + "\n");
  } catch { /* כנה */ }
  quarantined = reason;
  verifyOk = false;
  console.error(`[sovereign-token] הסגר-כנה: ${reason}`);
}

/* ── לוגים-חסומים (cap + ארכיון-אחד · דפוס bounded-logs) ── */
function appendBounded(file: string, obj: unknown, cap: number) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(obj) + "\n");
    try {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      if (lines.length > cap) {
        const tail = lines.slice(-cap);
        const arch = file + ".archive-1";
        fs.writeFileSync(arch, lines.slice(0, lines.length - cap).join("\n") + "\n");
        fs.writeFileSync(file, tail.join("\n") + "\n");
      }
    } catch { /* best-effort */ }
  } catch (e) { console.error(`[sovereign-token] log-fail ${path.basename(file)}:`, String(e).slice(0, 80)); }
}

/* ═══════════════ API :3025 ═══════════════ */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};
/* BigInt-safe: כל-תוצאת-חוזה עשויה-לשאת מיקרו-יחידות-כ-BigInt — ממסגרים-למחרוזת */
const jsonReplacer = (_k: unknown, v: unknown) => typeof v === "bigint" ? v.toString() : v;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, jsonReplacer), { status: Number.isInteger(status) && status >= 200 && status <= 599 ? status : 200, headers: { "content-type": "application/json", ...CORS } });

function fmt(micro: bigint): string {
  const neg = micro < 0n; const a = neg ? -micro : micro;
  const s = a.toString().padStart(7, "0");
  return (neg ? "-" : "") + s.slice(0, s.length - 6) + "." + s.slice(-6);
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "GET" && p === "/health") {
    return json({ ok: true, service: SERVICE, port: PORT, seq, lastH, verifyOk, uptimeMs: Date.now() - bootAt, quarantined });
  }
  if (req.method === "GET" && p === "/meta") {
    return json({
      ok: true, service: SERVICE, port: PORT,
      token: { symbol: "SAOSX", name: "SAOS Sovereign Contract Token", decimals: 6, cap: Number(CAP), burned: Number(burnedTotal), supply: Number(supply()), unit: "micro (1e6 per SAOSX)" },
      genesis: { seq: 1, prevH: "GENESIS-SAOSX", allocs: { staking_pool: Number(GEN_STAKING_POOL), vesting_vault: Number(GEN_VESTING_VAULT), treasury: Number(GEN_TREASURY), airdrop_reserve: Number(GEN_AIRDROP) } },
      issuer: { stmPub: ISSUER.stmPub, address: ISSUER_ADDR }, // זהות-ציבורית בלבד — אף-סוד-לא-עובר-כאן
      signature: { scheme: "secp256k1", digest: "sha256(canonicalJSON(op))", addr: "ripemd160(sha256(compressedPub))" },
      ops: ["transfer", "burn", "stake", "unstake", "delegate", "undelegate", "create-vesting", "claim-vesting", "set-reward-rate", "claim-rewards", "airdrop-claim", "htlc-create", "htlc-claim", "htlc-refund", "multisig-propose", "multisig-approve", "multisig-execute", "batch"],
      honesty: {
        unstake: "immediate-in-v1-no-unbonding",
        rewards: "accrue-to-stakers-only",
        delegation: "power-only-not-spendable-no-rewards-steem-HP-style",
        replay: "signed-op-re-executable-by-design-ledger-seq-defines-order",
        airdrop: "1-claim-per-caller-address-1000-SAOSX-max",
      },
    });
  }
  if (req.method === "GET" && p === "/snapshot") {
    accrue(Date.now()); // תצוגה-בלבד — עדכון-אינדקס-בזיכרון, אף-בור-לא-נשאב
    const holders = [...bal.entries()]
      .filter(([a]) => !SYSTEM_ADDRS.has(a))
      .map(([a, v]) => ({ addr: a, balance: Number(v.liquid + v.staked) }))
      .filter((h) => h.balance > 0)
      .sort((x, y) => y.balance - x.balance)
      .slice(0, 20);
    return json({
      ok: true,
      supply: Number(supply()), cap: Number(CAP), burned: Number(burnedTotal),
      pools: {
        staking_pool: Number(acct(SYS.staking_pool).liquid),
        vesting_vault: Number(acct(SYS.vesting_vault).liquid),
        treasury: Number(acct(SYS.treasury).liquid),
        airdrop_reserve: Number(acct(SYS.airdrop_reserve).liquid),
      },
      staking: {
        totalStaked: Number(totalStaked()),
        aprBps: staking.aprBps,
        rewardRemaining: Number(acct(SYS.staking_pool).liquid),
        stakers: [...bal.keys()].filter((a) => bal.get(a)!.staked > 0n).length,
      },
      contracts: { vestings: vestings.size, openHtlcs: [...htlcs.values()].filter((h) => h.state === "open").length, openProposals: [...proposals.values()].filter((p) => !p.executed).length },
      holders, lastSeq: seq, lastRoot: lastH, verifyOk, lastVerify, updatedAt: new Date().toISOString(),
    });
  }
  if (req.method === "GET" && p.startsWith("/balance/")) {
    const a = decodeURIComponent(p.slice("/balance/".length));
    const b = acct(a);
    let power = 0n; // כוח-שהתקבל-מדלגציה (מוצג — לא ניתן-להוצאה)
    for (const [, m] of delegOut) for (const [t, amt] of m) if (t === a) power += amt;
    let delegatedOutTotal = 0n; const outs = delegOut.get(a) ?? new Map<string, bigint>();
    for (const v of outs.values()) delegatedOutTotal += v;
    const vestPending = [...vestings.values()].filter((v) => v.beneficiary === a).reduce((acc, v) => {
      const window = Math.max(1, v.endTs - v.cliffTs);
      const el = Math.min(Math.max(Date.now() - v.cliffTs, 0), window);
      const released = (v.total * BigInt(el)) / BigInt(window);
      return acc + (released - v.claimed > 0n ? released - v.claimed : 0n);
    }, 0n);
    return json({
      ok: true, addr: a, liquid: Number(b.liquid), staked: Number(b.staked),
      display: fmt(b.liquid + b.staked),
      power: Number(power), delegatedOut: Number(delegatedOutTotal),
      vestingClaimable: Number(vestPending), rewardsAccrued: Number(accruedOf(a)),
      airdropClaimed: airdropClaimed.has(a),
      openHtlcs: [...htlcs.values()].filter((h) => h.state === "open" && (h.from === a || h.to === a)).map((h) => ({ id: h.id, role: h.from === a ? "creator" : "recipient", amount: Number(h.amount), timelock: h.timelock })),
    });
  }
  if (req.method === "GET" && p.startsWith("/history/")) {
    const a = decodeURIComponent(p.slice("/history/".length));
    const lim = Math.min(HISTORY_CAP, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const out = historyRing.filter((e) => e.from === a || e.to === a).slice(-lim).reverse();
    return json({ ok: true, addr: a, count: out.length, entries: out });
  }
  if (req.method === "GET" && p === "/verify") {
    const r = verifyChain();
    verifyOk = r.ok; lastVerify = { at: Date.now(), ...r };
    snapshotSave();
    return json({ ok: r.ok, checked: r.checked, brokenAt: r.brokenAt, ms: r.ms });
  }
  if (req.method === "POST" && p === "/ops") {
    const clen = +(req.headers.get("content-length") ?? 0);
    let body: any = null;
    try {
      const txt = await req.text();
      if (txt.length > BODY_CAP || clen > BODY_CAP) return json({ ok: false, error: "payload-too-large", cap: BODY_CAP }, { status: 413 });
      body = JSON.parse(txt);
    } catch { return json({ ok: false, error: "bad-json" }, { status: 400 }); }
    if (!body || typeof body !== "object") return json({ ok: false, error: "bad-payload" }, { status: 400 });
    const { op, pub, sig } = body;
    if (typeof pub !== "string" || !/^[0-9a-f]{66}$/.test(pub)) return json({ ok: false, error: "bad-pub" }, { status: 400 });
    if (!op || typeof op !== "object") return json({ ok: false, error: "bad-op" }, { status: 400 });
    if (!sig || typeof sig !== "object") return json({ ok: false, error: "bad-sig" }, { status: 400 });
    if (!verifySig(op, pub, sig)) return json({ ok: false, error: "bad-signature" }, { status: 401 });
    try {
      const r = applySignedOp(op, pub, sig);
      return json({ ok: true, seq: r.seq, h: r.h, result: r.result });
    } catch (e) {
      const code = e instanceof OpError ? e.code : "apply-failed";
      return json({ ok: false, error: code, seq, lastH }, { status: 422 });
    }
  }
  return json({ ok: false, reason: "not-found" }, { status: 404 });
}

/* ═══════════════ עיגון-בכלכלה (כל-5דק · דפוס fail-honest) ═══════════════ */
async function anchorOnce() {
  /* הכלכלה מאמתת amount>0 (חוק-אנטי-אפס) — עוגן-אמת = 1µ-USDS סימון + שורש-מלא בסיבה */
  const payload = { kind: "service", from: "treasury", to: "pool", asset: "USDS", amount: 0.000001, reason: `SAOSX-anchor seq=${seq} root=${lastH}`, ref: `saosx-${seq}` };
  const entry = { ts: new Date().toISOString(), seq, root: lastH, payload };
  try {
    const r = await fetch(ECONOMY_INGEST, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(6000),
    });
    const j = await r.json().catch(() => ({}));
    appendBounded(ANCHOR_LOG, { ...entry, http: r.status, ok: !!j.ok, dedup: !!j.dedup, error: j.error ?? null }, 500);
    if (!j.ok) console.warn(`[sovereign-token] anchor rejected: ${j.error ?? r.status}`);
  } catch (e) {
    // כלכלה-שנפלה = נסה-שוב-במחזור-הבא, fail-honest, אף-קריסה
    appendBounded(ANCHOR_LOG, { ...entry, http: 0, ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 120) }, 500);
  }
}

/* ═══════════════ צופה-הפקדות (Steem → headcorner · כל-120ש׳) ═══════════════
 * רשומת-קליטה בלבד (kind=deposit-intake) — אפס-אפקט-יתרות בספר-SAOSX.
 * כנות: לעולם לא ממציאים פקדות; dedup לפי-txref; מקס 3 עמודים-אחורה. */
const RPCS = ["https://api.steemit.com", "https://api.justyy.com"];
let depositSeen: Record<string, number> = {};
try { depositSeen = JSON.parse(fs.readFileSync(DEPOSIT_SEEN, "utf8")); } catch { /* עדיין-אין */ }
function saveDepositSeen() {
  try {
    const entries = Object.entries(depositSeen).sort((a, b) => b[1] - a[1]).slice(0, 5000);
    const tmp = DEPOSIT_SEEN + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(entries)));
    fs.renameSync(tmp, DEPOSIT_SEEN);
  } catch { /* best-effort */ }
}
async function depositWatchOnce() {
  if (quarantined) return;
  let page = 0; let start: number | -1 = -1;
  let workingRpc: string | null = null;
  const found: any[] = [];
  while (page < 3) {
    let items: any[] | null = null;
    for (const rpc of workingRpc ? [workingRpc] : RPCS) {
      try {
        const r = await fetch(rpc, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "condenser_api.get_account_history", params: ["headcorner", start, 200, { select_ops: ["transfer"] }], id: 1 }),
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) throw new Error(`http-${r.status}`);
        const j = await r.json();
        if (!j.result || !Array.isArray(j.result)) throw new Error("bad-shape");
        items = j.result; workingRpc = rpc;
        break;
      } catch { /* מקור-הבא */ }
    }
    if (!items) break; // fail-honest — אין-המצאה
    let lowest = start;
    for (const item of items) {
      const [idx, ev] = item;
      if (typeof idx === "number" && (lowest === -1 || idx < lowest)) lowest = idx;
      const op = ev?.op;
      if (!Array.isArray(op) || op[0] !== "transfer") continue;
      const body = op[1] ?? {};
      const memo = String(body.memo ?? "");
      if (body.to !== "headcorner" || !memo.trim().toLowerCase().startsWith("saos-deposit")) continue;
      const txref = String(ev.trx_id ?? `${ev.block ?? "?"}-${idx}`);
      if (depositSeen[txref]) continue;
      const m = memo.match(/([0-9a-f]{40})/i);
      const saosAddr = m ? m[1].toLowerCase() : null;
      const amountStr = String(body.amount ?? "");
      const cur = amountStr.split(" ")[1] ?? "";
      const amt = Number(amountStr.split(" ")[0] ?? 0);
      depositSeen[txref] = Date.now();
      const rec = { ts: new Date().toISOString(), txref, from: body.from ?? null, amount: amountStr, currency: cur, amountNum: Number.isFinite(amt) ? amt : null, saosAddr, block: ev.block ?? null, idx, chainTs: ev.timestamp ?? null };
      found.push(rec);
      appendBounded(DEPOSIT_LOG, rec, 500);
      if (saosAddr) {
        try {
          const depOp = { deposit: rec, note: "intake-record-only-no-balance-effect-steem-channel" };
          const s = seq + 1;
          const h = chainHash(lastH, s, depOp, "", null);
          fs.appendFileSync(LEDGER_FILE, JSON.stringify({ seq: s, ts: Date.now(), kind: "deposit-intake", op: depOp, pub: "", sig: null, h }) + "\n");
          seq = s; lastH = h;
          pushHistory({ seq: s, ts: Date.now(), kind: "deposit-intake", op: depOp, from: rec.from, to: saosAddr, amount: rec.amountNum });
        } catch (e) { console.error("[sovereign-token] deposit-intake-append-fail:", String(e).slice(0, 100)); }
      }
    }
    if (lowest === -1 || lowest <= 1 || lowest <= start - 199) break; // תחתית-ההיסטוריה
    start = Math.max(1, lowest - 1);
    page++;
  }
  if (found.length > 0) { snapshotSave(); console.info(`[sovereign-token] deposit-intake: ${found.length} פקדות-חדשות`); }
  saveDepositSeen();
}

/* ═══════════════ עלייה ═══════════════ */
const g = globalThis as unknown as { __saosxBooted?: boolean };
if (!g.__saosxBooted) {
  g.__saosxBooted = true;
  bootAt = Date.now();
  const t0 = Date.now();
  const { replayed } = loadStateFromDisk();
  const v = verifyChain();
  verifyOk = v.ok; lastVerify = { at: Date.now(), ...v };
  if (!v.ok) quarantine(`boot-verify-brokenAt-${v.brokenAt}`);
  /* רשת-ביטחון: אף-חריגה-לא-מפילה-תשובה — כשל-פנימי חוזר-כ-JSON-כן */
  Bun.serve({ port: PORT, hostname: "0.0.0.0", idleTimeout: 60, fetch: (req) =>
    Promise.resolve()
      .then(() => handle(req))
      .catch((e) => json({ ok: false, error: "internal", detail: String((e as Error)?.message ?? e).slice(0, 160) }))
  });
  console.info(`[sovereign-token] חי על :${PORT} · seq=${seq} · root=${lastH.slice(0, 16)}… · replayed=${replayed} · verify=${v.ok ? "ok" : "BROKEN"} (${v.ms}ms) · boot=${Date.now() - t0}ms`);
  // לולאות-חיים: אימות-עצמי 60ש׳ · עיגון 5דק' (ניסיון-ראשון מהר) · צופה-פקדות 120ש׳
  setInterval(() => {
    if (quarantined) return; // בהסגר אין-עבודה — הכנות-היא-המצב
    const r = verifyChain();
    verifyOk = r.ok; lastVerify = { at: Date.now(), ...r };
    if (!r.ok) quarantine(`self-verify-brokenAt-${r.brokenAt}`);
    else snapshotSave();
  }, 60_000);
  setTimeout(() => { void anchorOnce(); setInterval(() => void anchorOnce(), 300_000); }, 15_000);
  setTimeout(() => { void depositWatchOnce(); setInterval(() => void depositWatchOnce(), 120_000); }, 20_000);
}
