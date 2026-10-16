// wave-91: live chain measurement — balances + open orders for the fleet
const RPCS = ["https://api.steemit.com", "https://api.justyy.com", "https://steem-rpc.publicnode.com"];

const FLEET = [
  "headcorner", "cornerstone", "hcsoldier4", "hcsoldier5", "hcsoldier6",
  "israelnews", "tov", "cashmachine", "haran", "poster", "siq", "wic", "wog", "woq", "lsa", "macrame", "escrow-payroll"
];

async function rpc(endpoint: string, method: string, params: any[]): Promise<any> {
  let lastErr: any = null;
  for (const base of RPCS) {
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      const j: any = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return j.result;
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function main() {
  const accts: any[] = await rpc("/rpc", "condenser_api.get_accounts", [FLEET]);
  const byName = new Map(accts.map(a => [a.name, a]));
  console.log("=== FLEET BALANCES (live " + new Date().toISOString() + ") ===");
  let totSteem = 0, totSbd = 0;
  for (const name of FLEET) {
    const a = byName.get(name);
    if (!a) { console.log(name + ": NOT-FOUND"); continue; }
    const steem = parseFloat(a.balance);
    const sbd = parseFloat(a.sbd_balance);
    const savings = parseFloat(a.savings_balance);
    const vest = parseFloat(a.vesting_shares) / 1e6;
    const recvVest = parseFloat(a.received_vesting_shares) / 1e6;
    const deleVest = parseFloat(a.delegated_vesting_shares) / 1e6;
    totSteem += steem; totSbd += sbd;
    console.log(
      name.padEnd(15) +
      ` STEEM=${steem.toFixed(3)} SBD=${sbd.toFixed(3)} savings=${savings.toFixed(3)}` +
      ` VESTS=${vest.toFixed(1)}(+${recvVest.toFixed(1)}/-${deleVest.toFixed(1)})`
    );
  }
  console.log(`Σ liquid: STEEM=${totSteem.toFixed(3)} SBD=${totSbd.toFixed(3)}`);

  console.log("\n=== OPEN ORDERS (headcorner, cornerstone) ===");
  for (const name of ["headcorner", "cornerstone"]) {
    try {
      const orders: any[] = await rpc("/rpc", "condenser_api.get_open_orders", [name]);
      if (!orders || orders.length === 0) { console.log(`${name}: 0 open orders`); continue; }
      let lockSteem = 0, lockSbd = 0;
      for (const o of orders) {
        const sell = o.sell_price.base.split(" ")[0];
        const sellAsset = o.sell_price.base.split(" ")[1];
        if (sellAsset === "STEEM") lockSteem += parseFloat(sell); else lockSbd += parseFloat(sell);
        console.log(`${name}: id=${o.orderid} ${o.sell_price.base} -> ${o.sell_price.quote} created=${o.created} real_price=${o.real_price}`);
      }
      console.log(`${name}: LOCKED Σ STEEM=${lockSteem.toFixed(3)} SBD=${lockSbd.toFixed(3)}`);
    } catch (e: any) { console.log(`${name}: open orders error ${e.message}`); }
  }

  console.log("\n=== SBD CONVERSION REQUESTS (headcorner, cornerstone) ===");
  for (const name of ["headcorner", "cornerstone"]) {
    try {
      const conv: any[] = await rpc("/rpc", "condenser_api.get_conversion_requests", [name]);
      if (!conv || conv.length === 0) { console.log(`${name}: 0 conversions pending`); continue; }
      for (const c of conv) console.log(`${name}: ${c.amount} requested=${c.requestid} conversion_date=${c.conversion_date}`);
    } catch (e: any) { console.log(`${name}: conversion error ${e.message}`); }
  }

  console.log("\n=== SAVINGS WITHDRAW REQUESTS ===");
  for (const name of ["headcorner", "cornerstone"]) {
    try {
      const sw: any[] = await rpc("/rpc", "condenser_api.get_savings_withdraw_from", [name]);
      if (!sw || sw.length === 0) { console.log(`${name}: 0 savings withdrawals pending`); continue; }
      for (const s of sw) console.log(`${name}: ${s.amount} to=${s.to} complete=${s.complete}`);
    } catch (e: any) { console.log(`${name}: savings error ${e.message}`); }
  }
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
