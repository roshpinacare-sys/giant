/* ═══ מנוע-הנזילות (T77-MONEY) ═══
 * מה-מי:
 *  · אמת-על-השרשרת: יתרות headcorner חיות מ-STEEM RPC (נזיל · SBD · SP · נעול-בפקודות)
 *  · ספר-SP: מי-מהצי מחזיק מה (delegations) — "להשאיר להם SP" מתועד במספרים
 *  · ספר-תנועות מלא: סריקה-עמוקה-פעם-אחת (checkpoint) + דגימה-מצטברת כל-5דק׳
 *  · חריגות (סכום-חריג): חוקים-גלויים על הספר — יציאה-גדולה · צד-לא-מוכר · סטיית-מחיר · רצפה
 *  · קצב-רווח: 24ש׳/7י׳ נכנס-מול-יוצא (STEEM-שקול) — פסק-דין כנה: מרוויח/מפסיד/לא-נמדד
 *  · תוכנית-נזילות: רצפה · יעד-SBD · מה-המנוע עושה-הלאה (dry-run בלבד — אפס-חתימה)
 * חוקים: אפס-תלות-חוץ · אפס-מפתחות · fail-honest (null = לא-נמדד) · אפס-המצאות. */

import fs from "fs";
import path from "path";

const PORT = 3043;
const STATE = path.join(import.meta.dir, "state");
const LEDGER_PATH = path.join(STATE, "ledger.json");
const SCAN_PATH = path.join(STATE, "scan-ckpt.json");
const ANOMALIES_PATH = path.join(STATE, "anomalies.jsonl");

const ACCOUNT = "headcorner";
const RPC = "https://api.steemit.com";

/* הצי-המוכר (נמדד מ-delegations בפועל 2026-10-16) — חריגה=צד-מחוץ-לרשימה */
const FLEET = new Set([
  "cashmachine", "haran", "israelnews", "lsa", "macrame", "woq", "siq", "tov",
  "wic", "wog", "hcsoldier1", "hcsoldier2", "hcsoldier3", "hcsoldier4",
  "hcsoldier5", "hcsoldier6", "hive-177702", "ynet", "powerspan", "headcorner",
]);
const KNOWN = new Set([
  ...FLEET,
  "binance-hot2", "blocktrades", "smartsteem", "probitred", "bdhivesteem",
  "postpromoter", "rocky1", "crazyartist", "luckygamesio", "sureshot", "nv21089",
  "steem", "reward.app", "escrow", "minnowbooster",
]);

const KEEP = new Set([
  "transfer", "transfer_to_vesting", "transfer_from_vesting",
  "delegate_vesting_shares", "claim_reward_balance", "fill_order",
  "withdraw_vesting", "escrow_transfer", "escrow_approve", "escrow_release",
]);

/* ─── state ─── */
type Row = { i: number; ts: string; t: string; o: any };
let ledger: Row[] = [];
let scanState = { done: 0, deepScanDone: false };
let anomalies: any[] = [];
let boot = { at: new Date().toISOString() };

function loadState() {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
      console.log(`[ledger] loaded ${ledger.length} rows, last idx ${ledger.length ? ledger[ledger.length - 1].i : "-"}`);
    }
    if (fs.existsSync(SCAN_PATH)) scanState = { ...scanState, ...JSON.parse(fs.readFileSync(SCAN_PATH, "utf8")) };
    // 诚实守卫：书薄(<50行)就声明未扫完，强制重扫
    if (ledger.length < 50) scanState = { done: 0, deepScanDone: false };
    if (fs.existsSync(ANOMALIES_PATH)) {
      anomalies = fs.readFileSync(ANOMALIES_PATH, "utf8").split("\n").filter(Boolean).slice(-400).map((l) => JSON.parse(l));
    }
  } catch (e) {
    console.log("[state] load fail-honest:", e);
  }
}
function saveLedger() {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger));
}
function saveScan() {
  fs.writeFileSync(SCAN_PATH, JSON.stringify(scanState));
}
function pushAnomaly(a: any) {
  const row = { at: new Date().toISOString(), ...a };
  anomalies.push(row);
  fs.appendFileSync(ANOMALIES_PATH, JSON.stringify(row) + "\n");
  if (anomalies.length > 500) anomalies = anomalies.slice(-400);
}

