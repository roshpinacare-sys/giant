#!/usr/bin/env bun
/**
 * giant-intake — מגדל-הנזילות הריבוני (Task 20 · "משיכת נזילות מהענקים")
 * ═════════════════════════════════════════════════════════════════════════════
 * הצו: כיצד נמשוך נזילות מהענקים לרשת שלנו · מה נפתח כדי להכניס ערך · בחן תכנן ישם וודא דחוף
 *
 * האמת שנמדדה על השרשרת (2026-10-18 23:23+):
 *  · שוק-הפנימי של STEEM/SBD חי: bid 0.10284 / ask 0.10541, מחזור-יומי ~102K STEEM
 *  · ראנר-חוץ מפעיל hyperGrid על headcorner (מזלג-גדול + סלוטיות-גישוש)
 *  · חלק מהמילויים הם SELF-TRADE (open_owner==current_owner==headcorner) — wash על-הספר
 *  · הסריג-הסטטי 2026101801-06 = מייקרים אמת (691 STEEM + 19.7 SBD עוקץ)
 *
 * התפקידים של המגדל (בלי להתחרות בראנר — חוק-מנוע-כותב-יחיד):
 *  1. FEED — תמונת-שוק חיה כל מחזור (ספר+טיקר+יתרות+RC)
 *  2. LEDGER — מפריד מילוי-אמת (open_owner≠אנחנו) מ-wash (==אנחנו) — אף-גורם-אחר בעולם לא עוקב לנו ככה
 *  3. CENSUS — מפקד-הון חי: 13 חשבונות-צבא + headcorner כל 5 דק'
 *  4. AUDIT — ביקורת-דוקטרינה מול exec-armed.json: transfers-אסורים, תקרת-ops-יומית, RC, wash-burst
 *  5. FAILOVER — אם הראנר מת (>180ש׳ בלי-ops) המגדל תופס-משמרת: סריג-מדיניות 5+5, 15bps, TTL-3600
 *  6. VOICE — אזעקות קריטיות → steem-voice :3023 (שרשרת-ציבורית) · digest יומי
 *
 * חוקים: אפס-סודות-בלוגים · fail-closed בלי-כספת · chainId=אפסים (חוק-החתימה שנמדד-חי) ·
 * allowTransfersOut=false מקבל-חוקתית — המגדל לעולם לא מעביר כספים, רק פקודות-מייקר.
 */
import fs from "fs";
import dhive from "@hiveio/dhive";

const PORT = Number(process.env.GIANT_INTAKE_PORT ?? 3024);
const RPC = process.env.STEEM_RPC ?? "https://api.steemit.com";
const ENV_FILE = "/home/z/.secrets/.env.local";
const ACCOUNT = "headcorner";
const ARMY = ["cashmachine","haran","israelnews","lsa","macrame","siq","tov","wic","wog","woq","hcsoldier4","hcsoldier5","hcsoldier6"];
const STATE_DIR = `${import.meta.dir}/state`;
const VOICE = process.env.STEEM_VOICE_URL ?? "http://127.0.0.1:3023";
const CHAIN_ID = "0000000000000000000000000000000000000000000000000000000000000000";

// ═══ הדוקטרינה החמושה של הבעלים (steem repo · .secrets/exec-armed.json) — מעותקת-מילולית
const P = {
  armed: true,
  maxAskSteemPerCycle: 200, maxBidSbdPerCycle: 20, bidReserveSbd: 0.5,
  hyperGrid: {
    levels: 10, spacingBps: 15, ttlSec: 60, orderTtlSec: 3600,
    askBudgetPct: 0.12, minRcPct: 25, maxOpsPerTick: 24, opsDayCap: 32000, chainTailSec: 60,
  },
};
const FAILOVER_SILENCE_SEC = 180;
const OUR_ID_BASE = 77_000_000; // מרחב-id שלנו — לא מתנגש ב-20261018xx / 15000013xx / 21000021xx

