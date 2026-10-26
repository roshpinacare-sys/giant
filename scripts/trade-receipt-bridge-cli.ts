/**
 * trade-receipt-bridge-cli.ts — G76-Q · thin executor for the §7 bridge.
 *
 * ALL decisions live in the tested core (src/lib/sovereign/trade-receipt-bridge.ts);
 * this file only parses stdin, dispatches, and prints verdict-only JSON.
 * Contracts (mirror of quality-gate-cli):
 *   { mode: "bridge", rows: [...], at: "<iso>", prevHash: "<hex>"|null, rejected?: [...] }
 *     → { batch, receipt }
 *   { mode: "verify", receipts: [...] }           → verifyReceiptChain result
 *   { mode: "scan", rows: [...] }                 → { ops, verdicts, rejected }
 *   anything else / bad stdin                      → {"fatal": "..."} (fail-closed, exit 0 by contract)
 */
import {
  bridgeBatch,
  parseArmyRows,
  verifyReceiptChain,
  type ParsedArmyRow,
  type Rejection,
} from "../src/lib/sovereign/trade-receipt-bridge";

export function runBridgeCli(raw: string): string {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return JSON.stringify({ fatal: "stdin-not-json" });
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return JSON.stringify({ fatal: "stdin-not-object" });
  }
  const req = input as Record<string, unknown>;
  const mode = req.mode;

  if (mode === "scan") {
    if (!Array.isArray(req.rows)) return JSON.stringify({ fatal: "rows-not-array" });
    return JSON.stringify(parseArmyRows(req.rows));
  }

  if (mode === "verify") {
    if (!Array.isArray(req.receipts)) return JSON.stringify({ fatal: "receipts-not-array" });
    return JSON.stringify(verifyReceiptChain(req.receipts as never));
  }

  if (mode === "bridge") {
    if (!Array.isArray(req.rows)) return JSON.stringify({ fatal: "rows-not-array" });
    if (typeof req.at !== "string" || Number.isNaN(Date.parse(req.at))) {
      return JSON.stringify({ fatal: "at-not-iso" });
    }
    const prevHash = req.prevHash ?? null;
    if (prevHash !== null && (typeof prevHash !== "string" || prevHash.length < 8)) {
      return JSON.stringify({ fatal: "prevHash-malformed" });
    }
    const parsed = parseArmyRows(req.rows);
    const rows: ParsedArmyRow[] = [...parsed.ops, ...parsed.verdicts];
    const rejected: Rejection[] = Array.isArray(req.rejected)
      ? [...parsed.rejected, ...(req.rejected as Rejection[])]
      : parsed.rejected;
    const out = bridgeBatch(rows, { at: req.at, prevHash, rejected });
    return JSON.stringify(out);
  }

  return JSON.stringify({ fatal: "unknown-mode (bridge|verify|scan)" });
}

const isDirectRun = process.argv[1]?.includes("trade-receipt-bridge-cli");
if (isDirectRun) {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (c) => chunks.push(c as Buffer));
  process.stdin.on("end", () => {
    process.stdout.write(runBridgeCli(Buffer.concat(chunks).toString("utf8")));
  });
}
