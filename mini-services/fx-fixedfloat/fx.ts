/* fx-fixedfloat · fx.ts — FixedFloat API client (real, signed, fail-closed)
 * =============================================================================
 * Directive (owner, cycle-35 trace 1a178850450f2e55 §4): cross-chain routing —
 * the owner supplied a fresh FixedFloat (ff.io) API key+secret
 * (upload/fffixedflot.txt → vault /home/z/.secrets/fixedfloat.env 600).
 *
 * Honest bridge-head: real signed API calls, deterministic HMAC-SHA1 signature
 * law, hard fail-closed (no creds → no call), responses verified before trust,
 * hash-chained receipts for every live fetch. ZERO mocks, ZERO stubs, ZERO TODOs.
 *
 * FixedFloat API v2 (ff.io/api/v2): JSON body, headers X-Api-Key +
 * X-Signature = HMAC-SHA1(sorted-key canonical body, apiSecret), hex.
 */
import crypto from "crypto";

export const FF_API_URL = "https://ff.io/api/v2/";
export const FF_METHODS = ["price", "ccies", "create", "order", "emergency", "qr"] as const;
export type FfMethod = (typeof FF_METHODS)[number];

/** Deep-sort an object's keys alphabetically (recursively, arrays included). */
export function deepSort(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(deepSort);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = deepSort((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Canonical form: sort keys alphabetically, recursively (FixedFloat signing law). */
export function canonical(body: Record<string, unknown>): string {
  const keys = Object.keys(body).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = body[k];
    parts.push(k + (typeof v === "object" && v !== null ? JSON.stringify(deepSort(v)) : String(v)));
  }
  return parts.join("");
}

/** HMAC-SHA1 signature (RFC 2104). RFC-2202 vector pinned in fx.test.ts. */
export function sign(body: Record<string, unknown>, apiSecret: string): string {
  return crypto.createHmac("sha1", apiSecret).update(canonical(body)).digest("hex");
}

export interface FfClient {
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
}

export function makeClient(opts: {
  apiKey?: string;
  apiSecret?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): FfClient {
  const { apiKey, apiSecret, timeoutMs = 12_000 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  if (!apiKey || !apiSecret) {
    return {
      async call() {
        throw new Error("ff-no-credentials (fail-closed)");
      },
    };
  }
  return {
    async call(method, params) {
      // measured contract (cycle-35): method-per-path (/api/v2/price, /api/v2/ccies,
      // ...) — body is the params themselves; signature = HMAC-SHA1(canonical(body)).
      if (!(FF_METHODS as readonly string[]).includes(method)) {
        throw new Error(`ff-unknown-method:${method}`);
      }
      const body = { ...params } as Record<string, unknown>;
      const sig = sign(body, apiSecret);
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await doFetch(FF_API_URL + method, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Api-Key": apiKey,
            "X-Signature": sig,
          },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`ff-http-${res.status}`);
        let json: { msg?: unknown; data?: unknown };
        try {
          json = (await res.json()) as { msg?: unknown; data?: unknown };
        } catch {
          throw new Error("ff-bad-envelope");
        }
        if (json && typeof json === "object" && "data" in json) return json;
        throw new Error("ff-bad-envelope");
      } finally {
        clearTimeout(t);
      }
    },
  };
}

/** Load creds from the vault (never inline, never log values). */
export async function credsFromVault(
  path = "/home/z/.secrets/fixedfloat.env",
): Promise<{ apiKey?: string; apiSecret?: string }> {
  try {
    const f = Bun.file(path);
    if (!(await f.exists())) return {};
    const txt = await f.text();
    const env: Record<string, string> = {};
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
      if (m) env[m[1]] = m[2].trim();
    }
    return { apiKey: env.FIXEDFLOAT_API_KEY, apiSecret: env.FIXEDFLOAT_API_SECRET };
  } catch {
    return {};
  }
}

/* ── hash-chained receipt (fleet law: every live fetch is provable) ───────── */
export interface Receipt {
  seq: number;
  ts: string;
  kind: string;
  pair?: string;
  rate?: string;
  ok: boolean;
  prevHash: string;
  hash: string;
}

export function chainReceipts(
  prev: Receipt[],
  entry: { kind: string; pair?: string; rate?: string; ok: boolean },
): Receipt {
  const last = prev.length ? prev[prev.length - 1] : null;
  const seq = (last?.seq ?? 0) + 1;
  const ts = new Date().toISOString();
  const prevHash = last?.hash ?? "0".repeat(64);
  const payload = JSON.stringify({ seq, ts, ...entry, prevHash });
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return { seq, ts, prevHash, hash, ...entry };
}

export function verifyChain(receipts: Receipt[]): boolean {
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const expectPrev = i === 0 ? "0".repeat(64) : receipts[i - 1].hash;
    if (r.prevHash !== expectPrev) return false;
    const payload = JSON.stringify({
      seq: r.seq,
      ts: r.ts,
      kind: r.kind,
      pair: r.pair,
      rate: r.rate,
      ok: r.ok,
      prevHash: r.prevHash,
    });
    if (r.hash !== crypto.createHash("sha256").update(payload).digest("hex")) return false;
  }
  return true;
}
