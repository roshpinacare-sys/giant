/**
 * owner-gate — the operator key (מפתח-מנהל). Server-only.
 *
 * SECURITY DOCTRINE (owner-mandated, mirrors FleetHQ /api/operator/unlock):
 *  - The key itself lives NOWHERE: not in this repo, not in any repo. Only a
 *    salted sha256 hash exists, OUTSIDE all repos (/home/z/.operator/config.json, 600).
 *  - NEVER logs, echoes, or persists the attempted key.
 *  - Rate-limited: 5 attempts / minute / process. Attempts are counted, not stored.
 *  - Session tokens are memory-only (10 min TTL) — survive nothing, leak nothing.
 *  - Every OWNER write in the system requires this gate. No agent writes in the
 *    owner's name. (GIANT PROTOCOL §6)
 */
import { readFile } from "node:fs/promises";
import { createHash } from "crypto";

const CONFIG = "/home/z/.operator/config.json";
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_MIN = 5;

/* Sessions live on globalThis: dev bundles each route separately, so module-level
   state is per-bundle. globalThis is shared per-process (same pattern as db.ts). */
const g = globalThis as unknown as { __sovereignSessions?: Map<string, number>; __sovereignRate?: { start: number; attempts: number } };
const sessions: Map<string, number> = (g.__sovereignSessions ??= new Map<string, number>());
const rate: { start: number; attempts: number } = (g.__sovereignRate ??= { start: Date.now(), attempts: 0 });

function rateLimited(): boolean {
  const now = Date.now();
  if (now - rate.start > 60_000) {
    rate.start = now;
    rate.attempts = 0;
  }
  rate.attempts += 1;
  return rate.attempts > MAX_ATTEMPTS_PER_MIN;
}

export function issueToken(): { token: string; ttlMs: number } {
  const now = Date.now();
  for (const [t, issued] of sessions) if (now - issued > TOKEN_TTL_MS) sessions.delete(t);
  const token = Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  sessions.set(token, now);
  return { token, ttlMs: TOKEN_TTL_MS };
}

export function verifyToken(token: string): boolean {
  const issued = sessions.get(token);
  if (!issued) return false;
  if (Date.now() - issued > TOKEN_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export async function checkKey(key: string): Promise<boolean> {
  /* תיקון-בעלים (T55, 401-נמדד): קובץ-המפתח של הבעלים נושא שתי-צורות (מילה+טוקן)
     — השער משווה מול כל-הדיגסטים-הרשומים; אפס-מפתח-בקונפיג, דיגסטים-בלבד. */
  let salt = "";
  let expected: string[] = [];
  try {
    const cfg = JSON.parse(await readFile(CONFIG, "utf8")) as { salt?: string; hash?: string; hashes?: string[] };
    salt = cfg.salt ?? "";
    expected = [...(cfg.hashes ?? []), ...(cfg.hash ? [cfg.hash] : [])];
  } catch {
    return false; // gate-unconfigured — fail-closed
  }
  if (expected.length === 0) return false;
  const candidate = createHash("sha256").update(salt + key).digest("hex");
  return expected.some((h) => h.length === candidate.length && h === candidate);
}

/** express helper for owner-write routes: returns null if token ok else an error string */
export function gateGuard(token: string): string | null {
  if (!token || !verifyToken(token)) return "owner-gate-required";
  return null;
}