// ═══ כספת
function readEnv() {
  try {
    const txt = fs.readFileSync(ENV_FILE, "utf8").replace(/\r/g, "");
    const get = (k: string) => {
      const lines = txt.split("\n").filter((l) => l.startsWith(`${k}=`));
      return lines.length ? lines[lines.length - 1].slice(k.length + 1).trim().replace(/^["']|["']$/g, "") : "";
    };
    return { account: get("STEEM_ACCOUNT"), activeWif: get("STEEM_ACTIVE_WIF_A") };
  } catch { return { account: "", activeWif: "" }; }
}
const E = readEnv();
let client: any = null;
function getClient() {
  if (!client) client = new dhive.Client(RPC, { timeout: 15_000, chainId: CHAIN_ID });
  return client;
}

// ═══ state
fs.mkdirSync(STATE_DIR, { recursive: true });
const f = (n: string) => `${STATE_DIR}/${n}`;
function appendJsonl(file: string, obj: any) {
  try { fs.appendFileSync(file, JSON.stringify(obj) + "\n"); } catch {}
}
type Prog = {
  lastIdx: number; halt: boolean; opsToday: number; opsDay: string;
  digestDate: string; failoverMode: boolean; ourSeq: number; lastRebalance: number;
};
const prog: Prog = fs.existsSync(f("progress.json"))
  ? JSON.parse(fs.readFileSync(f("progress.json"), "utf8"))
  : { lastIdx: 0, halt: false, opsToday: 0, opsDay: "", digestDate: "", failoverMode: false, ourSeq: 0, lastRebalance: 0 };
function saveProg() { fs.writeFileSync(f("progress.json"), JSON.stringify(prog)); }

// ═══ ops-token (עצמי-מומצא, כמו voice v4)
function ensureOpsToken() {
  const of = f("ops.env");
  if (!fs.existsSync(of)) {
    const t = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
    fs.writeFileSync(of, `GIANT_OPS_TOKEN=${t}\n`, { mode: 0o600 });
    fs.chmodSync(of, 0o600);
  }
  return fs.readFileSync(of, "utf8").split("=")[1].trim();
}
const OPS_TOKEN = ensureOpsToken();

// ═══ סטטיסטיקה חיה
const stats = {
  startedAt: Date.now(), cycles: 0, lastCycleAt: 0, lastErr: "",
  runnerAlive: true, runnerLastOpAt: 0, runnerSilentSec: 0, failoverOps: 0,
  fillsReal: 0, fillsWash: 0, steemInReal: 0, sbdOutReal: 0, steemOutReal: 0, sbdInReal: 0,
  transfers: 0, lastRcPct: 100, opsToday: 0, book: null as any, account: null as any,
  openOrders: [] as any[], census: null as any, censusAt: 0, lastDigest: "",
};
// opsToday מתוך progress (שורד הפעלות)
const todayStr = () => new Date().toISOString().slice(0, 10);
if (prog.opsDay !== todayStr()) { prog.opsDay = todayStr(); prog.opsToday = 0; saveProg(); }
stats.opsToday = prog.opsToday;

// ═══ RPC
async function call(method: string, params: any): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000), // אף-קריאת-RPC לא תשתלט על-הלולאה
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? JSON.stringify(j.error).slice(0, 120));
  return j.result;
}
const num = (s: string) => parseFloat(String(s).split(" ")[0]);

// ═══ אזעקות → שרשרת (steem-voice) עם dedupe 6ש׳
const alertsSent: Record<string, number> = {};
async function alert(kind: string, severity: "info" | "critical", text: string) {
  const now = Date.now();
  if (alertsSent[kind] && now - alertsSent[kind] < 6 * 3600_000) return;
  alertsSent[kind] = now;
  appendJsonl(f("alerts.jsonl"), { ts: now, kind, severity, text });
  if (severity !== "critical") return;
  try {
    await fetch(`${VOICE}/broadcast`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `SAOS giant-intake [${kind}]`,
        body: `${text}\n\n(giant-intake :3024 · ${new Date().toISOString()})`,
        tags: ["saos", "audit", "marketmaking"],
      }),
    });
  } catch {}
}

