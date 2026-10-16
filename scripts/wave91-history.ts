// wave-91: parallel full account-history puller (page=100, 6 workers), cache as JSONL
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const RPCS = ["https://api.steemit.com", "https://api.justyy.com", "https://steem-rpc.publicnode.com"];
const OUT_DIR = "/home/z/my-project/scripts/wave91-cache";
mkdirSync(OUT_DIR, { recursive: true });
const PAGE = 100;

async function rpc(method: string, params: any[], tries = 4): Promise<any> {
  let lastErr: any = null;
  for (let t = 0; t < tries; t++) {
    const base = RPCS[t % RPCS.length];
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      const txt = await r.text();
      if (!txt || txt.length < 2) throw new Error("empty body");
      let j: any;
      try { j = JSON.parse(txt); } catch { throw new Error("bad json: " + txt.slice(0, 60)); }
      if (j.error) throw new Error((j.error.message || "").slice(0, 120));
      if (j.result === null || j.result === undefined) throw new Error("null result");
      return j.result;
    } catch (e: any) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 400 * (t + 1)));
    }
  }
  throw lastErr;
}

async function pull(account: string) {
  const outFile = join(OUT_DIR, account + ".jsonl");
  const doneFile = join(OUT_DIR, account + ".done");
  if (existsSync(doneFile)) { console.log(`${account}: cache complete already, skip`); return; }

  const last: any[] = await rpc("condenser_api.get_account_history", [account, -1, 1]);
  const lastIdx = last[last.length - 1][0];
  console.log(`${account}: last op index = ${lastIdx}`);

  // collect seen indices to dedupe overlaps
  const seen = new Set<number>();
  let lowest = Infinity;
  if (existsSync(outFile)) {
    const lines = require("fs").readFileSync(outFile, "utf8").split("\n").filter(Boolean);
    for (const l of lines) { try { const i = JSON.parse(l)[0]; seen.add(i); if (i < lowest) lowest = i; } catch {} }
  }

  // atomic-ish cursor across workers
  let cursor = Number.isFinite(lowest) ? lowest - 1 : lastIdx;
  let errors = 0;
  const WORKERS = 6;

  async function worker(id: number) {
    while (cursor > 0) {
      const from = Math.max(0, cursor - PAGE + 1);
      const limit = cursor - from;
      cursor = from - 1; // claim this page
      if (limit < 0) break;
      try {
        const batch: any[] = await rpc("condenser_api.get_account_history", [account, from + limit, limit]);
        let lines = "";
        for (const item of batch) {
          const idx = item[0];
          if (seen.has(idx)) continue;
          seen.add(idx);
          lines += JSON.stringify(item) + "\n";
        }
        if (lines) appendFileSync(outFile, lines);
      } catch (e: any) {
        errors++;
        if (errors % 20 === 1) console.log(`${account} w${id}: page error at ${from}: ${e.message}`);
        // re-queue: retry this page synchronously with more patience
        try {
          const batch: any[] = await rpc("condenser_api.get_account_history", [account, from + limit, limit], 6);
          let lines = "";
          for (const item of batch) {
            const idx = item[0];
            if (seen.has(idx)) continue;
            seen.add(idx);
            lines += JSON.stringify(item) + "\n";
          }
          if (lines) appendFileSync(outFile, lines);
        } catch (e2: any) {
          console.log(`${account} w${id}: HARD FAIL page ${from}: ${e2.message}`);
        }
      }
      if (errors > 200) { console.log(`${account}: too many errors, stopping`); return; }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  writeFileSync(doneFile, new Date().toISOString());
  console.log(`${account}: DONE, seen=${seen.size}, file=${outFile}`);
}

async function main() {
  for (const a of ["cornerstone", "headcorner"]) await pull(a);
  console.log("ALL DONE");
}
main().catch(e => { console.error("FATAL", e?.message ?? e); process.exit(1); });
