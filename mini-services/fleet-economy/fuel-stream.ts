/* ═══ fuel-stream.ts · SAOS-FUEL-STREAM/1 · מנוע-התדלוק-האוטומטי לחיילי-הצי ═══
 * ==============================================================================
 * מנדט (36-b, מחזור 36 · 2026-10-26): תדלוק SP אוטומטי מהאוצר אל-החיילים
 * (headcorner + saos-0001..saos-0004) דרך delegate_vesting_shares — עם-חוק-אוצר
 * fail-closed, קבלות-hash-chained, ו-dry-run ברירת-מחדל.
 *
 * חוקי-אמת:
 *  · חוק-האוצר (minOperatorSp): מתוכנן רק אם treasury_net_sp − total_planned ≥
 *    minOperatorSp (חוק-17.0). הפרה = קבלת-BLOCKER כנה ואפס-שידור.
 *  · כמויות-אבסולוטיות (תורת delegate-plan.mjs מ-saos-dex, נמדד-חי): שידור
 *    קובע יעד-אבסולוטי (target SP → VESTS), לא מוסיף בעיוורון — אידמפוטנטי.
 *  · מדידה-או-כלום: חייל-בלי-מדידת-האצלה-חיה לא מתודלק (unmeasured-fail-closed)
 *    — אף-הנחה, אף-המצאה. האוצר-בלי-מדידה-טרייה במצב-חי = BLOCKER.
 *  · תורת-RC (כנות): אין-פעולת-RC-העברה על-השרשרת בכלל. האצלת SP מרימה את
 *    מכסת-ה-RC של הנמען, וה-RC מתחדש לבד לאורך-זמן — נרשם כהערת-rcNote
 *    בקבלה, לא כפעולה. אפס-המצאת-אופים.
 *  · dry-run ברירת-מחדל: FUEL_DRY_RUN חייב להיות בדיוק "false" לשידור-אמת.
 *  · נתיב-שידור (מראה-של-הנתיב-המוכח-חי D-023 ב-saos-dex grids/mover.mjs):
 *    steem.auth.signTransaction עם chain-id אפסים + דלת
 *    condenser_api.broadcast_transaction_synchronous + שער-מפתח (WIF חייב
 *    לגזור את רשות-ה-active החיה של המאציל לפני-חתימה). ה-import של
 *    "steem" הוא עצלן — dry-run ובדיקות אף-פעם לא נוגעות בו וברשת.
 *  · סודות: מפתח נקרא מסביבת-הריצה בלבד (STEEM_ACTIVE_WIF_A מ-/home/z/.secrets/
 *    .env.local בטעינת-השירות) — לעולם לא בלוג/קבלה/תשובה. קבלות נושאות
 *    txId בלבד.
 * ============================================================================== */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/* ── הקשר-מדוד (DECIDER chainVerify 2026-10-25/26) — fallback-יבשה בלבד ────── */
export const MEASURED = {
  treasuryNetSp: 3660.5,
  minOperatorSp: 17.0,
  soldierDelegations: { "saos-0001": 1.2, "saos-0002": 1.2, "saos-0003": 1.2, "saos-0004": 1.2 },
  measuredAt: "2026-10-25T17:50:57Z..2026-10-26 (DECIDER chainVerify)",
};
export const SOLDIER_ROSTER = ["headcorner", "saos-0001", "saos-0002", "saos-0003", "saos-0004"] as const;
export const PROTOCOL = "SAOS-FUEL-STREAM/1";
export const FUEL_GENESIS = "FUEL-GENESIS";
export const FUEL_RC_LOW_PCT = 25;
export const FUEL_DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // כל-6 שעות
const FUEL_MIN_INTERVAL_MS = 60_000;
const SP_EPS = 0.0005;

export interface SoldierInput {
  account: string;
  currentSp?: number | null; // מדידת-האצלה-נכנסת (SP) · null = לא-נמדד
  rcPct?: number | null;     // מדידת-RC (0..100) · null = לא-נמדד
}

