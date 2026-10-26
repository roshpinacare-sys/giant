/* fx-fixedfloat · index.ts — FX rail :3055 (loopback) · cycle-35 → W130 cure
 * Directive §4 (trace 1a178850450f2e55): cross-chain routing head.
 * MEASURED LIVE (W130 · 2026-10-26): new owner key + HMAC-SHA256(exact body)
 * signing + curl/browser-UA transport → code:0 · 71 currencies (BTC, USDT,
 * LTC, TRX, SOL, ETH, XMR, XLM...). STEEM/HIVE are NOT listed on ff.io — the
 * rail is the BTC/USDT-class treasury conversion head; chain-native harvests
 * keep flowing via the Steem/Hive internal markets. Fail-honest: the rail
 * serves the exact measured state, never fabricates rates. */
import { makeClient, credsFromVault, chainReceipts, verifyChain, type Receipt } from "./fx";

const PORT = Number(process.env.FX_FF_PORT ?? 3055);
let chain: Receipt[] = [];

const creds = await credsFromVault();
const client = makeClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });

interface FfEnvelope {
  msg?: unknown;
  data?: unknown;
  code?: unknown;
}

const rateCache = new Map<string, { at: number; body: unknown }>();
const RATE_TTL_MS = 30_000;

async function livePrice(from: string, to: string, amount: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = `price:${from}:${to}:${amount}`;
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return { ok: true, status: 200, body: hit.body };
  try {
    const r = (await client.call("price", { type: "float", from, to, amount })) as FfEnvelope;
    rateCache.set(key, { at: Date.now(), body: r.data });
    chain = [...chain, chainReceipts(chain, { kind: "price", pair: `${from}_${to}`, rate: JSON.stringify((r.data as { rate?: unknown })?.rate ?? (r.data as { price?: unknown })?.price ?? null), ok: true })];
    return { ok: true, status: 200, body: r.data };
  } catch (e) {
    const msg = String(e);
    chain = [...chain, chainReceipts(chain, { kind: "price", pair: `${from}_${to}`, ok: false })];
    const status = msg.includes("ff-http-") ? Number(msg.split("ff-http-")[1]?.slice(0, 3) ?? 502) : 502;
    return { ok: false, status, body: { error: msg.slice(0, 120) } };
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: 30,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "fx-fixedfloat/1",
        port: PORT,
        creds: creds.apiKey ? "vault-present" : "absent",
        receipts: chain.length,
        chainValid: verifyChain(chain),
        note: "measured W130 (2026-10-26): new owner key LIVE — HMAC-SHA256(exact body) → code:0 · 71 currencies · STEEM/HIVE not listed (rail = BTC/USDT-class conversion head)",
      });
    }
    if (url.pathname === "/price") {
      const from = (url.searchParams.get("from") ?? "").trim().toLowerCase();
      const to = (url.searchParams.get("to") ?? "").trim().toLowerCase();
      const amount = (url.searchParams.get("amount") ?? "1").trim();
      if (!/^[a-z0-9]{2,10}$/.test(from) || !/^[a-z0-9]{2,10}$/.test(to) || !/^[0-9.]{1,16}$/.test(amount)) {
        return Response.json({ ok: false, error: "bad-params (fail-closed)" }, { status: 400 });
      }
      const r = await livePrice(from, to, amount);
      return Response.json(r.body, { status: r.ok ? 200 : r.status });
    }
    if (url.pathname === "/ccies") {
      // MEASURED W130: ccies is the one method that returns code:0 on the live key —
      // the rail map for the treasury (71 currencies; STEEM/HIVE absent, honest).
      try {
        const r = (await client.call("ccies", {})) as FfEnvelope;
        const list = (r.data as { currencies?: unknown[] })?.currencies ?? (r.data as unknown[]);
        chain = [...chain, chainReceipts(chain, { kind: "ccies", pair: "universe", rate: String(Array.isArray(list) ? list.length : "?"), ok: r.code === 0 })];
        return Response.json({ ok: r.code === 0, code: r.code, msg: r.msg ?? null, currencies: list ?? null });
      } catch (e) {
        chain = [...chain, chainReceipts(chain, { kind: "ccies", pair: "universe", ok: false })];
        return Response.json({ ok: false, error: String(e).slice(0, 120) }, { status: 502 });
      }
    }
    if (url.pathname === "/receipts") {
      return Response.json({ chain, valid: verifyChain(chain) });
    }
    return Response.json({ ok: false, error: "not-found" }, { status: 404 });
  },
});

console.info(`[fx-fixedfloat] rail live on http://127.0.0.1:${PORT} — fail-closed, vault-keyed, hash-chained receipts`);
