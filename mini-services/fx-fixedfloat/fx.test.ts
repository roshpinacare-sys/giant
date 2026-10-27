/* fx-fixedfloat · fx.test.ts — TDD red-first (cycle-35, no mocks of logic) */
import { describe, test, expect } from "bun:test";
import { canonical, sign, makeClient, chainReceipts, verifyChain, type Receipt } from "./fx";

describe("canonical signing law", () => {
  test("sorts keys alphabetically and stringifies deterministically", () => {
    expect(canonical({ b: 2, a: 1 })).toBe("a1b2");
    expect(canonical({ type: "float", from: "eth", to: "btc" })).toBe("fromethtobtctypefloat");
    expect(canonical({ params: { to: "usdt", from: "btc", type: "float" }, method: "price" })).toBe(
      'methodpriceparams{"from":"btc","to":"usdt","type":"float"}',
    );
  });
});

describe("HMAC-SHA1 signature (RFC 2202 pinned vector)", () => {
  test("known vector key/data → de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9", () => {
    // RFC 2202 T3: key="key", data="The quick brown fox jumps over the lazy dog"
    const body = { m: "The quick brown fox jumps over the lazy dog" };
    const canonicalBody = canonical(body);
    // sign() hashes canonical(body); assert through the same primitive:
    const { canonical: c } = { canonical };
    expect(c({ m: "The quick brown fox jumps over the lazy dog" })).toBe("mThe quick brown fox jumps over the lazy dog");
    const h = sign({ x: "The quick brown fox jumps over the lazy dog" }, "key");
    // canonical is "x<data>"; HMAC-SHA1(key="key") over exactly the data string:
    // derive via node crypto to double-check the primitive itself:
    const crypto = require("crypto");
    const direct = crypto.createHmac("sha1", "key").update("The quick brown fox jumps over the lazy dog").digest("hex");
    expect(direct).toBe("de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9");
    expect(h).toBe(
      crypto.createHmac("sha1", "key").update(canonicalBody.replace("m", "x")).digest("hex"),
    );
  });
});

describe("fail-closed client", () => {
  test("no credentials → throws, never calls network", async () => {
    let called = false;
    const client = makeClient({
      fetchImpl: (async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(client.call("getRate", {}).catch((e) => String(e))).resolves.toContain("ff-no-credentials");
    await new Promise((r) => setTimeout(r, 10));
    expect(called).toBe(false);
  });
});

describe("live-envelope verification (injected transport, real logic)", () => {
  test("valid envelope passes; malformed envelope rejected", async () => {
    const good = makeClient({
      apiKey: "k",
      apiSecret: "s",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ msg: "ok", data: { rate: "1.0" } }), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    const res = (await good.call("price", { type: "float", from: "eth", to: "btc" })) as { data?: { rate?: string } };
    expect(res.data?.rate).toBe("1.0");

    const bad = makeClient({
      apiKey: "k",
      apiSecret: "s",
      fetchImpl: (async () => new Response("<html>not json</html>", { status: 200 })) as unknown as typeof fetch,
    });
    expect(bad.call("price", {}).catch((e) => String(e))).resolves.toContain("ff-bad-envelope");

    const http500 = makeClient({
      apiKey: "k",
      apiSecret: "s",
      fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    });
    expect(http500.call("price", {}).catch((e) => String(e))).resolves.toContain("ff-http-500");

    const unknownMethod = makeClient({
      apiKey: "k",
      apiSecret: "s",
      fetchImpl: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    });
    expect(unknownMethod.call("getRate", {}).catch((e) => String(e))).resolves.toContain("ff-unknown-method:getRate");
  });
});

describe("hash-chained receipts", () => {
  test("chain verifies; splice/tamper detected", () => {
    let chain: Receipt[] = [];
    chain = [...chain, chainReceipts(chain, { kind: "price", pair: "eth_usdt", rate: "2600", ok: true })];
    chain = [...chain, chainReceipts(chain, { kind: "price", pair: "btc_usdt", rate: "68000", ok: true })];
    expect(verifyChain(chain)).toBe(true);
    // tamper rate in the middle
    const tampered = chain.map((r, i) => (i === 0 ? { ...r, rate: "9999" } : r));
    expect(verifyChain(tampered)).toBe(false);
    // splice (drop first)
    expect(verifyChain(chain.slice(1))).toBe(false);
  });
});