/* ─── STEEM RPC（全局节流：请求间隔≥80ms，零-突-发，低-延迟交错） ─── */
let lastReqAt = 0;
async function rpc(method: string, params: any[], retries = 3): Promise<any | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const wait = Math.max(0, lastReqAt + 80 - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastReqAt = Date.now();
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        signal: AbortSignal.timeout(25_000),
      });
      const j: any = await r.json();
      if (j.result !== undefined) return j.result;
    } catch {
      await new Promise((res) => setTimeout(res, 800 + i * 800));
    }
  }
  return null; // fail-honest
}

const f = (s: string | undefined) => (s ? parseFloat(String(s).split(" ")[0]) : 0);

/* ─── סריקה-עמוקה (checkpoint ל-2-מקביליות; סובלני-להגבלת-קצב) ─── */
let scanning = false;
async function deepScan() {
  if (scanning) return;
  scanning = true;
  try {
    const head = await rpc("condenser_api.get_account_history", [ACCOUNT, -1, 1]);
    if (!head || !Array.isArray(head) || !head.length) { scanning = false; return; }
    // condenser 返回数组的对数组：[[idx, op], ...]
    const maxIdx = Number(head[head.length - 1][0]);
    const starts: number[] = [];
    for (let s = 0; s <= maxIdx; s += 100) starts.push(s);
    console.log(`[scan] deep scan ${starts.length} batches (from ckpt ${scanState.done})`);

    const seen = new Set(ledger.map((r) => r.i));
    let done = 0;
    const work = async (s: number) => {
      const res = await rpc("condenser_api.get_account_history", [ACCOUNT, s, 100], 5);
      if (!res || !Array.isArray(res)) return;
      await new Promise((r) => setTimeout(r, 300)); // 节流：让位给快照与增量
      for (const pair of res) {
        if (!Array.isArray(pair)) continue;
        const idx = Number(pair[0]);
        const v = pair[1];
        if (!v?.op) continue;
        if (idx < s || idx > s + 99) continue;
        if (seen.has(idx)) continue;
        const t = v.op[0];
        if (KEEP.has(t)) { seen.add(idx); ledger.push({ i: idx, ts: v.timestamp, t, o: v.op[1] }); }
      }
      done++;
      if (done % 150 === 0) {
        scanState.done = Math.max(scanState.done, s + 100);
        saveScan(); saveLedger();
        console.log(`[scan] ${done}/${starts.length} rows=${ledger.length}`);
      }
    };
    const q = [...starts];
    await Promise.all(Array.from({ length: 1 }, async () => {
      while (q.length) {
        const s = q.shift()!;
        await work(s);
      }
    }));
    ledger.sort((a, b) => a.i - b.i);
    scanState.done = maxIdx + 1;
    scanState.deepScanDone = true;
    saveScan(); saveLedger();
    console.log(`[scan] DONE rows=${ledger.length}`);
    recheckAnomalies();
  } finally {
    scanning = false;
  }
}

/* ─── דגימה-מצטברת (כל-5דק׳): ה-ops החדשים מהסוף ─── */
async function incremental() {
  try {
    const res = await rpc("condenser_api.get_account_history", [ACCOUNT, -1, 1000], 2);
    if (!res || !Array.isArray(res)) return;
    const lastIdx = ledger.length ? ledger[ledger.length - 1].i : -1;
    let added = 0;
    for (const pair of res) {
      if (!Array.isArray(pair)) continue;
      const idx = Number(pair[0]);
      const v = pair[1];
      if (!v?.op) continue;
      if (idx <= lastIdx) continue;
      const t = v.op[0];
      if (KEEP.has(t)) { ledger.push({ i: idx, ts: v.timestamp, t, o: v.op[1] }); added++; }
    }
    if (added) {
      ledger.sort((a, b) => a.i - b.i);
      saveLedger();
      console.log(`[incr] +${added} rows=${ledger.length}`);
      recheckAnomalies();
    }
  } catch (e) {
    console.log("[incr] fail-honest", e);
  }
}