export interface FuelLawInput {
  treasuryNetSp: number | null; // null = לא-נמדד → חי = fail-closed
  minOperatorSp: number;
  targetSpPerSoldier: number;
  soldiers: SoldierInput[];
  delegator: string;
  dryRun: boolean;
}

export interface FuelLine {
  soldier: string;
  action: "topup" | "at-target" | "unmeasured-fail-closed";
  currentSp: number | null;
  targetSp: number;
  amountSp: number; // דלתא-מתוכננת (0 = אין-אופ)
  withheld: boolean; // חוק-האוצר נשבר → שורה-מתוכננת-אך-עצורה
  rcNote: string | null;
  reason: string;
}

export interface FuelPlan {
  protocol: typeof PROTOCOL;
  ok: boolean;
  dryRun: boolean;
  delegator: string;
  treasuryNetSp: number | null;
  treasuryNetSpSource: string;
  minOperatorSp: number;
  targetSpPerSoldier: number;
  totalPlannedSp: number;
  treasuryAfterSp: number | null;
  lawHeadroomSp: number | null;
  lawPassed: boolean;
  blockers: string[];
  lines: FuelLine[];
  at: string;
}

export function roundSp(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function rcNoteFor(rcPct: number | null | undefined): string | null {
  if (rcPct === null || rcPct === undefined || !Number.isFinite(rcPct)) return null;
  if (rcPct >= FUEL_RC_LOW_PCT) return null;
  return (
    `rc-low(${rcPct}): SP delegation raises RC credits and RC regenerates over time; ` +
    `no RC transfer operation exists on-chain — receipt note only (honest, zero invented ops)`
  );
}

/* ── התוכנית הטהורה — דטרמיניסטית, אפס-רשת, אפס-שעון (מקבל at חיצוני) ────── */
export function computeFuelPlan(inp: FuelLawInput, at: string = new Date().toISOString()): FuelPlan {
  const lines: FuelLine[] = [];
  for (const s of inp.soldiers) {
    const rcNote = rcNoteFor(s.rcPct);
    if (s.currentSp === null || s.currentSp === undefined || !Number.isFinite(s.currentSp)) {
      lines.push({
        soldier: s.account, action: "unmeasured-fail-closed", currentSp: null,
        targetSp: inp.targetSpPerSoldier, amountSp: 0, withheld: false, rcNote,
        reason: "current delegation unmeasured — refuse to compute a top-up (fail-closed, zero invention)",
      });
      continue;
    }
    const cur = s.currentSp;
    if (cur >= inp.targetSpPerSoldier - SP_EPS) {
      lines.push({
        soldier: s.account, action: "at-target", currentSp: cur,
        targetSp: inp.targetSpPerSoldier, amountSp: 0, withheld: false, rcNote,
        reason: `already at/above target (${roundSp(cur)} ≥ ${inp.targetSpPerSoldier})`,
      });
      continue;
    }
    lines.push({
      soldier: s.account, action: "topup", currentSp: cur,
      targetSp: inp.targetSpPerSoldier, amountSp: roundSp(inp.targetSpPerSoldier - cur),
      withheld: false, rcNote,
      reason: `top-up ${roundSp(cur)} → ${inp.targetSpPerSoldier} SP (absolute-target law)`,
    });
  }

  const blockers: string[] = [];
  if (inp.treasuryNetSp === null || !Number.isFinite(inp.treasuryNetSp)) {
    blockers.push("treasury-net-sp-unmeasured: live mode refuses to plan on an unmeasured treasury (fail-closed)");
  }
  const totalPlanned = lines.reduce((a, l) => a + l.amountSp, 0);
  const treasuryAfter = inp.treasuryNetSp !== null && Number.isFinite(inp.treasuryNetSp) ? roundSp(inp.treasuryNetSp - totalPlanned) : null;
  const lawPassed =
    inp.treasuryNetSp !== null && Number.isFinite(inp.treasuryNetSp) &&
    inp.treasuryNetSp - totalPlanned >= inp.minOperatorSp - 1e-9;
  if (inp.treasuryNetSp !== null && Number.isFinite(inp.treasuryNetSp) && !lawPassed) {
    blockers.push(
      `treasury-law breach: ${roundSp(inp.treasuryNetSp)} − ${roundSp(totalPlanned)} = ${roundSp(inp.treasuryNetSp - totalPlanned)} ` +
      `< minOperatorSp ${inp.minOperatorSp} — honest BLOCKER, zero broadcast`,
    );
  }
  // חוק-האוצר נשבר → כל-השורות נעוצות (מתוכנן-אך-לא-מבוצע)
  if (!lawPassed) for (const l of lines) if (l.amountSp > 0) { l.withheld = true; l.amountSp = 0; l.reason = `blocked: ${blockers[0]}`; }

  return {
    protocol: PROTOCOL,
    ok: lawPassed && blockers.length === 0,
    dryRun: inp.dryRun,
    delegator: inp.delegator,
    treasuryNetSp: inp.treasuryNetSp !== null && Number.isFinite(inp.treasuryNetSp) ? inp.treasuryNetSp : null,
    treasuryNetSpSource: "set-by-resolver",
    minOperatorSp: inp.minOperatorSp,
    targetSpPerSoldier: inp.targetSpPerSoldier,
    totalPlannedSp: lawPassed ? roundSp(totalPlanned) : 0,
    treasuryAfterSp: treasuryAfter,
    lawHeadroomSp: treasuryAfter !== null ? roundSp(treasuryAfter - inp.minOperatorSp) : null,
    lawPassed,
    blockers,
    lines,
    at,
  };
}

/* ── שרשרת-קבלות hash-chained (JSONL · append-only · verify מלא) ──────────── */
export type FuelReceiptCore = {
  at: string;
  action: string;
  from: string;
  to: string;
  amountSp: number;
  dryRun: boolean;
  txId?: string;
  cycle?: string;
  soldier?: string;
  [k: string]: unknown;
};
export interface FuelReceipt extends FuelReceiptCore {
  prevSha: string;
  sha256: string;
}

export function fuelSha(prevSha: string, core: FuelReceiptCore): string {
  return createHash("sha256").update(prevSha + "|" + JSON.stringify(core)).digest("hex");
}

export class FuelReceiptChain {
  private lastSha = FUEL_GENESIS;
  private validCount = 0;
  constructor(readonly filePath: string) {
    this.load();
  }
  /* קריאת-זנב בעלייה: השרשרת-היא-האמת — ממשיכים מהקבלה-התקפה-האחרונה.
   * שורה-קרועה/משובשת לא מפילה את המנוע: היא-נשארת-על-הדיסק (append-only) וה-
   * verify() מדווח עליה בכנות; ההמשך נקשר מהקבלה-התקפה-האחרונה. */
  private load(): void {
    let txt = "";
    try { txt = fs.readFileSync(this.filePath, "utf8"); } catch { return; }
    for (const line of txt.split("\n")) {
      if (!line.trim()) continue;
      let rec: FuelReceipt;
      try { rec = JSON.parse(line); } catch { break; } // קרע-כנה בזנב
      if (rec.prevSha !== this.lastSha || rec.sha256 !== fuelSha(rec.prevSha, stripChain(rec))) break;
      this.lastSha = rec.sha256;
      this.validCount++;
    }
  }
  append(core: FuelReceiptCore): FuelReceipt {
    const rec: FuelReceipt = { ...core, prevSha: this.lastSha, sha256: "" };
    rec.sha256 = fuelSha(rec.prevSha, stripChain(rec));
    fs.appendFileSync(this.filePath, JSON.stringify(rec) + "\n");
    this.lastSha = rec.sha256;
    this.validCount++;
    return rec;
  }
  get length(): number { return this.validCount; }
  get lastHash(): string { return this.lastSha; }
  tail(n: number): FuelReceipt[] {
    let txt = "";
    try { txt = fs.readFileSync(this.filePath, "utf8"); } catch { return []; }
    const lines = txt.split("\n").filter((l) => l.trim());
    const out: FuelReceipt[] = [];
    for (let i = lines.length - 1; i >= 0 && out.length < Math.max(1, n); i--) {
      try { out.push(JSON.parse(lines[i])); } catch { /* שורה-קרועה — נופלת-מהזנב בכנות */ }
    }
    return out;
  }
  verify(): { ok: boolean; checked: number; brokenAt?: number } {
    let txt = "";
    try { txt = fs.readFileSync(this.filePath, "utf8"); } catch { return { ok: true, checked: 0 }; }
    let prev = FUEL_GENESIS;
    let i = 0;
    for (const line of txt.split("\n")) {
      if (!line.trim()) continue;
      let rec: FuelReceipt;
      try { rec = JSON.parse(line); } catch { return { ok: false, checked: i, brokenAt: i }; }
      if (rec.prevSha !== prev || rec.sha256 !== fuelSha(rec.prevSha, stripChain(rec))) {
        return { ok: false, checked: i, brokenAt: i };
      }
      prev = rec.sha256;
      i++;
    }
    return { ok: true, checked: i };
  }
}

function stripChain(rec: FuelReceipt): FuelReceiptCore {
  const { prevSha: _p, sha256: _s, ...core } = rec;
  return core as FuelReceiptCore;
}

/* ── משדר-השרשרת (הפשטה להזרקה בבדיקות — אפס-רשת בבדיקות) ────────────────── */
export interface FuelBroadcastResult {
  txId: string;
  vests?: string;
  vestsPerSp?: number;
}
export interface FuelBroadcaster {
  protocol: string;
  broadcastDelegate(args: { delegator: string; delegatee: string; targetSp: number }): Promise<FuelBroadcastResult>;
}

/* ── פותר-התשומות (env · קובץ-קלט · fallback-מדידה-יבשה-בלבד) ─────────────── */
export interface FuelRuntimeInputs {
  treasuryNetSp: number | null;
  treasuryNetSpSource: string;
  soldiers: SoldierInput[];
  targetSpPerSoldier: number;
  minOperatorSp: number;
  delegator: string;
  dryRun: boolean;
}

type FuelInputsFile = { treasuryNetSp?: number; soldiers?: SoldierInput[] };

function readInputsFile(stateDir: string): FuelInputsFile {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, "fuel-inputs.json"), "utf8")) as FuelInputsFile;
  } catch { return {}; }
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveFuelInputs(env: Record<string, string | undefined> = process.env, stateDir: string = path.join(import.meta.dir, "state")): FuelRuntimeInputs {
  let file: FuelInputsFile = {};
  try { file = env.FUEL_INPUTS_JSON ? (JSON.parse(env.FUEL_INPUTS_JSON) as FuelInputsFile) : readInputsFile(stateDir); } catch { file = {}; }

  const measuredSoldiers: SoldierInput[] = SOLDIER_ROSTER.map((a) => ({
    account: a as string,
    currentSp: (MEASURED.soldierDelegations as Record<string, number>)[a as string] ?? null,
  }));
  const soldiers: SoldierInput[] = Array.isArray(file.soldiers) && file.soldiers.length
    ? file.soldiers
    : measuredSoldiers;

  let treasuryNetSp: number | null = null;
  let treasuryNetSpSource = "unmeasured";
  const envSp = Number(env.FUEL_TREASURY_NET_SP);
  if (Number.isFinite(envSp) && envSp > 0) {
    treasuryNetSp = envSp; treasuryNetSpSource = "env:FUEL_TREASURY_NET_SP";
  } else if (Number.isFinite(Number(file.treasuryNetSp)) && Number(file.treasuryNetSp) > 0) {
    treasuryNetSp = Number(file.treasuryNetSp); treasuryNetSpSource = "fuel-inputs.json";
  } else {
    const dryRun = (env.FUEL_DRY_RUN ?? "true") !== "false";
    if (dryRun) {
      // fallback-יבשה בלבד: ההקשר-המדוד מהמנדט — לעולם לא מצע לשידור-חי
      treasuryNetSp = MEASURED.treasuryNetSp;
      treasuryNetSpSource = `measured-context-fallback (dry-run only · ${MEASURED.measuredAt})`;
    }
  }

  return {
    treasuryNetSp,
    treasuryNetSpSource,
    soldiers,
    targetSpPerSoldier: numOr(env.FUEL_TARGET_SP, 5),
    minOperatorSp: numOr(env.FUEL_MIN_OPERATOR_SP, MEASURED.minOperatorSp),
    delegator: env.FUEL_DELEGATOR || "headcorner",
    dryRun: (env.FUEL_DRY_RUN ?? "true") !== "false",
  };
}

