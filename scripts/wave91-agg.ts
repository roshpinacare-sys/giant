// wave-91 v2: AGGREGATED recent-window analysis with robust amount parsing
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

// robust: string "12.345 STEEM" | NAI object {"amount":"12345","precision":3,"nai":"@@000000021"}
function amt(s: any): [number, string] {
  if (typeof s === "string") { const [v, a] = s.split(" "); return [parseFloat(v), a ?? "NONE"]; }
  if (s && typeof s === "object" && s.amount != null) {
    const sym = s.nai === "@@000000021" ? "STEEM" : s.nai === "@@000000013" ? "SBD" : s.nai === "@@000000037" ? "VESTS" : s.nai ?? "NAI";
    return [parseFloat(s.amount) / Math.pow(10, s.precision ?? 3), sym];
  }
  return [0, "NONE"];
}

type Op = [number, { block: number; timestamp: string; op: [string, any] }];
const CUT = "2026-08-01T00:00:00";

async function main() {
  const g = await rpc("condenser_api.get_dynamic_global_properties", []);
  const vestsPerSteem = parseFloat(g.total_vesting_shares) / parseFloat(g.total_vesting_fund_steem);

  // who holds headcorner's delegated SP?
  const del: any[] = await rpc("condenser_api.get_vesting_delegations", ["headcorner", "", 100]);
  console.log("=== HEADCORNER SP DELEGATIONS OUT ===");
  let dSum = 0;
  for (const d of del) {
    const v = parseFloat(d.vesting_shares);
    dSum += v;
    console.log(`  to=${d.delegatee} vests=${(v / 1e6).toFixed(3)}M ≈ ${(v / vestsPerSteem).toFixed(1)} STEEM`);
  }
  console.log(`  Σ delegated = ${(dSum / 1e6).toFixed(3)}M vests ≈ ${(dSum / vestsPerSteem).toFixed(1)} STEEM`);

  for (const account of ["headcorner", "cornerstone"]) {
    const f = join(DIR, account + ".jsonl");
    if (!existsSync(f)) continue;
    const ops: Op[] = readFileSync(f, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)).sort((a: Op, b: Op) => a[0] - b[0]);

    console.log(`\n############ ${account} RECENT WINDOW (${CUT}..now) AGGREGATED`);

    // aggregation maps
    const inT = new Map<string, [number, number]>();   // counterparty -> [Σ, count]
    const outT = new Map<string, [number, number]>();
    let soldSteem = 0, gotSbdFromSales = 0, boughtSteem = 0, paidSbdForBuys = 0, nSell = 0, nBuy = 0;
    let pwr = 0, claimSteem = 0, claimSbd = 0, claimVests = 0;
    let tinyOut = 0, tinyOutN = 0, tinyIn = 0, tinyInN = 0;
    let ordCreateN = 0, ordCancelN = 0, escrowN = 0;
    let convSbd = 0, convFillSteem = 0;
    const bigOps: string[] = [];

    const bump = (m: Map<string, [number, number]>, k: string, v: number) => { const e = m.get(k) ?? [0, 0]; e[0] += v; e[1]++; m.set(k, e); };

    for (const [idx, ev] of ops) {
      if (ev.timestamp < CUT) continue;
      const [type, p] = ev.op;
      switch (type) {
        case "transfer": {
          const [v, s] = amt(p.amount);
          if (v < 0.05) { // noise channel (pings etc.)
            if (p.to === account) { tinyIn += v; tinyInN++; } else if (p.from === account) { tinyOut += v; tinyOutN++; }
          } else {
            const line = `${ev.timestamp} ${p.to === account ? "IN " : "OUT"} ${v} ${s} ${p.to === account ? "from=" + p.from : "to=" + p.to} memo=${(p.memo || "").slice(0, 30)}`;
            bigOps.push(line);
            if (p.to === account) bump(inT, p.from + " [" + s + "]", v); else bump(outT, p.to + " [" + s + "]", v);
          }
          break;
        }
        case "fill_order": {
          const [cv, ca] = amt(p.current_pays); const [ov, oa] = amt(p.open_pays);
          if (ca === "STEEM") { soldSteem += cv; gotSbdFromSales += ov; nSell++; } else { boughtSteem += ov; paidSbdForBuys += cv; nBuy++; }
          break;
        }
        case "transfer_to_vesting": { const [v, s] = amt(p.amount); if (p.from === account && s === "STEEM") pwr += v; break; }
        case "claim_reward_balance": { const [vs] = amt(p.reward_steem); const [sb] = amt(p.reward_sbd); const [vv] = amt(p.reward_vests); claimSteem += vs; claimSbd += sb; claimVests += vv; break; }
        case "convert": { const [v] = amt(p.amount); convSbd += v; break; }
        case "fill_convert_request": { const [, oa] = amt(p.amount_out); const [ov] = amt(p.amount_out); if (oa === "STEEM") convFillSteem += ov; break; }
        case "limit_order_create": ordCreateN++; break;
        case "limit_order_cancel": ordCancelN++; break;
        case "escrow_transfer": escrowN++; break;
      }
    }

    const dump = (name: string, m: Map<string, [number, number]>) => {
      const arr = [...m.entries()].sort((a, b) => b[1][0] - a[1][0]);
      const tot = arr.reduce((s, [, e]) => s + e[0], 0);
      console.log(`\n-- ${name}: Σ=${tot.toFixed(3)}`);
      for (const [k, [v, c]] of arr.slice(0, 15)) console.log(`   ${v.toFixed(3).padStart(12)} (${String(c).padStart(5)}x) ${k}`);
    };
    dump("TRANSFERS IN ≥0.05 (by counterparty)", inT);
    dump("TRANSFERS OUT ≥0.05 (by counterparty)", outT);
    console.log(`\n-- MARKET ACTIVITY:`);
    console.log(`   SELL fills: ${nSell}x sold ${soldSteem.toFixed(3)} STEEM → received SBD ${gotSbdFromSales.toFixed(3)} (avg rate ${(gotSbdFromSales / (soldSteem || 1)).toFixed(5)})`);
    console.log(`   BUY fills: ${nBuy}x paid SBD ${paidSbdForBuys.toFixed(3)} → bought ${boughtSteem.toFixed(3)} STEEM (avg rate ${(paidSbdForBuys / (boughtSteem || 1)).toFixed(5)})`);
    console.log(`   SBD→STEEM convert: ${convSbd.toFixed(3)} SBD initiated, convert-fills credited ${convFillSteem.toFixed(3)} STEEM`);
    console.log(`   order creates=${ordCreateN} cancels=${ordCancelN} escrow=${escrowN}`);
    console.log(`   powerup=${pwr.toFixed(3)} STEEM`);
    console.log(`   claims: STEEM=${claimSteem.toFixed(3)} SBD=${claimSbd.toFixed(3)} VESTS=${(claimVests / 1e6).toFixed(3)}M (≈${(claimVests / vestsPerSteem).toFixed(2)} STEEM)`);
    console.log(`   noise-channel: IN ${tinyInN}x Σ${tinyIn.toFixed(3)} | OUT ${tinyOutN}x Σ${tinyOut.toFixed(3)} STEEM`);
    console.log(`\n-- BIG TRANSFERS (${bigOps.length}):`);
    for (const l of bigOps.slice(-40)) console.log("   " + l);
  }
}
main().catch(e => { console.error("FATAL", e?.message ?? e); process.exit(1); });
