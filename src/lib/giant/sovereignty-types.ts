// T61 — Sovereignty contract: ONE payload that connects ALL git folders,
// the real agent fleet, the giants league, and the lessons of the past.
// Zero fabrication: every number comes from a real file or a real git command.
// T62 — adds `audit`: the fleet-audit receipt (FLEET-AUDIT.json) + a LIVE TCP dial probe.

import type { FleetAuditReceipt } from "@/lib/giant/audit-types";

export interface RepoInfo {
  name: string;              // e.g. "my-project"
  path: string;              // absolute path on machine
  role: string;              // honest one-liner (Hebrew)
  branch: string;            // current branch
  commitCount: number;       // rev-list --count HEAD
  dirtyCount: number;        // status --porcelain lines
  remote: string | null;     // origin URL with tokens REDACTED
  hasRemote: boolean;        // survives sandbox death?
  lastSha: string;           // short sha
  lastDate: string;          // ISO
  lastSubject: string;       // last commit subject
  wired: string[];           // view ids this repo actually feeds (grep-derived)
  wiredNote: string;         // honest note when wired is empty
}

export interface FleetNode {
  id: string;
  vis: string;               // "public" | "private" | unknown
  role: string;
  status: string;
  local: boolean;            // exists on this machine?
}

export interface FleetGraph {
  schema: string;
  updatedAt: string;
  summary: {
    nodes: number; edges: number; live: number;
    policy: number; armed: number; reposActive24h: string;
  };
  nodes: FleetNode[];
}

export interface AgentIdentity {
  agentId: string;
  source: string;            // which real file
  role: string;
  capabilities: string[];
  keyMode: string;
  alive: boolean | null;
}

export interface AgentSource {
  name: string;              // Hebrew label
  count: number;             // measured from file/scan
  path: string;              // source of truth
  real: boolean;             // false only for explicitly-labeled synthetic data (excluded from total)
  note?: string;
}

export interface AgentCensus {
  total: number;             // sum of REAL sources only
  identities: AgentIdentity[];
  sources: AgentSource[];
}

export interface GiantFamily {
  id: string; name: string; tier: string;
  fees24h: number; vol24h: number; feesAllTime: number;
}

export interface GiantsBook {
  publishedAt: string; runAt: string; method: string;
  families: GiantFamily[];   // top by vol24h, capped 14
  ours: { name: string; fees24h: number | null; vol24h: number | null; note: string } | null;
}

export interface Lesson {
  date: string;
  title: string;             // what failed / was learned
  what: string;              // honest description
  rule: string;              // the law now enforced
  source: string;            // file path proving it
}

export interface ArchaeologyEntry {
  task: string;              // "T51".."T61"
  summary: string;           // stage summary line
}

/** T62 — ביקורת-חיות-הצי: שתי-מישורי-מדידה (קבלת-הביקורת vs דיאל-TCP חי). */
export interface SovereigntyAudit {
  receipt: FleetAuditReceipt | null;       // read from /home/z/estate/Sandbox/proof/out/FLEET-AUDIT.json
  receiptSha16: string | null;             // receipt.sha16
  ports: { port: number; alive: boolean }[]; // LIVE TCP dial 127.0.0.1 · 800ms timeout (never overrides the receipt)
  receiptAgeMin: number | null;            // now - receipt.at
}

export interface SovereigntyPayload {
  ok: boolean;
  at: string;                // ISO
  sha16: string;             // truth-stream hash of the payload
  errors: string[];          // per-section failures, never swallowed
  repos: RepoInfo[];
  localRepoCount: number;
  fleet: FleetGraph | null;
  agents: AgentCensus;
  giants: GiantsBook | null;
  lessons: Lesson[];
  archaeology: ArchaeologyEntry[];
  survival: {
    committedRepos: number;
    dirtyRepos: string[];    // names with dirtyCount>0
    unpushed: string[];      // names with no remote
    verdict: string;         // Hebrew honest verdict
  };
  endpoints: { files: number; note: string };
  audit: SovereigntyAudit | null;          // T62 — fleet-audit receipt + live dial plane
}
