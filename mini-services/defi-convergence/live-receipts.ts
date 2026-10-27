// ============================================================================
// live-receipts.ts — canonical validator for the SAOS-EXECUTION-LEDGER/1
// LIVE-RECEIPTS section (`liveReceipts`, landed by G78-e, wave G78 lane e).
//
// Directive (owner §3): the execution ledger exposes verified on-chain metrics
// and live transaction receipts LINE-BY-LINE. Every receipt row must carry a
// proof-ref (txid / orderid / seq+hash / sha256-of-line) and a measured source;
// anything without a proof is not a receipt (fail-honest, zero fabricated rows).
//
// Zero dependencies (like execution-accessor.ts). Injected clocks — no sleeps,
// no network, deterministic.
// ============================================================================

export const LIVE_RECEIPTS_SCHEMA = "SAOS-EXECUTION-LEDGER-LIVE-RECEIPTS/1" as const;
export const DEFAULT_RECEIPTS_STALE_AFTER_HOURS = 48;

export interface LiveReceiptRow {
  at: string; // ISO-8601 instant of the measured event
  kind: string; // dot-namespaced kind, e.g. "saos-dex.curation.vote-batch"
  actor: string; // account/actor that performed the op
  resource: string; // what the op acted on
  amount: string; // amount/op payload (measured, never rounded up)
  proofRef: string; // txid | orderid | seq+hash | sha256-of-line — REQUIRED
  outcome: string; // measured outcome (ok / denied / honest verdict)
  source: string; // where the row was measured from
}

export interface LiveReceiptsSection {
  schema: string;
  at: string;
  generator: string;
  law: string;
  receipts: LiveReceiptRow[];
  countsByKind?: Record<string, number>;
  totalReceipts?: number;
  probes?: unknown;
  sources?: unknown;
  gaps?: unknown[];
  [k: string]: unknown;
}

export interface ReceiptsVerdict {
  valid: boolean;
  reason?: string;
  rowsChecked?: number;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const REQUIRED_ROW_FIELDS = ["at", "kind", "actor", "resource", "amount", "proofRef", "outcome", "source"] as const;

function str(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Validate one receipt row: all 8 measured fields present, `at` ISO, proof present. */
export function validateReceiptRow(row: unknown): ReceiptsVerdict {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return { valid: false, reason: "receipt row must be an object" };
  }
  const r = row as Record<string, unknown>;
  for (const key of REQUIRED_ROW_FIELDS) {
    if (!str(r[key])) return { valid: false, reason: `receipt row missing non-empty "${key}"` };
  }
  if (!ISO_RE.test(r.at as string) || Number.isNaN(Date.parse(r.at as string))) {
    return { valid: false, reason: "receipt row `at` must be an ISO-8601 instant" };
  }
  return { valid: true, rowsChecked: 1 };
}

/** Validate the whole `liveReceipts` section (schema, law, rows, counts parity). */
export function validateLiveReceipts(section: unknown): ReceiptsVerdict {
  if (section === null || typeof section !== "object" || Array.isArray(section)) {
    return { valid: false, reason: "liveReceipts must be an object" };
  }
  const s = section as LiveReceiptsSection;
  if (s.schema !== LIVE_RECEIPTS_SCHEMA) {
    return { valid: false, reason: `liveReceipts: expected schema ${LIVE_RECEIPTS_SCHEMA}, got ${JSON.stringify(s.schema)}` };
  }
  if (!str(s.at) || !ISO_RE.test(s.at) || Number.isNaN(Date.parse(s.at))) {
    return { valid: false, reason: "liveReceipts: `at` must be an ISO-8601 instant" };
  }
  if (!str(s.generator)) return { valid: false, reason: "liveReceipts: `generator` must be a non-empty string" };
  if (!Array.isArray(s.receipts)) return { valid: false, reason: "liveReceipts: `receipts` must be an array" };
  for (let i = 0; i < s.receipts.length; i++) {
    const v = validateReceiptRow(s.receipts[i]);
    if (!v.valid) return { valid: false, reason: `liveReceipts.receipts[${i}]: ${v.reason}` };
  }
  // counts parity — the summary must never drift from the rows (decoration law)
  if (s.countsByKind !== undefined) {
    const counted: Record<string, number> = {};
    for (const r of s.receipts) {
      const k = (r as LiveReceiptRow).kind;
      counted[k] = (counted[k] || 0) + 1;
    }
    const declared = s.countsByKind;
    for (const k of Object.keys(declared)) {
      if (declared[k] !== counted[k]) {
        return { valid: false, reason: `liveReceipts: countsByKind["${k}"]=${declared[k]} but receipts array holds ${counted[k]}` };
      }
    }
    for (const k of Object.keys(counted)) {
      if (!(k in declared)) {
        return { valid: false, reason: `liveReceipts: receipts array holds kind "${k}" missing from countsByKind` };
      }
    }
  }
  if (s.totalReceipts !== undefined && s.totalReceipts !== s.receipts.length) {
    return { valid: false, reason: `liveReceipts: totalReceipts=${s.totalReceipts} but receipts array holds ${s.receipts.length}` };
  }
  return { valid: true, rowsChecked: s.receipts.length };
}

/** Staleness law for the receipts section (48h, mirrors the ledger freshness law). */
export function receiptsStaleAfterHours(section: LiveReceiptsSection): number {
  const h = (section as { staleness?: { staleAfterHours?: unknown } }).staleness?.staleAfterHours;
  return typeof h === "number" && Number.isFinite(h) && h >= 0 ? h : DEFAULT_RECEIPTS_STALE_AFTER_HOURS;
}

export function isStaleReceipts(section: LiveReceiptsSection, nowMs: number): boolean {
  const atMs = Date.parse(section.at);
  if (Number.isNaN(atMs)) return true;
  return nowMs - atMs >= receiptsStaleAfterHours(section) * 3600_000;
}

/** Read + validate the liveReceipts section of a ledger document (fail-honest). */
export function readLiveReceipts(doc: unknown, nowMs: number = Date.now()): ReceiptsVerdict & { section: LiveReceiptsSection | null } {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { valid: false, reason: "ledger document must be an object", section: null };
  }
  const section = (doc as Record<string, unknown>).liveReceipts;
  if (section === undefined) {
    return { valid: false, reason: "ledger carries no liveReceipts section (pre-G78-e ledger)", section: null };
  }
  const v = validateLiveReceipts(section);
  if (!v.valid) return { ...v, section: null };
  const s = section as LiveReceiptsSection;
  if (isStaleReceipts(s, nowMs)) {
    return { valid: false, reason: `liveReceipts.at ${s.at} is older than ${receiptsStaleAfterHours(s)}h — re-harvest required`, section: s };
  }
  return { valid: true, rowsChecked: s.receipts.length, section: s };
}