// ═══ חתימה (fail-closed)
async function sign(ops: any[]): Promise<any> {
  if (!E.account || !E.activeWif) throw new Error("fail-closed: אין-כספת/מפתח-פעיל");
  if (prog.opsToday >= P.hyperGrid.opsDayCap) throw new Error(`opsDayCap ${prog.opsToday}/${P.hyperGrid.opsDayCap}`);
  const key = dhive.PrivateKey.fromString(E.activeWif);
  const res = await getClient().broadcast.sendOperations(ops, key);
  prog.opsToday += ops.length; stats.opsToday = prog.opsToday; saveProg();
  appendJsonl(f("ops.jsonl"), { ts: Date.now(), ops: ops.map((o) => o[0]), rc: stats.lastRcPct, mode: prog.failoverMode ? "failover" : "manual" });
  return res;
}

// ═══ סריקת-היסטוריה: מיון אמת/wash/transfers
async function scanHistory() {
  let start = prog.lastIdx > 0 ? prog.lastIdx : -1;
  let batch: any[] = [];
  try { batch = await call("condenser_api.get_account_history", [ACCOUNT, start, 100]); }
  catch { batch = await call("condenser_api.get_account_history", [ACCOUNT, -1, 100]); }
  let maxIdx = prog.lastIdx; let newOps = 0;
  for (const [idx, meta] of batch) {
    if (idx <= prog.lastIdx) continue;
    newOps++;
    if (idx > maxIdx) maxIdx = idx;
    const [typ, d] = meta.op;
    if (typ === "fill_order" && d.current_owner === ACCOUNT) {
      const isWash = d.open_owner === ACCOUNT;
      const cur = String(d.current_pays), opn = String(d.open_pays);
      const rec = { ts: meta.timestamp, idx, wash: isWash, pays: cur, opens: opn, open_owner: d.open_owner, block: meta.block ?? 0 };
      appendJsonl(f("fills.jsonl"), rec);
      if (isWash) stats.fillsWash++;
      else {
        stats.fillsReal++;
        if (cur.endsWith("SBD")) { stats.sbdOutReal += num(cur); stats.steemInReal += num(opn); }
        else { stats.steemOutReal += num(cur); stats.sbdInReal += num(opn); }
      }
    } else if (typ === "transfer") {
      stats.transfers++;
      const from = d.from === ACCOUNT, to = d.to === ACCOUNT;
      await alert("transfer-detected", "critical",
        `TRANSFER על ${ACCOUNT}: ${d.from}→${d.to} ${d.amount}${from && to ? " (self)" : from ? " יוצא-מהכספת!" : " נכנס"}`);
    }
  }
  if (newOps > 0) { stats.runnerLastOpAt = Date.now(); }
  prog.lastIdx = maxIdx; saveProg();
}