/* ─── חוקי-חריגות (סכום-חריג) — רץ על ספר-התנועות ─── */
let lastAnomalyScanIdx = -1;
function recheckAnomalies() {
  const from = lastAnomalyScanIdx < 0 ? Math.max(0, ledger.length - 200) : ledger.findIndex((r) => r.i > lastAnomalyScanIdx);
  if (from < 0) return;
  for (const r of ledger.slice(from)) {
    if (r.t === "transfer") {
      const amt = f(r.o.amount), cur = r.o.amount.split(" ")[1];
      const to = r.o.to, fromAcc = r.o.from;
      if (to === ACCOUNT && amt >= 100) pushAnomaly({ kind: "כניסה-גדולה", amount: amt, currency: cur, party: fromAcc, idx: r.i, ts: r.ts });
      if (fromAcc === ACCOUNT && amt >= 50 && cur === "STEEM") pushAnomaly({ kind: "יציאה-גדולה", amount: amt, currency: cur, party: to, idx: r.i, ts: r.ts });
      if (fromAcc === ACCOUNT && amt >= 10 && cur === "SBD") pushAnomaly({ kind: "יציאה-גדולה", amount: amt, currency: cur, party: to, idx: r.i, ts: r.ts });
      if (to !== ACCOUNT && !KNOWN.has(to)) pushAnomaly({ kind: "צד-לא-מוכר(יציאה)", amount: amt, currency: cur, party: to, idx: r.i, ts: r.ts });
      if (to === ACCOUNT && !KNOWN.has(fromAcc)) pushAnomaly({ kind: "צד-לא-מוכר(כניסה)", amount: amt, currency: cur, party: fromAcc, idx: r.i, ts: r.ts });
    }
    if (r.t === "delegate_vesting_shares" && !FLEET.has(r.o.delegatee)) {
      pushAnomaly({ kind: "SP-יוצא-לא-מוכר", shares: r.o.vesting_shares, party: r.o.delegatee, idx: r.i, ts: r.ts });
    }
  }
  lastAnomalyScanIdx = ledger.length ? ledger[ledger.length - 1].i : -1;
}