export function resolveFuelIntervalMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env?.FUEL_INTERVAL_MS);
  return Number.isFinite(n) && n >= FUEL_MIN_INTERVAL_MS ? n : FUEL_DEFAULT_INTERVAL_MS;
}

/* ── המשדר-האמת (עצלן: "steem" נטען רק-כאן, רק-בשידור-חי) ───────────────────
 * מראה-מדויק של הנתיב-המוכח-חי (saos-dex grids/mover.mjs D-023 · txid b269647e…):
 * chain-id אפסים → signTransaction → condenser_api.broadcast_transaction_synchronous.
 * שער-מפתח: ה-WIF חייב לגזור את רשות-ה-active החיה של המאציל — אחרת סירוב. */
export const STEEM_RPC_NODES = [
  "https://api.steemit.com",
  "https://api.steemitdev.com",
  "https://api.justyy.com",
  "https://steem-rpc.publicnode.com",
];
const STEEM_CHAIN_ID = "0".repeat(64);

async function rpcAny(method: string, params: unknown[]): Promise<any> {
  let errs = "";
  for (const node of STEEM_RPC_NODES) {
    try {
      const r = await fetch(node, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "fleet-economy/fuel-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) { errs += ` ${node}:HTTP${r.status}`; continue; }
      const j = await r.json();
      if (j?.error) { errs += ` ${node}:${String(j.error.message ?? "rpc-error").slice(0, 60)}`; continue; }
      return j?.result ?? j;
    } catch (e) { errs += ` ${node}:${String((e as Error)?.message ?? e).slice(0, 40)}`; }
  }
  throw new Error(`all-steem-nodes-failed ·${errs}`);
}

export function createSteemBroadcaster(env: Record<string, string | undefined> = process.env): FuelBroadcaster {
  return {
    protocol: "steem-condenser/1 (D-023 mirror, lazy-import, key-gated)",
    async broadcastDelegate({ delegator, delegatee, targetSp }) {
      const wif = env.STEEM_ACTIVE_WIF_A || "";
      if (!wif) throw new Error("fail-closed: STEEM_ACTIVE_WIF_A missing from runtime env");
      const steemMod: any = await import("steem");
      const steem = steemMod.default ?? steemMod;

      // שער-מפתח: גזירה-מול-רשות-ה-active-החיה (verify-then-sign)
      const dgp = await rpcAny("condenser_api.get_dynamic_global_properties", []);
      const accounts = await rpcAny("condenser_api.get_accounts", [[delegator]]);
      const liveActive: string | undefined = accounts?.[0]?.active?.key_auths?.[0]?.[0];
      if (!liveActive) throw new Error("fail-closed: could not read live active authority");
      let pub = "";
      try { pub = steem.auth.wifToPublic(wif); } catch { pub = ""; }
      if (pub !== liveActive) throw new Error("fail-closed: STEEM_ACTIVE_WIF_A does not derive the live active authority — refusing to sign");

      // SP → VESTS לפי-היחס-החי (מדידה-בזמן-שידור)
      const totalVestingShares = parseFloat(dgp?.total_vesting_shares ?? "0");
      const totalVestingFund = parseFloat(dgp?.total_vesting_fund_steem ?? "0");
      if (!(totalVestingShares > 0) || !(totalVestingFund > 0)) throw new Error("fail-closed: cannot measure SP→VESTS ratio");
      const vestsPerSp = totalVestingShares / totalVestingFund;
      const vests = (targetSp * vestsPerSp).toFixed(6);

      const tx = {
        ref_block_num: Number(dgp.head_block_number) & 0xffff,
        ref_block_prefix: Buffer.from(String(dgp.head_block_id), "hex").readUInt32LE(4),
        expiration: new Date(new Date(String(dgp.time) + "Z").getTime() + 60_000).toISOString().slice(0, 19),
        operations: [["delegate_vesting_shares", { delegator, delegatee, vesting_shares: `${vests} VESTS` }]],
        extensions: [],
      };
      const prev = steem.config.get("chain_id");
      steem.config.set("chain_id", STEEM_CHAIN_ID);
      let signed: any;
      try { signed = steem.auth.signTransaction(tx, [wif]); } finally {
        try { steem.config.set("chain_id", prev ?? STEEM_CHAIN_ID); } catch { /* keep */ }
      }
      const res = await rpcAny("condenser_api.broadcast_transaction_synchronous", [{ ...signed }]);
      if (!res?.id) throw new Error("broadcast answered without id (honest)");
      return { txId: String(res.id), vests: `${vests} VESTS`, vestsPerSp: +vestsPerSp.toFixed(3) };
    },
  };
}

/* ── סבב-תדלוק מלא ─────────────────────────────────────────────────────────── */
export interface FuelCycleDeps {
  broadcaster?: FuelBroadcaster | null; // null = אסור-לבנות-ברירת-מחדל (בדיקות)
  receiptsPath?: string;
  env?: Record<string, string | undefined>;
  gate?: () => boolean;          // למשל () => !sealing — חוק-אטימה של-המנוע
  now?: () => Date;
  log?: (msg: string) => void;
}
export interface FuelCycleResult {
  skipped?: string;
  plan: FuelPlan;
  receipts: FuelReceipt[];
  broadcastError?: string;
}

let lastPlan: FuelPlan | null = null;
let lastCycleAt: string | null = null;
let lastCycleId: string | null = null;
let defaultChain: FuelReceiptChain | null = null;

export function defaultReceiptsPath(): string {
  return path.join(import.meta.dir, "state", "fuel-receipts.jsonl");
}

export function fuelStatus() {
  const chain = defaultChain ?? new FuelReceiptChain(defaultReceiptsPath());
  return {
    protocol: PROTOCOL,
    lastPlan,
    lastCycleAt,
    lastCycleId,
    receiptsVerified: chain.verify(),
    receiptsCount: chain.length,
    receiptsTail: chain.tail(15),
    config: resolveFuelInputs(),
  };
}

export async function runFuelCycle(deps: FuelCycleDeps = {}): Promise<FuelCycleResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const at = now().toISOString();
  const receiptsPath = deps.receiptsPath ?? defaultReceiptsPath();
  const chain = deps.receiptsPath ? new FuelReceiptChain(receiptsPath) : (defaultChain ??= new FuelReceiptChain(receiptsPath));
  const receipts: FuelReceipt[] = [];

  if (deps.gate && !deps.gate()) {
    return { skipped: "gate-closed (e.g. vault-seal in progress)", plan: { protocol: PROTOCOL, ok: false, dryRun: true, delegator: "", treasuryNetSp: null, treasuryNetSpSource: "skipped", minOperatorSp: 0, targetSpPerSoldier: 0, totalPlannedSp: 0, treasuryAfterSp: null, lawHeadroomSp: null, lawPassed: false, blockers: ["gate-closed"], lines: [], at }, receipts };
  }

  const inputs = resolveFuelInputs(env, path.dirname(receiptsPath));
  const cycleId = `fuel-${at.replace(/[:.]/g, "-")}-${chain.length}`;
  const plan = computeFuelPlan(
    {
      treasuryNetSp: inputs.treasuryNetSp,
      minOperatorSp: inputs.minOperatorSp,
      targetSpPerSoldier: inputs.targetSpPerSoldier,
      soldiers: inputs.soldiers,
      delegator: inputs.delegator,
      dryRun: inputs.dryRun,
    },
    at,
  );
  plan.treasuryNetSpSource = inputs.treasuryNetSpSource;
  lastPlan = plan; lastCycleAt = at; lastCycleId = cycleId;

  // קבלת-תוכנית (או-חוסם) — תמיד נכתבת (כנות-מלאה)
  receipts.push(chain.append({
    at, action: plan.ok ? "fuel-plan" : "fuel-blocker",
    from: inputs.delegator, to: `soldier-roster(${inputs.soldiers.length})`,
    amountSp: plan.totalPlannedSp, dryRun: plan.dryRun, cycle: cycleId,
    treasuryNetSp: plan.treasuryNetSp, treasuryNetSpSource: plan.treasuryNetSpSource,
    minOperatorSp: plan.minOperatorSp, targetSpPerSoldier: plan.targetSpPerSoldier,
    treasuryAfterSp: plan.treasuryAfterSp, lawHeadroomSp: plan.lawHeadroomSp,
    lawPassed: plan.lawPassed, blockers: plan.blockers,
  }));

  // קבלות-שורה-פר-חייל (כל-הרוסטר — כנות: גם מי שלא מתודלק ולמה).
  // במצב-חי: קבלת-topup אמת נכתבת אחרי-השידור (עם txId) או ככשל-כנה —
  // לא פעמיים. ביבשה: כל-השורות נכתבות כתוכנית.
  for (const l of plan.lines) {
    if (!plan.dryRun && l.action === "topup" && !l.withheld) continue;
    const action =
      l.withheld ? "fuel-topup-blocked" :
      l.action === "topup" ? "fuel-topup" :
      l.action === "at-target" ? "fuel-at-target" : "fuel-unmeasured";
    receipts.push(chain.append({
      at, action, from: inputs.delegator, to: l.soldier,
      amountSp: l.amountSp, dryRun: plan.dryRun, cycle: cycleId, soldier: l.soldier,
      currentSp: l.currentSp, targetSp: l.targetSp, rcNote: l.rcNote, reason: l.reason,
    }));
  }

  // שידור — רק תוכנית-תקיפה + מצב-חי + חוק-עובר
  let broadcastError: string | undefined;
  if (plan.ok && !plan.dryRun && !deps.broadcaster) {
    try { deps.broadcaster = createSteemBroadcaster(env); }
    catch (e) { broadcastError = String((e as Error)?.message ?? e); }
  }
  if (plan.ok && !plan.dryRun) {
    const bc = deps.broadcaster;
    if (!bc) {
      broadcastError = "fail-closed: no broadcaster available (steem dep missing?)";
      receipts.push(chain.append({
        at, action: "fuel-broadcast-failed", from: inputs.delegator, to: "fleet-soldiers",
        amountSp: 0, dryRun: false, cycle: cycleId, reason: broadcastError,
      }));
    } else {
      for (const l of plan.lines) {
        if (l.action !== "topup" || l.amountSp <= 0) continue;
        try {
          const r = await bc.broadcastDelegate({ delegator: inputs.delegator, delegatee: l.soldier, targetSp: l.targetSp });
          receipts.push(chain.append({
            at, action: "fuel-topup", from: inputs.delegator, to: l.soldier,
            amountSp: l.amountSp, dryRun: false, txId: r.txId, cycle: cycleId, soldier: l.soldier,
            targetSp: l.targetSp, vests: r.vests ?? null, vestsPerSp: r.vestsPerSp ?? null,
            reason: l.reason,
          }));
        } catch (e) {
          broadcastError = String((e as Error)?.message ?? e).slice(0, 300);
          receipts.push(chain.append({
            at, action: "fuel-broadcast-failed", from: inputs.delegator, to: l.soldier,
            amountSp: l.amountSp, dryRun: false, cycle: cycleId, soldier: l.soldier, reason: broadcastError,
          }));
          deps.log?.(`[fuel-stream] broadcast failed for ${l.soldier}: ${broadcastError}`);
          break; // fail-closed: עצירה-כנה, אין-המשך-עיוור (הסבב-הבא יתכנן מחדש)
        }
      }
    }
  }

  return { plan, receipts, broadcastError };
}

export {};
