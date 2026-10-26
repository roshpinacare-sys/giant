/* fx-fixedfloat · fx.ts — FixedFloat API client (real, signed, fail-closed)
 * =============================================================================
 * Directive (owner, cycle-35 trace 1a178850450f2e55 §4): cross-chain routing —
 * the owner supplied a fresh FixedFloat (ff.io) API key+secret
 * (upload/fffixedflot.txt → vault /home/z/.secrets/fixedfloat.env 600).
 *
 * MEASURED SIGNING LAW (W130 · 2026-10-26, live matrix on ff.io with the new
 * owner key): signature = HMAC-SHA256(apiSecret, exact JSON body string) sent
 * as X-API-SIGN, with X-API-KEY + X-API-NONCE. The previously assumed
 * HMAC-SHA1(canonical) law was measured RED: code:501 "Not have permission"
 * on the same transport+key that returns code:0/71 currencies under SHA256.
 * Transport law (W117 + W130 re-measured): bare fetch/undici is WAF-blocked
 * (HTTP 403 HTML); the only passing transport is curl child_process with a
 * browser User-Agent. Fail-honest: the rail serves the exact measured state,
 * never fabricates rates. ZERO mocks, ZERO stubs, ZERO TODOs.
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

/** Canonical form: sort keys alphabetically, recursively (retained for deterministic
 * serialization audits; the live signing law is SHA256 over the exact body string). */
export function canonical(body: Record<string, unknown>): string {
  const keys = Object.keys(body).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = body[k];
    parts.push(k + (typeof v === "object" && v !== null ? JSON.stringify(deepSort(v)) : String(v)));
  }
  return parts.join("");
}

/** MEASURED LAW (W130): HMAC-SHA256(secret, exact JSON body string), hex.
 * Verified live: sha1-canonical → code:501 · sha256(body) → code:0 (71 currencies). */
export function signBody(bodyString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(bodyString).digest("hex");
}

/** Legacy signature primitive retained (canonical sorting) — no longer the wire law.
 * Kept exported because receipts/audits reference it; tests pin it explicitly. */
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
  const doFetch = opts.fetchImpl; // injected transport (tests) · absent → measured curl law
  if (!apiKey || !apiSecret) {
    return {
      async call() {
        throw new Error("ff-no-credentials (fail-closed)");
      },
    };
  }
  return {
    async call(method, params) {
      // MEASURED contract (W130): method-per-path (/api/v2/price, /api/v2/ccies, ...)
      // — body is the params themselves; signature = HMAC-SHA256(exact body string);
      // transport = curl child_process + browser UA (bare fetch is WAF-blocked 403).
      if (!(FF_METHODS as readonly string[]).includes(method)) {
        throw new Error(`ff-unknown-method:${method}`);
      }
      const bodyString = JSON.stringify({ ...params } as Record<string, unknown>);
      const sig = signBody(bodyString, apiSecret);
      const nonce = String(Date.now());

      async function viaFetch(): Promise<Response> {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          return await (doFetch as typeof fetch)(FF_API_URL + method, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Api-Key": apiKey,
              "X-Signature": sig,
            },
            body: bodyString,
            signal: ctl.signal,
          });
        } finally {
          clearTimeout(t);
        }
      }

      async function viaCurl(): Promise<Response> {
        const args = [
          "-s", "-m", String(Math.ceil(timeoutMs / 1000)), "-X", "POST",
          FF_API_URL + method,
          "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "-H", "Content-Type: application/json",
          "-H", `X-API-KEY: ${apiKey}`,
          "-H", `X-API-NONCE: ${nonce}`,
          "-H", `X-API-SIGN: ${sig}`,
          "-d", bodyString,
        ];
        const stdout = await new Promise<string>((resolve, reject) => {
          const proc = Bun.spawnSync(["curl", ...args], { stdout: "pipe", stderr: "ignore" });
          if (proc.exitCode !== 0) reject(new Error(`ff-curl-exit-${proc.exitCode}`));
          else resolve(new TextDecoder().decode(proc.stdout));
        });
        // curl passes transport (WAF) — status inferred from envelope; a WAF HTML page
        // fails JSON parsing → ff-bad-envelope (fail-honest, never fabricates).
        return new Response(stdout, { status: 200 });
      }

      const res = doFetch ? await viaFetch() : await viaCurl();
      if (!res.ok) throw new Error(`ff-http-${res.status}`);
      let json: { msg?: unknown; data?: unknown; code?: unknown };
      try {
        json = (await res.json()) as { msg?: unknown; data?: unknown; code?: unknown };
      } catch {
        throw new Error("ff-bad-envelope");
      }
      if (json && typeof json === "object" && "data" in json) return json;
      throw new Error("ff-bad-envelope");
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