/* ─── תמונת-מצב חיה ─── */
let snap: any = null;
let snapAt = 0;
let snapBusy = false;
async function measureSnapshot() {
  if (snapBusy) return snap;
  snapBusy = true;
  const t = Date.now();
  try {
    const accs = await rpc("condenser_api.get_accounts", [[ACCOUNT]], 2);
    if (!accs || !accs[0]) { snapAt = Date.now(); return snap; }
    const a = accs[0];
    const orders = (await rpc("condenser_api.get_open_orders", [ACCOUNT], 2)) ?? [];
    const dels = (await rpc("condenser_api.get_vesting_delegations", [ACCOUNT, "", 100], 2)) ?? [];
    const price = await rpc("condenser_api.get_current_median_history_price", [], 2);
    const dg = await rpc("condenser_api.get_dynamic_global_properties", [], 2);
    if (dg?.total_vesting_fund_steem && dg?.total_vesting_shares) {
      spPerVestGlobal = f(dg.total_vesting_fund_steem) / f(dg.total_vesting_shares); // SP per 1 VESTS
    }

    let lockSteem = 0, lockSbd = 0;
    const orderList: any[] = [];
    for (const o of orders) {
      const baseStr = String(o.sell_price.base);
      const amt = Number(o.for_sale) / 1000;
      if (baseStr.includes("STEEM")) lockSteem += amt; // base = מה-שנמכר
      else lockSbd += amt;
      orderList.push({ id: o.orderid, selling: `${amt.toFixed(3)} ${baseStr.split(" ")[1]}`, price: baseStr, for: String(o.sell_price.quote), created: o.created });
    }
    const delegAgg: Record<string, number> = {};
    let delVests = 0;
    for (const d of dels) {
      const v = f(d.vesting_shares);
      delegAgg[d.delegatee] = (delegAgg[d.delegatee] ?? 0) + v;
      delVests += v;
    }
    const vests = f(a.vesting_shares), delOut = f(a.delegated_vesting_shares), delIn = f(a.received_vesting_shares);

    let spPerVest = spPerVestGlobal;
    let steemPerSbd: number | null = null;
    if (price?.base && price?.quote) {
      const b = f(price.base), q = f(price.quote);
      if (String(price.base).includes("SBD")) steemPerSbd = b / q; // SBD per 1 STEEM
    }

    const spGross = vests * spPerVest;
    const spOut = delOut * spPerVest;
    const spIn = delIn * spPerVest;
    const spNet = spGross - spOut + spIn;
    const liquid = f(a.balance);
    const sbd = f(a.sbd_balance);
    const steemPriceSbd = steemPerSbd ?? null; // SBD per 1 STEEM
    const usds = steemPriceSbd != null ? liquid * steemPriceSbd + sbd + spNet * steemPriceSbd : null;

    snap = {
      ok: true, account: ACCOUNT, at: new Date().toISOString(),
      liquid: { steem: liquid, sbd, vestingRewards: f(a.reward_steem_balance) },
      lockedInOrders: { steem: Math.round(lockSteem * 1000) / 1000, sbd: Math.round(lockSbd * 1000) / 1000, count: orders.length },
      sp: { gross: r3(spGross), delegatedOut: r3(spOut), delegatedIn: r3(spIn), net: r3(spNet), vestsPerSp: Math.round(1 / spPerVest) },
      price: { steemInSbd: steemPriceSbd != null ? r6(steemPriceSbd) : null, source: "median-history" },
      totalUsds: usds != null ? r2(usds) : null, // fail-honest: null אם אין-מחיר
      fleetDelegations: Object.fromEntries(Object.entries(delegAgg).map(([k, v]) => [k, r3(v * spPerVest)])),
      orders: orderList.slice(0, 25),
    };
    snapAt = Date.now();
  } finally {
    snapBusy = false;
  }
  return snap;
}
let spPerVestGlobal = 1 / 1900;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/* ─── קצב-רווח (run-rate) מספר-התנועות ─── */
function runrate() {
  if (!scanState.deepScanDone || ledger.length === 0) {
    return { ok: false, reason: "deep-scan-not-done (fail-honest)", deepScanDone: scanState.deepScanDone };
  }
  const now = Date.now();
  const spans = { d24: 24 * 3600e3, d7: 7 * 24 * 3600e3 };
  const out: any = { ok: true, at: new Date().toISOString(), note: "STEEM-שקול לפי מחיר-חי; SBD נספר כפי-שהוא" };
  const steemPriceSbd = snap?.price?.steemInSbd ?? null;
  for (const [k, span] of Object.entries(spans)) {
    const since = new Date(now - span).toISOString();
    let inSteem = 0, inSbd = 0, outSteem = 0, outSbd = 0, curIn = 0, curVests = 0, fills = 0;
    for (const r of ledger) {
      if (r.ts < since) continue;
      if (r.t === "transfer") {
        const amt = f(r.o.amount), cur = r.o.amount.split(" ")[1];
        if (r.o.to === ACCOUNT) { if (cur === "STEEM") inSteem += amt; else inSbd += amt; }
        else { if (cur === "STEEM") outSteem += amt; else outSbd += amt; }
      } else if (r.t === "fill_order") {
        fills++;
        // מה-שקיבלנו בעסקה
        const got = r.o.current_owner === ACCOUNT ? r.o.open_pays : r.o.current_pays;
        const g = f(got), gc = got.split(" ")[1];
        if (gc === "STEEM") inSteem += g; else inSbd += g;
      } else if (r.t === "claim_reward_balance") {
        curVests += f(r.o.reward_vests); curIn += f(r.o.reward_steem);
      } else if (r.t === "transfer_to_vesting") {
        const amt = f(r.o.amount);
        outSteem += amt; // יציאה-מהנזיל-ל-SP (לא-הפסד — מעבר-מצב)
      }
    }
    const inEq = inSteem + (steemPriceSbd ? inSbd / steemPriceSbd : 0);
    const outEq = outSteem + (steemPriceSbd ? outSbd / steemPriceSbd : 0);
    out[k] = {
      transfersIn: { steem: r3(inSteem), sbd: r3(inSbd) },
      transfersOut: { steem: r3(outSteem), sbd: r3(outSbd) },
      tradingFills: fills,
      curation: { vests: r3(curVests), steemRewards: r3(curIn) },
      poweredUp: r3(0),
      netSteemEq: r3(inEq - outEq),
      verdict: !steemPriceSbd ? "לא-נמדד (אין-מחיר)" : inEq - outEq > 0.1 ? "מרוויח" : inEq - outEq < -0.1 ? "מפסיד" : "שטוח",
    };
  }
  return out;
}

