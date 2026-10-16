// wave-91 v3: daily rates, counterparties, missing accounts, USD verdict
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DIR = "/home/z/my-project/scripts/wave91-cache";
const RPCS = ["https://api.steemit.com", "https://api.justyy.com"];

async function rpc(method: string, params: any[]): Promise<any> {
  let lastErr: any = null;
  for (const base of RPCS) {
    try {
      const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) });
      const txt = await r.text();
      if (!txt || txt.length < 2) throw new Error("empty body");
      const j: any = JSON.parse(txt);
      if (j.error) throw new Error((j.error.message || "").slice(0, 120));
      if (j.result == null) throw new Error("null result");
      return j.result;
    } catch (e: any) { lastErr = e; }
  }
  throw lastErr;
}

function amt(s: any): [number, string] {
  if (typeof s === "string") { const [v, a] = s.split(" "); return [parseFloat(v), a ?? "NONE"]; }
  if (s && typeof s === "object" && s.amount != null) {
    const sym = s.nai === "@@000000021" ? "STEEM" : s.nai === "@@000000013" ? "SBD" : s.nai === "@@000000037" ? "VESTS" : (s.nai ?? "NAI");
    return [parseFloat(s.amount) / Math.pow(10, s.precision ?? 3), sym];
  }
  return [0, "NONE"];
}

type Op = [number, { block: number; timestamp: string; op: [string, any] }];
const CUT = "2026-08-01T00:00:00";

async function main() {
  const g = await rpc("condenser_api.get_dynamic_global_properties", []);
  const vestsPerSteem = parseFloat(g.total_vesting_shares) / parseFloat(g.total_vesting_fund_steem);
  const feed = await rpc("condenser_api.get_current_median_history_price", []);
  console.log(`FEED: base=${feed.base} quote=${feed.quote} (SBD per STEEM median)`);

  // extra fleet accounts not checked before
  const extra = ["hcsoldier1", "hcsoldier2", "hcsoldier3", "hcs1", "hcs2", "hcs3", "hcnova1", "ynet"];
  const accts: any[] = await rpc("condenser_api.get_accounts", [extra]);
  console.log("\n=== MISSING-SOLDIER BALANCES (live) ===");
  let es = 0, esb = 0, ev = 0;
  for (const a of accts) {
    if (!a) continue;
    const st = parseFloat(a.balance), sb = parseFloat(a.sbd_balance), vs = parseFloat(a.vesting_shares);
    es += st; esb += sb; ev += vs;
    console.log(`  ${a.name.padEnd(12)} STEEM=${st.toFixed(3)} SBD=${sb.toFixed(3)} VESTS=${(vs / 1e6).toFixed(3)}M(≈${(vs / vestsPerSteem).toFixed(1)} STEEM)`);
  }
  console.log(`  Σ extra: STEEM=${es.toFixed(3)} SBD=${esb.toFixed(3)} HP≈${(ev / vestsPerSteem).toFixed(1)} STEEM`);

  // daily rates for headcorner
  const f = join(DIR, "headcorner.jsonl");
  const ops: Op[] = readFileSync(f, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)).sort((a: Op, b: Op) => a[0] - b[0]);

  console.log("\n=== HEADCORNER DAILY MARKET P&L (sell STEEM->SBD / buy SBD->STEEM) ===");
  type Day = { d: string; sellSteem: number; sellSbd: number; buySteem: number; buySbd: number; convSbd: number; convSteem: number };
  const days = new Map<string, Day>();
  const cp = new Map<string, [number, number]>(); // counterparty -> [sbdPaidByThemToUs(sells), sbdWePaidThem(buys)]
  for (const [idx, ev] of ops) {
    if (ev.timestamp < CUT) continue;
    const [type, p] = ev.op;
    if (type !== "fill_order" && type !== "fill_convert_request") continue;
    const d = ev.timestamp.slice(0, 10);
    const day = days.get(d) ?? { d, sellSteem: 0, sellSbd: 0, buySteem: 0, buySbd: 0, convSbd: 0, convSteem: 0 };
    if (type === "fill_order") {
      const [cv, ca] = amt(p.current_pays); const [ov, oa] = amt(p.open_pays);
      const who = p.open_owner ?? "?";
      if (ca === "STEEM") { day.sellSteem += cv; day.sellSbd += ov; const e = cp.get(who) ?? [0, 0]; e[0] += ov; cp.set(who, e); }
      else { day.buySteem += ov; day.buySbd += cv; const e = cp.get(who) ?? [0, 0]; e[1] += cv; cp.set(who, e); }
    } else {
      const [iv] = amt(p.amount_in); const [ov, oa] = amt(p.amount_out);
      if (oa === "STEEM") { day.convSbd += iv; day.convSteem += ov; }
    }
    days.set(d, day);
  }
  let cumSbd = 0;
  for (const day of [...days.values()].sort((a, b) => a.d.localeCompare(b.d))) {
    const sellRate = day.sellSteem > 0 ? day.sellSbd / day.sellSteem : 0;
    const buyRate = day.buySteem > 0 ? day.buySbd / day.buySteem : 0;
    // daily round-trip P&L in SBD: we value net STEEM inventory change at avg of rates; simpler: P&L = sellSbd - buySbd - convSbd (SBD out) and inventory Δ = -sellSteem + buySteem + convSteem
    const netSbd = day.sellSbd - day.buySbd - day.convSbd;
    const netSteem = -day.sellSteem + day.buySteem + day.convSteem;
    cumSbd += netSbd;
    const mkt = 0.1032; // rough current
    const pnl = netSbd + netSteem * mkt; // ≈ in SBD
    console.log(`  ${day.d} sell=${day.sellSteem.toFixed(1)}@${sellRate.toFixed(5)} buy=${day.buySteem.toFixed(1)}@${buyRate.toFixed(5)} conv=${day.convSbd.toFixed(1)}SBD→${day.convSteem.toFixed(0)}ST | ΣSBD=${netSbd.toFixed(2)} ΣST=${netSteem.toFixed(1)} | dayP&L≈${pnl.toFixed(2)} SBD cum=${cumSbd.toFixed(2)}`);
  }

  console.log("\n=== FILL COUNTERPARTIES (window) ===");
  const arr = [...cp.entries()].sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1]));
  for (const [who, [got, paid]] of arr.slice(0, 12)) console.log(`  ${who.padEnd(16)} we-sold-to-them: got ${got.toFixed(2)} SBD | we-bought-from-them: paid ${paid.toFixed(2)} SBD`);
}
main().catch(e => { console.error("FATAL", e?.message ?? e); process.exit(1); });
