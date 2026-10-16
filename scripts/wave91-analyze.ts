// wave-91: reconstruct STEEM/SBD money flow from cached account history
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DIR = "/home/z/my-project/scripts/wave91-cache";
const ACCOUNTS = ["cornerstone", "headcorner"];

type Op = [number, { block: number; timestamp: string; op: [string, any] }];

const MONEY_OPS = new Set([
  "transfer", "transfer_to_vesting", "transfer_from_vesting", "withdraw_vesting",
  "transfer_to_savings", "transfer_from_savings", "cancel_transfer_from_savings",
  "escrow_transfer", "escrow_release",
  "limit_order_create", "limit_order_cancel", "fill_order",
  "convert", "fill_convert_request", "collateralized_convert", "fill_collateralized_convert_request",
  "claim_reward_balance", "fill_vesting_withdraw", "delegate_vesting_shares", "return_vesting_delegation",
  "interest", "fill_recurrent_transfer", "recurrent_transfer", "proposal_pay", "comment_benefactor_reward",
]);

function amt(s: string | undefined | null): [number, string] {
  if (typeof s !== "string") return [0, "NONE"];
  const [v, a] = s.split(" ");
  return [parseFloat(v), a ?? "NONE"];
}

async function main() {
  for (const account of ACCOUNTS) {
    const f = join(DIR, account + ".jsonl");
    if (!existsSync(f)) { console.log(`${account}: no cache`); continue; }
    const lines = readFileSync(f, "utf8").split("\n").filter(Boolean);
    const ops: Op[] = lines.map(l => JSON.parse(l));
    ops.sort((a, b) => a[0] - b[0]); // ascending by index

    console.log(`\n################ ${account}: ${ops.length} ops, ${ops[0][1].timestamp} .. ${ops[ops.length - 1][1].timestamp}`);

    // ---- aggregate deltas by mechanism/counterparty
    const steemIn = new Map<string, number>();
    const steemOut = new Map<string, number>();
    const sbdIn = new Map<string, number>();
    const sbdOut = new Map<string, number>();
    let predSteem = 0, predSbd = 0;

    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

    const firstTs = ops[0][1].timestamp;
    for (const [idx, ev] of ops) {
      const [type, p] = ev.op;
      if (!MONEY_OPS.has(type)) continue;
      const ts = ev.timestamp;

      switch (type) {
        case "transfer": {
          const [v, a] = amt(p.amount);
          if (a === "STEEM") { if (p.to === account) { predSteem += v; add(steemIn, "transfer<-from:" + p.from, v); } else { predSteem -= v; add(steemOut, "transfer->to:" + p.to, v); } }
          else if (a === "SBD" || a === "HBD") { if (p.to === account) { predSbd += v; add(sbdIn, "transfer<-from:" + p.from, v); } else { predSbd -= v; add(sbdOut, "transfer->to:" + p.to, v); } }
          break;
        }
        case "transfer_to_vesting": {
          const [v, a] = amt(p.amount);
          if (a === "STEEM" && p.from === account) { predSteem -= v; add(steemOut, `powerup->${p.to === account ? "self" : p.to}`, v); }
          break;
        }
        case "fill_vesting_withdraw": {
          const [v, a] = amt(p.earned);
          if (a === "STEEM") { predSteem += v; add(steemIn, "powerdown-fill", v); }
          break;
        }
        case "claim_reward_balance": {
          const vs = amt(p.reward_steem)[0];
          const sb = amt(p.reward_sbd)[0];
          if (vs) { predSteem += vs; add(steemIn, "claim-reward", vs); }
          if (sb) { predSbd += sb; add(sbdIn, "claim-reward", sb); }
          break;
        }
        case "fill_order": {
          const [curV, curA] = amt(p.current_pays);
          const [opV, opA] = amt(p.open_pays);
          // I am current_owner: I pay current_pays, receive open_pays
          if (curA === "STEEM") { predSteem -= curV; add(steemOut, "fill_order(paid STEEM)", curV); } else { predSbd -= curV; add(sbdOut, "fill_order(paid SBD)", curV); }
          if (opA === "STEEM") { predSteem += opV; add(steemIn, "fill_order(received STEEM)", opV); } else { predSbd += opV; add(sbdIn, "fill_order(received SBD)", opV); }
          break;
        }
        case "convert": {
          const [v, a] = amt(p.amount);
          if (p.owner === account) {
            if (a === "SBD" || a === "HBD") { predSbd -= v; add(sbdOut, "convert(SBD->STEEM)", v); }
            else { predSteem -= v; add(steemOut, "convert(STEEM->?)", v); }
          }
          break;
        }
        case "fill_convert_request": {
          const [inV, inA] = amt(p.amount_in);
          const [outV, outA] = amt(p.amount_out);
          if (p.owner === account) {
            if (outA === "STEEM") { predSteem += outV; add(steemIn, "convert-fill(received STEEM)", outV); }
            else { predSbd += outV; add(sbdIn, "convert-fill(received SBD)", outV); }
          }
          break;
        }
        case "collateralized_convert": {
          const [v, a] = amt(p.amount);
          if (p.owner === account) { predSteem -= v; add(steemOut, "collat-convert", v); }
          break;
        }
        case "fill_collateralized_convert_request": {
          const [outV, outA] = amt(p.hbd_back ?? p.amount_out ?? "0 " + "SBD");
          if (p.owner === account && (outA === "SBD" || outA === "HBD")) { predSbd += outV; add(sbdIn, "collat-convert-fill", outV); }
          break;
        }
        case "transfer_to_savings": {
          const [v, a] = amt(p.amount);
          if (p.from === account) { if (a === "STEEM") { predSteem -= v; add(steemOut, "to-savings", v); } else { predSbd -= v; add(sbdOut, "to-savings", v); } }
          break;
        }
        case "transfer_from_savings": {
          const [v, a] = amt(p.amount);
          if (p.from === account) { if (a === "STEEM") { predSteem += v; add(steemIn, "from-savings-req", v); } else { predSbd += v; add(sbdIn, "from-savings-req", v); } }
          break;
        }
        case "cancel_transfer_from_savings": {
          const [v, a] = amt(p.amount);
          if (p.from === account) { if (a === "STEEM") { predSteem -= v; add(steemOut, "savings-req-cancel", v); } else { predSbd -= v; add(sbdOut, "savings-req-cancel", v); } }
          break;
        }
        case "escrow_transfer": {
          const [v, a] = amt(p.steem_amount ?? p.amount ?? "0 STEEM");
          if (p.from === account) { predSteem -= v; add(steemOut, "escrow", v); }
          const [sV, sA] = amt(p.sbd_amount ?? "0 SBD");
          if (p.from === account && sV) { predSbd -= sV; add(sbdOut, "escrow", sV); }
          break;
        }
        case "escrow_release": {
          const [v, a] = amt(p.steem_amount ?? p.amount ?? "0 STEEM");
          if (p.receiver === account) { predSteem += v; add(steemIn, "escrow-release", v); }
          break;
        }
        case "interest": {
          const [v, a] = amt(p.interest ?? "0 SBD");
          if (p.owner === account && (a === "SBD" || a === "HBD")) { predSbd += v; add(sbdIn, "sbd-interest", v); }
          break;
        }
        case "fill_recurrent_transfer": {
          const [v, a] = amt(p.amount);
          if (p.to === account) { if (a === "STEEM") { predSteem += v; add(steemIn, "recurrent<-", v); } else { predSbd += v; add(sbdIn, "recurrent<-", v); } }
          else if (p.from === account) { if (a === "STEEM") { predSteem -= v; add(steemOut, "recurrent->", v); } else { predSbd -= v; add(sbdOut, "recurrent->", v); } }
          break;
        }
      }
    }

    // ---- top counterparties
    const dump = (name: string, m: Map<string, number>) => {
      const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
      const total = arr.reduce((s, [_, v]) => s + v, 0);
      console.log(`\n-- ${name}: Σ=${total.toFixed(3)} (${arr.length} buckets)`);
      for (const [k, v] of arr.slice(0, 14)) console.log(`   ${v.toFixed(3).padStart(12)}  ${k}`);
    };
    dump("STEEM INFLOW", steemIn);
    dump("STEEM OUTFLOW", steemOut);
    dump("SBD INFLOW", sbdIn);
    dump("SBD OUTFLOW", sbdOut);

    console.log(`\n-- PREDICTED deltas: STEEM=${predSteem.toFixed(3)} SBD=${predSbd.toFixed(3)} (live: STEEM=15.238 SBD=42.099 for headcorner / STEEM=49.771 SBD=39.545 for cornerstone)`);

    // ---- large transfers IN (the ~1100 hunt)
    console.log(`\n-- LARGE TRANSFERS IN (>=20):`);
    for (const [idx, ev] of ops) {
      const [type, p] = ev.op;
      if (type !== "transfer") continue;
      const [v, a] = amt(p.amount);
      if (v >= 20 && p.to === account) console.log(`   ${ev.timestamp} idx=${idx} ${v} ${a} from=${p.from} memo=${(p.memo || "").slice(0, 60).replace(/\n/g, " ")}`);
    }
    console.log(`\n-- LARGE TRANSFERS OUT (>=20):`);
    for (const [idx, ev] of ops) {
      const [type, p] = ev.op;
      if (type !== "transfer") continue;
      const [v, a] = amt(p.amount);
      if (v >= 20 && p.from === account) console.log(`   ${ev.timestamp} idx=${idx} ${v} ${a} to=${p.to} memo=${(p.memo || "").slice(0, 60).replace(/\n/g, " ")}`);
    }

    // ---- powerups/converts large
    console.log(`\n-- LARGE powerup/convert (>=20):`);
    for (const [idx, ev] of ops) {
      const [type, p] = ev.op;
      if (!["transfer_to_vesting", "convert", "collateralized_convert"].includes(type)) continue;
      const amountStr = p.amount;
      if (!amountStr) continue;
      const [v, a] = amt(amountStr);
      if (v >= 20 && p.owner === account || (type === "transfer_to_vesting" && v >= 20 && p.from === account)) console.log(`   ${ev.timestamp} idx=${idx} ${type} ${v} ${a} to=${p.to ?? p.owner}`);
    }
  }
}
main().catch(e => { console.error("FATAL", e?.message ?? e); process.exit(1); });