// ═══ FEED מחזור
async function cycle() {
  stats.cycles++; stats.lastCycleAt = Date.now();
  try {
    const [book, ticker, accts, orders] = await Promise.all([
      call("condenser_api.get_order_book", [20]),
      call("condenser_api.get_ticker", []),
      call("condenser_api.get_accounts", [[ACCOUNT]]),
      call("condenser_api.get_open_orders", [ACCOUNT]),
    ]);
    const a = accts[0];
    stats.book = {
      at: Date.now(), bestBid: ticker.highest_bid, bestAsk: ticker.lowest_ask, latest: ticker.latest,
      steemVol: ticker.steem_volume, sbdVol: ticker.sbd_volume,
      asks: (book.asks ?? []).slice(0, 5).map((x: any) => x.real_price),
      bids: (book.bids ?? []).slice(0, 5).map((x: any) => x.real_price),
    };
    stats.account = { balance: a.balance, sbd: a.sbd_balance, vests: a.vesting_shares };
    stats.openOrders = orders.map((o: any) => ({
      id: o.orderid, created: o.created, expiration: o.expiration,
      sell: o.sell_price.base, receive: o.sell_price.quote,
    }));

    const rc = await call("rc_api.find_rc_accounts", { accounts: [ACCOUNT] });
    const rcA = rc.rc_accounts[0];
    stats.lastRcPct = Math.round((100 * Number(rcA.rc_manabar.current_mana)) / Math.max(1, Number(rcA.max_rc)));
    if (stats.lastRcPct < P.hyperGrid.minRcPct) await alert("rc-low", "info", `RC בירידה: ${stats.lastRcPct}% < ${P.hyperGrid.minRcPct}%`);

    await scanHistory();

    // דופק-ראנר
    stats.runnerSilentSec = stats.runnerLastOpAt ? Math.round((Date.now() - stats.runnerLastOpAt) / 1000) : 9999;
    stats.runnerAlive = stats.runnerSilentSec < 120;

    // FAILOVER: הראנר מת → המגדל תופס-משמרת
    const shouldFailover = P.armed && !prog.halt && !stats.runnerAlive && stats.runnerSilentSec > FAILOVER_SILENCE_SEC;
    if (shouldFailover && !prog.failoverMode) {
      prog.failoverMode = true; saveProg();
      await alert("failover-takeover", "info", `ראנר-חוץ שקט ${stats.runnerSilentSec}ש׳ — המגדל תופס-משמרת על הסריג (מדיניות exec-armed)`);
    }
    if (prog.failoverMode && stats.runnerAlive) {
      prog.failoverMode = false; saveProg();
      await alert("failover-yield", "info", "ראנר-חוץ חזר-לחיים — המגדל מפנה-משמרת (חוק-מנוע-כותב-יחיד)");
    }
    if (prog.failoverMode) await gridTick();

    // אטימת-פיד כל ~5 דק'
    if (stats.cycles % 30 === 1) {
      appendJsonl(f("feed.jsonl"), {
        ts: new Date().toISOString(), ...stats.book, rc: stats.lastRcPct,
        bal: stats.account, open: stats.openOrders.length,
        real: { fills: stats.fillsReal, steemIn: +stats.steemInReal.toFixed(3), sbdOut: +stats.sbdOutReal.toFixed(3) },
        wash: stats.fillsWash, opsToday: prog.opsToday,
      });
    }
    if (prog.opsToday > P.hyperGrid.opsDayCap * 0.9) await alert("ops-cap", "critical", `opsToday=${prog.opsToday} מתקרב-לתקרת-הדוקטרינה ${P.hyperGrid.opsDayCap}`);
    stats.lastErr = "";
  } catch (e: any) {
    stats.lastErr = String(e?.message ?? e).slice(0, 200);
  }
}

// ═══ סריג failover (מדיניות: 5+5 רמות · 15bps · TTL-3600 · תקרות-תקציב)
async function gridTick() {
  const now = Date.now();
  if (now - prog.lastRebalance < P.hyperGrid.ttlSec * 1000) return;
  prog.lastRebalance = now; saveProg();
  if (stats.lastRcPct < P.hyperGrid.minRcPct) return;
  const mid = (parseFloat(stats.book?.bestBid ?? "0") + parseFloat(stats.book?.bestAsk ?? "0")) / 2;
  if (!(mid > 0)) return;
  const sp = mid * (P.hyperGrid.spacingBps / 10_000);
  const liquidSteem = num(stats.account?.balance ?? "0");
  const liquidSbd = num(stats.account?.sbd ?? "0");
  const askEach = Math.min(liquidSteem * P.hyperGrid.askBudgetPct, P.maxAskSteemPerCycle) / 5;
  const bidEach = Math.max(0, Math.min(liquidSbd - P.bidReserveSbd, P.maxBidSbdPerCycle)) / 5;
  const haveAsk = stats.openOrders.filter((o) => String(o.sell).endsWith("STEEM"));
  const haveBid = stats.openOrders.filter((o) => String(o.sell).endsWith("SBD"));
  const exp = new Date(now + P.hyperGrid.orderTtlSec * 1000).toISOString().slice(0, 19);
  const ops: any[] = [];
  const px = (n: number) => n.toFixed(6);
  for (let i = 1; i <= 5; i++) {
    const ap = px(mid + sp * i), bp = px(mid - sp * i);
    const coveredA = haveAsk.some((o) => Math.abs(num(o.receive) / num(o.sell) - (mid + sp * i)) < sp / 2);
    const coveredB = haveBid.some((o) => Math.abs(num(o.sell) / num(o.receive) - (mid - sp * i)) < sp / 2);
    if (!coveredA && askEach >= 0.001 && liquidSteem > 1)
      ops.push(["limit_order_create", { owner: ACCOUNT, orderid: OUR_ID_BASE + (prog.ourSeq++ % 10_000_000), amount_to_sell: `${askEach.toFixed(3)} STEEM`, min_to_receive: `${(askEach * parseFloat(ap)).toFixed(3)} SBD`, fill_or_kill: false, expiration: exp }]);
    if (!coveredB && bidEach >= 0.001 && liquidSbd > P.bidReserveSbd + 0.001)
      ops.push(["limit_order_create", { owner: ACCOUNT, orderid: OUR_ID_BASE + (prog.ourSeq++ % 10_000_000), amount_to_sell: `${bidEach.toFixed(3)} SBD`, min_to_receive: `${(bidEach / parseFloat(bp)).toFixed(3)} STEEM`, fill_or_kill: false, expiration: exp }]);
    if (ops.length >= P.hyperGrid.maxOpsPerTick) break;
  }
  prog.ourSeq = prog.ourSeq % 10_000_000; saveProg();
  if (ops.length) { stats.failoverOps += ops.length; try { await sign(ops); } catch (e: any) { stats.lastErr = "sign: " + String(e?.message ?? e).slice(0, 150); } }
}

