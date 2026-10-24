// doors.ts — canonical door-dispatch kernel (Thread 1, wave 19.79, directive §7A).
//
// giant = sole canonical registry. This module is THE single deterministic state machine
// for routing console traffic across the fleet's graded door ladder:
//   { 3040 · saos-engine · engine truth (GET-only whitelist) } → { 3100 } → { 3200 }
//
// Invariants (enforced here, proven in doors.test.ts):
//  1. Deterministic: same (method, segments) → deep-equal verdict, always.
//  2. Fail-closed: the engine domain NEVER accepts writes through the dispatch surface —
//     non-GET on engine truth paths and ANY access to governance verbs is SEALED
//     (verdict "fail-closed"), never forwarded downward. (The console bridge honours this
//     with honest 502s; this kernel is the canonical contract it must implement.)
//  3. Purity: no clock, no network, no RNG, no input mutation, deep-frozen table.
//  4. Zero dependencies beyond node:crypto (directive §11: established primitives only).
import { createHash } from "node:crypto";

/** A GET path that exposes engine truth (read-only, audited). 14 paths per the live bridge audit. */
export const ENGINE_WHITELIST: ReadonlySet<string> = Object.freeze(
  new Set([
    "health",
    "status",
    "live",
    "hyper",
    "payouts",
    "weave",
    "social",
    "fills",
    "exec-status",
    "fleet",
    "finance-digest",
    "yield",
    "army-grid",
    "cycle-status",
  ] as const),
);

/** Engine governance verbs — sealed at the dispatch surface regardless of method. */
export const ENGINE_DOMAIN_SEALED_PATHS: ReadonlySet<string> = Object.freeze(
  new Set([
    "redeploy",
    "cycle",
    "adopt-credential",
    "disperse",
  ] as const),
);

export interface EngineDoor {
  readonly port: 3040;
  readonly prefix: string;
  readonly engine: true;
  readonly whitelist: ReadonlySet<string>;
  readonly sealedPaths: ReadonlySet<string>;
}

export interface StaticDoor {
  readonly port: number;
  readonly prefix: string;
  readonly engine?: undefined;
}

export type Door = EngineDoor | StaticDoor;

/** The graded ladder. ORDER IS SEMANTIC: first match wins. Deep-frozen. */
export const DOORS: readonly Door[] = deepFreeze([
  deepFreeze({
    port: 3040,
    prefix: "",
    engine: true as const,
    whitelist: ENGINE_WHITELIST,
    sealedPaths: ENGINE_DOMAIN_SEALED_PATHS,
  } satisfies EngineDoor),
  deepFreeze({ port: 3100, prefix: "" } satisfies StaticDoor),
  deepFreeze({ port: 3200, prefix: "" } satisfies StaticDoor),
]);

export type DispatchVerdict =
  | { readonly verdict: "engine"; readonly port: 3040; readonly reason: "engine-truth-get" }
  | {
      readonly verdict: "fail-closed";
      readonly port: 3040;
      readonly reason: "engine-domain-method-not-allowed" | "engine-domain-path-sealed";
    }
  | { readonly verdict: "static"; readonly port: number; readonly reason: "static-first-match" };

/**
 * Resolve (method, path segments) against the canonical ladder.
 * - Engine domain = whitelist ∪ sealedPaths on the first segment.
 *   * GET on a whitelisted truth path → engine (3040).
 *   * Anything else in the engine domain → fail-closed (SEALED, not forwarded).
 * - Everything else falls through the static ladder in graded order (first match wins).
 * - Empty segments → first static door (never the engine).
 */
export function resolveDoor(method: string, segments: readonly string[]): DispatchVerdict {
  const first = segments[0];
  const engine = DOORS.find((d): d is EngineDoor => d.engine === true);

  if (engine && first !== undefined) {
    const inWhitelist = engine.whitelist.has(first);
    const inSealed = engine.sealedPaths.has(first);
    if (inWhitelist || inSealed) {
      if (method !== "GET") {
        return Object.freeze({
          verdict: "fail-closed",
          port: engine.port,
          reason: "engine-domain-method-not-allowed",
        });
      }
      if (inSealed) {
        return Object.freeze({
          verdict: "fail-closed",
          port: engine.port,
          reason: "engine-domain-path-sealed",
        });
      }
      return Object.freeze({ verdict: "engine", port: engine.port, reason: "engine-truth-get" });
    }
  }

  for (const d of DOORS) {
    if (d.engine === true) continue;
    return Object.freeze({ verdict: "static", port: d.port, reason: "static-first-match" });
  }
  // Unreachable by construction (static ladder is non-empty) — fail closed rather than guess.
  throw new Error("dispatch-ladder-empty");
}

/** Canonical, stable serialization of the dispatch table → SHA-256 content address. */
export function dispatchTableHash(): string {
  const engine = DOORS.find((d): d is EngineDoor => d.engine === true);
  const canon = DOORS.map(
    (d) =>
      `${d.port}|${d.prefix}|${d.engine ? 1 : 0}|${
        engine && d === engine ? [...engine.whitelist].sort().join(",") : ""
      }|${engine && d === engine ? [...engine.sealedPaths].sort().join(",") : ""}`,
  ).join(";");
  return sha256Hex(canon);
}

function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object") {
    for (const v of Object.values(x as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
