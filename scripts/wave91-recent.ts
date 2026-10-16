// wave-91: recent-window timeline + balance identity + HP valuation
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DIR = "/home/z/my-project/scripts/wave91-cache";
const RPCS = ["https://api.steemit.com", "https://api.justyy.com", "https://steem-rpc.publicnode.com"];

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
  if (typeof s !== "string") return [0, "NONE"];
  const [v, a] = s.split(" ");
  return [parseFloat(v), a ?? "NONE"];
}

type Op = [number, { block: number; timestamp: string; op: [string, any] }];

const CUT = "2026-08-01T00:00:00"; // 77-day window

async function main() {
  // global props for vest->steem ratio
  const g = await rpc("condenser_api.get_dynamic_global_properties", []);
  const vestsPerSteem = parseFloat(g.total_vesting_shares) / parseFloat(g.total_vesting_fund_steem);
  console.log(`GLOBAL: vests/steem=${vestsPerSteem.toFixed(2)} head_block=${g.head_block_number} time=${g.time}`);

  for (const account of ["headcorner", "cornerstone"]) {
    const f = join(DIR, account + ".jsonl");
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n").filter(Boolean);
    const ops: Op[] = lines.map(l => JSON.parse(l)).sort((a, b) => a[0] - b[0]);
    const a: any = await rpc("condenser_api.get_accounts", [[account]]).then((x: any[]) => x[0]);
    const liquidSteem = parseFloat(a.balance);
    const sbd = parseFloat(a.sbd_balance);
    const vestRaw = parseFloat(a.vesting_shares);
    const recv = parseFloat(a.received_vesting_shares);
    const dele = parseFloat(a.delegated_vesting_shares);
    const hpSteem = (vestRaw - dele + recv) / vestsPerSteem;
    const nextWithdraw = a.next_vesting_withdrawal;
    const toWithdraw = a.to_withdraw, withdrawn = a.withdrawn;

    console.log(`\n############ ${account} LIVE: liquid=${liquidSteem.toFixed(3)} STEEM, SBD=${sbd.toFixed(3)}, HP=${hpSteem.toFixed(1)} STEEM-worth (vests=${(vestRaw / 1e6).toFixed(2)}M recv=${(recv / 1e6).toFixed(2)}M dele=${(dele / 1e6).toFixed(2)}M) nextPowerdown=${nextWithdraw} toWithdraw=${toWithdraw} withdrawn=${withdrawn}`);

    // totals across full history including powerdown fills (vests valued at rate)
    let dLiquid = 0, dSbd = 0, poweredUp = 0, poweredDownSteem = 0;
    for (const [idx, ev] of ops) {
      const [type, p] = ev.op;
      const ts = ev.timestamp;
      switch (type) {
        case "transfer": { const [v, s] = amt(p.amount); if (s === "STEEM") dLiquid += p.to === account ? v : -v; else dSbd += p.to === account ? v : -v; break; }
        case "transfer_to_vesting": { const [v, s] = amt(p.amount); if (p.from === account && s === "STEEM") { dLiquid -= v; poweredUp += v; } break; }
        case "fill_vesting_withdraw": { const [v, s] = amt(p.deposited ?? p.earned); if (s === "VESTS") { poweredDownSteem += v / vestsPerSteem; } break; }
        case "fill_order": {
          const [cv, ca] = amt(p.current_pays); const [ov, oa] = amt(p.open_pays);
          if (ca === "STEEM") dLiquid -= cv; else dSbd -= cv;
          if (oa === "STEEM") dLiquid += ov; else dSbd += ov;
          break;
        }
        case "convert": { const [v, s] = amt(p.amount); if (p.owner === account) { if (s === "SBD" || s === "HBD") dSbd -= v; else dLiquid -= v; } break; }
        case "fill_convert_request": { const [iv, ia] = amt(p.amount_in); const [ov2, oa2] = amt(p.amount_out); if (p.owner === account) { if (oa2 === "STEEM") dLiquid += ov2; else dSbd += ov2; } break; }
        case "claim_reward_balance": { const [vs, sa] = amt(p.reward_steem); const [vb, sb] = amt(p.reward_sbd); dLiquid += vs; dSbd += sb; break; }
        case "transfer_to_savings": { const [v, s] = amt(p.amount); if (p.from === account) { if (s === "STEEM") dLiquid -= v; else dSbd -= v; } break; }
        case "transfer_from_savings": { const [v, s] = amt(p.amount); if (p.from === account) { if (s === "STEEM") dLiquid += v; else dSbd += v; } break; }
        case "cancel_transfer_from_savings": { const [v, s] = amt(p.amount); if (p.from === account) { if (s === "STEEM") dLiquid -= v; else dSbd -= v; } break; }
        case "collateralized_convert": { const [v, s] = amt(p.amount); if (p.owner === account) dLiquid -= v; break; }
      }
    }
    console.log(`-- ALL-TIME DELTAS: liquid Δ=${dLiquid.toFixed(3)} STEEM, SBD Δ=${dSbd.toFixed(3)}, poweredUp=${poweredUp.toFixed(3)}, poweredDown≈${poweredDownSteem.toFixed(3)} STEEM`);

    // ---- recent window detail (>= CUT)
    const recent = ops.filter(([i, ev]) => ev.timestamp >= CUT);
    console.log(`\n-- RECENT WINDOW (${CUT} .. now): ${recent.length} money-ops`);
    let rin = 0, rout = 0, sin = 0, sout = 0;
    for (const [idx, ev] of recent) {
      const [type, p] = ev.op;
      const ts = ev.timestamp;
      switch (type) {
        case "transfer": { const [v, s] = amt(p.amount); if (p.to === account) { rin += v; sin += v; console.log(`  ${ts} IN  ${v} ${s} from=${p.from} memo=${(p.memo || "").slice(0, 40)}`); } else { rout += v; sout += v; console.log(`  ${ts} OUT ${v} ${s} to=${p.to} memo=${(p.memo || "").slice(0, 40)}`); } break; }
        case "transfer_to_vesting": { const [v, s] = amt(p.amount); if (p.from === account) { console.log(`  ${ts} PWRUP ${v} ${s} -> ${p.to === account ? "self" : p.to}`); rout += v; } break; }
        case "fill_vesting_withdraw": { const [v, s] = amt(p.deposited ?? p.earned); if (s === "VESTS") console.log(`  ${ts} PWRDOWN +${(v / vestsPerSteem).toFixed(3)} STEEM-equiv`); break; }
        case "fill_order": {
          const [cv, ca] = amt(p.current_pays); const [ov, oa] = amt(p.open_pays);
          if (ca === "STEEM") { console.log(`  ${ts} SELL ${cv} STEEM -> ${ov} ${oa} (owner=${p.open_owner} ord=${p.open_orderid})`); rout += cv; } else { console.log(`  ${ts} BUY  ${cv} ${ca} -> ${ov} STEEM (owner=${p.open_owner} ord=${p.open_orderid})`); rin += ov; }
          break;
        }
        case "convert": { const [v, s] = amt(p.amount); console.log(`  ${ts} CONVERT ${v} ${s} req=${p.requestid}`); break; }
        case "fill_convert_request": { const [iv, ia] = amt(p.amount_in); const [ov2, oa2] = amt(p.amount_out); console.log(`  ${ts} CONVERT-FILL in=${iv} ${ia} out=${ov2} ${oa2}`); break; }
        case "claim_reward_balance": { const [vs, sa] = amt(p.reward_steem); const [vb, sb] = amt(p.reward_sbd); const [vv, svs] = amt(p.reward_vests); if (vs || vb || vv > 1000) console.log(`  ${ts} CLAIM steem=${vs} sbd=${sb} vests=${vv}`); break; }
        case "delegate_vesting_shares": { const [v, s] = amt(p.vesting_shares); console.log(`  ${ts} DELEGATE ${v} ${s} to=${p.delegatee}`); break; }
        case "limit_order_create": { const [v, s] = amt(p.amount_to_sell); const [mv, ms] = amt(p.min_to_receive); console.log(`  ${ts} ORDER-CREATE ${v} ${s} -> ${mv} ${ms} id=${p.orderid}`); break; }
        case "limit_order_cancel": { console.log(`  ${ts} ORDER-CANCEL id=${p.orderid}`); break; }
      }
    }
    console.log(`-- RECENT WINDOW Σ: STEEM in=${rin.toFixed(3)} out=${rout.toFixed(3)} net=${(rin - rout).toFixed(3)} | SBD in=${sin.toFixed(3)} out=${sout.toFixed(3)} net=${(sin - sout).toFixed(3)}`);
  }
}
main().catch(e => { console.error("FATAL", e?.message ?? e); process.exit(1); });