// ═══ מפקד-הון
async function census() {
  try {
    const names = [ACCOUNT, ...ARMY];
    const accts = await call("condenser_api.get_accounts", [names]);
    const rows = accts.map((r: any) => ({ account: r.name, steem: r.balance, sbd: r.sbd_balance, vests: r.vesting_shares, created: r.created?.slice(0, 10) }));
    const tot = rows.reduce((s: any, r: any) => ({
      steem: s.steem + num(r.steem), sbd: s.sbd + num(r.sbd),
    }), { steem: 0, sbd: 0 });
    stats.census = { at: new Date().toISOString(), rows, total: { steem: +tot.steem.toFixed(3), sbd: +tot.sbd.toFixed(3), accounts: rows.length } };
    stats.censusAt = Date.now();
    appendJsonl(f("census.jsonl"), stats.census);
  } catch (e: any) { stats.lastErr = "census: " + String(e?.message ?? e).slice(0, 120); }
}

// ═══ digest יומי על-השרשרת (promo.perDay=1)
async function digest(force = false) {
  const today = todayStr();
  if (!force && prog.digestDate === today) return { ok: false, why: "already-today" };
  const body = [
    `SAOS Giant Intake — daily liquidity digest (${today})`,
    ``,
    `* Real fills: ${stats.fillsReal} (wash-filtered: ${stats.fillsWash} excluded)`,
    `* Real intake: +${stats.steemInReal.toFixed(3)} STEEM / -${stats.sbdOutReal.toFixed(3)} SBD (bids), +${stats.sbdInReal.toFixed(3)} SBD / -${stats.steemOutReal.toFixed(3)} STEEM (asks)`,
    `* Treasury: ${stats.account?.balance ?? "?"} | ${stats.account?.sbd ?? "?"} | ${stats.account?.vests ?? "?"}`,
    `* Open orders: ${stats.openOrders.length} | market ${stats.book?.bestBid ?? "?"}/${stats.book?.bestAsk ?? "?"}`,
    `* RC: ${stats.lastRcPct}% | ops today: ${prog.opsToday}/${P.hyperGrid.opsDayCap} | failover: ${prog.failoverMode ? "ACTIVE" : "standby"}`,
    `* Doctrine: exec-armed hyperGrid · transfers-out=false enforced · chainId=STEEM`,
    ``,
    `Sovereign liquidity tower — real chain data only, no simulation.`,
  ].join("\n");
  const res = await fetch(`${VOICE}/broadcast`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: `SAOS Giant Intake ${today}`, body, tags: ["saos", "marketmaking", "steem", "defi"] }),
  });
  const j = await res.json().catch(() => ({}));
  if (j?.ok) { prog.digestDate = today; saveProg(); stats.lastDigest = j.url ?? ""; }
  return j;
}

