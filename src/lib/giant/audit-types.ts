// T62 — Fleet audit receipt contract.
// Mirrors the REAL receipt on disk: /home/z/estate/Sandbox/proof/out/FLEET-AUDIT.json
// (schema fleet-audit/1, written by the main-desk fleet audit; the file is the truth).
// Zero fabrication: the UI renders only what this receipt records.

export interface FleetAuditReceipt {
  schema: string;            // "fleet-audit/1"
  at: string;                // ISO — when the audit ran
  probe: string;             // honest method line ("real — git ls-remote/fetch/ff …")
  ownerMandate: string;      // the owner's order that triggered the audit
  liveServices: {
    name: string;
    port: number;
    alive: boolean;
    evidence: string;        // how aliveness was measured at audit time
  }[];
  remotePlane: {
    doctrine: string;        // Hebrew doctrine line
    beats: {
      repo: string;
      remoteLast: string;    // ISO — last remote beat
      aheadBefore: number;   // delta measured before the ff-sync
      subject: string;
    }[];
    externalLoopVerdict: string;
  };
  treatment: string[];       // what was actually done (ff-syncs, stale discard)
  siblingGiants: {
    evidence: string;
    waves: { wave: number; subject: string }[];
    verdict: string;
  };
  localFreshnessAfterSync: Record<string, number | null>; // minutes; null = not measured
  unprobable: {
    count: number;
    note: string;
    law: string;             // zero-fabrication backbone
  };
  verdict: string;
  auditFix?: string;         // present in the real receipt (in-place correction note)
  sha16: string;             // receipt self-hash, 16 hex
}