/* ─── תוכנית-נזילות (dry-run — אפס-חתימה, אפס-מפתחות) ─── */
function plan() {
  const s = snap;
  if (!s?.ok) return { ok: false, reason: "no-snapshot (fail-honest)" };
  const steps: any[] = [];
  const floor = 50; // רצפה-נזילה ב-STEEM
  if (s.liquid.steem < floor) steps.push({ step: "רצף-נזילות", what: `הנזיל ${s.liquid.steem} < רצפה ${floor} — להגדיל-היצע-מכירה-הדרגתי ב-SBD ולשמור-רצפה`, dryRun: true });
  if (s.lockedInOrders.count > 0) steps.push({ step: "פקודות-פתוחות", what: `${s.lockedInOrders.count} פקודות נעולות ${(s.lockedInOrders.steem + s.lockedInOrders.sbd).toFixed(2)} — מונעות-מהמנוע לעבוד; מדידה-קודמת-לכל-ביטול`, dryRun: true });
  const spToAgents = Object.entries(s.fleetDelegations ?? {}).reduce((a, [k, v]) => a + (v as number), 0);
  steps.push({ step: "SP-לצי (המנדט)", what: `להשאיר להם SP: ${r3(spToAgents)} SP מוקצה כבר ל-${Object.keys(s.fleetDelegations ?? {}).length} חשבונות-צי — זה הון-הפעלה שלהם (resource credits + קוראטור)`, dryRun: false, state: "פעיל" });
  steps.push({ step: "עומק-שוק", what: `המנוע-מסחרר: ${s.lockedInOrders.count} פקודות · הרחבת-עומק רק אחרי-שהרווח-נמדד-חיובי ב-7 ימים`, dryRun: true });
  steps.push({ step: "מסגרת-חתימה", what: "אפס-חתימה מהמנוע: כל-פעולת-שרשרת דורשת-אישור-בעלים-דרך-השער (fail-closed)", dryRun: true });
  return { ok: true, at: new Date().toISOString(), floor, steps };
}

/* ─── HTTP ─── */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (p === "/health") {
        return Response.json({
          ok: true, engine: "liquidity-engine", port: PORT, account: ACCOUNT,
          ledgerRows: ledger.length, deepScanDone: scanState.deepScanDone,
          scanDone: scanState.done, anomalies: anomalies.length,
          snapshotAgeSec: snapAt ? Math.round((Date.now() - snapAt) / 1000) : null,
          boot: boot.at,
        }, { headers: cors });
      }
      if (p === "/snapshot") {
        const s = await measureSnapshot();
        return Response.json(s ?? { ok: false, reason: "measured-fail (fail-honest)" }, { headers: cors });
      }
      if (p === "/flow") {
        return Response.json({ ok: true, deepScanDone: scanState.deepScanDone, rows: ledger.length, runrate: runrate() }, { headers: cors });
      }
      if (p === "/ledger") {
        const n = Math.min(200, Number(url.searchParams.get("n") ?? 60));
        return Response.json({ ok: true, total: ledger.length, rows: ledger.slice(-n).map((r) => ({ i: r.i, ts: r.ts, t: r.t, o: r.o })) }, { headers: cors });
      }
      if (p === "/anomalies") {
        return Response.json({ ok: true, count: anomalies.length, anomalies: anomalies.slice(-60) }, { headers: cors });
      }
      if (p === "/plan") {
        await measureSnapshot();
        return Response.json(plan(), { headers: cors });
      }
      return Response.json({ ok: false, error: "not-found", routes: ["/health", "/snapshot", "/flow", "/ledger?n=", "/anomalies", "/plan"] }, { status: 404, headers: cors });
    } catch (e: any) {
      return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500, headers: cors });
    }
  },
});

loadState();
process.on("unhandledRejection", (e) => console.log("[unhandled]", String(e)));
process.on("uncaughtException", (e) => console.log("[uncaught]", String(e)));
setInterval(() => void incremental(), 5 * 60 * 1000);
setInterval(() => void measureSnapshot(), 3 * 60 * 1000);
setTimeout(() => void deepScan(), 1500);
setTimeout(() => void measureSnapshot(), 3000);
console.log(`[liquidity-engine] up on :${PORT} · account=${ACCOUNT} · fail-honest · zero-keys`);