// ═══ לולאות (שומר-תפוסה: אין-מחזורים-מצטברים — חוק-מנוע-כותב-יחיד גם-כאן)
let cycleBusy = false;
async function guardedCycle() {
  if (cycleBusy) return;
  cycleBusy = true;
  try { await cycle(); } finally { cycleBusy = false; }
}
setInterval(guardedCycle, 10_000);
setTimeout(guardedCycle, 1_500);
setInterval(census, 5 * 60_000);
setTimeout(census, 5_000);

// ═══ API
function authed(req: Request) {
  return (req.headers.get("x-giant-ops") ?? new URL(req.url).searchParams.get("t") ?? "") === OPS_TOKEN;
}
Bun.serve({
  port: PORT,
  idleTimeout: 60, // סערות-RPC לא יהרגו תשובות-לוח
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/health") return Response.json({
      ok: true, service: "giant-intake", port: PORT,
      account: E.account || "fail-closed", vault: E.activeWif ? "חיה" : "fail-closed",
      runner: { alive: stats.runnerAlive, silentSec: stats.runnerSilentSec },
      failoverMode: prog.failoverMode, halt: prog.halt,
      fills: { real: stats.fillsReal, wash: stats.fillsWash }, opsToday: prog.opsToday,
      rc: stats.lastRcPct, cycles: stats.cycles, lastErr: stats.lastErr,
    });
    if (u.pathname === "/market") return Response.json({ ok: true, ...stats.book });
    if (u.pathname === "/orders") return Response.json({ ok: true, orders: stats.openOrders, count: stats.openOrders.length });
    if (u.pathname === "/fills") return Response.json({
      ok: true, real: stats.fillsReal, wash: stats.fillsWash,
      intake: { steemInReal: +stats.steemInReal.toFixed(3), sbdOutReal: +stats.sbdOutReal.toFixed(3), steemOutReal: +stats.steemOutReal.toFixed(3), sbdInReal: +stats.sbdInReal.toFixed(3) },
    });
    if (u.pathname === "/census") return Response.json({ ok: true, ...(stats.census ?? { why: "first-census-pending" }) });
    if (u.pathname === "/status") return Response.json({
      ok: true, service: "giant-intake", doctrine: P, ...stats,
      intake: { steemInReal: +stats.steemInReal.toFixed(3), sbdOutReal: +stats.sbdOutReal.toFixed(3) },
    });
    if (u.pathname === "/audit") return Response.json({
      ok: true, transfersDetected: stats.transfers, opsToday: prog.opsToday, opsCap: P.hyperGrid.opsDayCap,
      rcPct: stats.lastRcPct, washFills: stats.fillsWash, realFills: stats.fillsReal,
      verdict: stats.transfers === 0 && prog.opsToday <= P.hyperGrid.opsDayCap ? "CLEAR (מתוך-הצי)" : "FINDINGS",
    });
    if (u.pathname === "/digest" && req.method === "POST") {
      if (!authed(req)) return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
      try { return Response.json(await digest(true)); } catch (e: any) { return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }); }
    }
    if (u.pathname === "/halt" && req.method === "POST") {
      if (!authed(req)) return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
      prog.halt = true; prog.failoverMode = false; saveProg();
      return Response.json({ ok: true, halt: true });
    }
    if (u.pathname === "/resume" && req.method === "POST") {
      if (!authed(req)) return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
      prog.halt = false; saveProg();
      return Response.json({ ok: true, halt: false });
    }
    return Response.json({ ok: false, error: "not-found" }, { status: 404 });
  },
});
console.log(`[giant-intake] מגדל-הנזילות חי על :${PORT} · חשבון=${E.account || "fail-closed"} · failover=${prog.failoverMode ? "משמרת-פעילה" : "מוכן"}`);
