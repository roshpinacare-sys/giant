/**
 * truth.ts — organ probes (§1 command plane). Loopback-only, timeouted,
 * fail-honest: a dead organ is a FACT, never an exception.
 * The commander NEVER imports organ code — HTTP probes and file reads only.
 */
export interface OrganSpec { organ: string; port: number; path: string; }

/** The sovereign organ census (loopback ports measured live 2026-10-24). */
export const ORGANS: OrganSpec[] = [
  { organ: "dex-node", port: 3010, path: "/saos-dex/api/dex/state" },
  { organ: "soldier-army", port: 3018, path: "/" },
  { organ: "dex-economy-bridge", port: 3017, path: "/" },
  { organ: "issue-forge", port: 3046, path: "/health" },
  { organ: "sovereign-audit", port: 3022, path: "/" },
  { organ: "economy-engine", port: 3016, path: "/" },
];

/** Ports owned by other hosts — wrong-owner detection (measured: gates-host
 * squats 3046, the forge's directive-hardcoded port). */
const WRONG_OWNERS: Record<number, string> = { 3046: "local-gates-host" };

export type ProbeFn = (spec: OrganSpec) => Promise<{ alive: boolean; detail: string; body?: unknown }>;

export interface OrganProbe {
  organ: string; port: number;
  alive: boolean; wrongOwner: boolean;
  detail: string; latencyMs: number;
}
export interface Truth {
  organs: OrganProbe[];
  feedClaimable: number;
  giantBehind: number;
  at: string;
  /** organs whose probe layer itself crashed (bug-class, not dead-port) */
  probeErrors: string[];
  /** ms since the forge's last completed cycle (undefined = unknown) */
  forgeIdleMs?: number;
}

export interface TruthIo {
  probe: ProbeFn;
  readFeed: () => number;
  gitBehind: () => number;
  organs?: OrganSpec[];
}

export async function probeTruth(io: TruthIo): Promise<Truth> {
  const specs = io.organs ?? ORGANS;
  const organs: OrganProbe[] = [];
  const probeErrors: string[] = [];
  let forgeIdleMs: number | undefined = undefined;
  for (const spec of specs) {
    const t0 = Date.now();
    try {
      const r = await io.probe(spec);
      if (spec.organ === "issue-forge") {
        const lc = (r.body as { lastCycle?: { at?: string } } | undefined)?.lastCycle?.at;
        if (typeof lc === "string") {
          const at = Date.parse(lc);
          if (!Number.isNaN(at)) forgeIdleMs = Math.max(0, Date.now() - at);
        }
      }
      const owner = WRONG_OWNERS[spec.port];
      const host = (r.body as { host?: string } | undefined)?.host;
      organs.push({
        organ: spec.organ, port: spec.port,
        alive: r.alive,
        wrongOwner: Boolean(r.alive && owner && host === owner),
        detail: r.detail,
        latencyMs: Date.now() - t0,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      probeErrors.push(`${spec.organ}: ${msg.slice(0, 80)}`);
      organs.push({
        organ: spec.organ, port: spec.port,
        alive: false, wrongOwner: false,
        detail: msg,
        latencyMs: Date.now() - t0,
      });
    }
  }
  return { organs, feedClaimable: io.readFeed(), giantBehind: io.gitBehind(), at: new Date().toISOString(), probeErrors, forgeIdleMs };
}
