// redact.ts — zero-plaintext-secrets log primitive (Thread 1, wave 19.79, directive §3/§7B).
//
// Key isolation law: private keys, seed phrases, tokens and credentials MUST NEVER exist
// as plaintext in memory surfaces that get logged. This primitive is the trunk-wide
// contract for log safety: anything whose KEY NAME looks sensitive (case-insensitive,
// substring match, any depth) is replaced with the fixed REDACTED_MARKER. Deterministic,
// cycle-safe, depth-guarded, never mutates its input.
export const REDACTED_MARKER = "[REDACTED]";
const CYCLE_MARKER = "[CYCLE]";
const TRUNCATED_MARKER = "[TRUNCATED]";

/** Sensitive-name matcher: contains-match, case-insensitive, fail-closed on blank keys. */
const SENSITIVE_KEY_RE =
  /(wif|token|secret|password|passwd|passphrase|private[_-]?key|seed|mnemonic|authorization|credential|api[_-]?key|session)/i;

export function isSensitiveKey(key: string): boolean {
  if (key.trim() === "") return true; // fail-closed: unnamed fields are treated as sensitive
  return SENSITIVE_KEY_RE.test(key);
}

/**
 * Deep-redact a value for safe logging.
 * - Sensitive keys (by name, any depth) → REDACTED_MARKER.
 * - Cycle references → CYCLE_MARKER (no stack blowup).
 * - Nesting beyond `maxDepth` → TRUNCATED_MARKER.
 * - Primitives pass through unchanged; the input object is never mutated.
 */
export function redactForLog(
  value: unknown,
  maxDepth: number = 8,
): unknown {
  return walk(value, 0, maxDepth, new Set());
}

function walk(value: unknown, depth: number, maxDepth: number, seen: Set<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= maxDepth) return TRUNCATED_MARKER;
  const obj = value as object;
  if (seen.has(obj)) return CYCLE_MARKER;

  if (Array.isArray(value)) {
    seen.add(obj);
    const out = value.map((v) => walk(v, depth + 1, maxDepth, seen));
    seen.delete(obj);
    return out;
  }

  seen.add(obj);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED_MARKER : walk(v, depth + 1, maxDepth, seen);
  }
  seen.delete(obj);
  return out;
}
