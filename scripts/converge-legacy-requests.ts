/**
 * CONVERGENCE (one-time, T53): file the legacy Domain-book requests into the
 * canonical stream (Pulse/state/sovereign-channel/requests.jsonl) — in the
 * sovereignty's name, with linked evidence, exactly as SAOS-SOVEREIGN-CHANNEL/1
 * permits ("סוכנים מוסיפים רק ל-requests.jsonl בשם-הריבונות ועם ראיה מקושרת").
 * Idempotent: skips legacy ids already mirrored (matched by evidence marker).
 */
import { fileCanonicalRequest, readRequests, pushStreams } from "../src/lib/sovereign/channel";

async function main() {
  const { legacy, canonical } = await readRequests();
  const marker = "converged-from-Domain/T53";
  let filed = 0;

  for (const r of legacy) {
    const already = canonical.some((c) => (c.by ?? "").includes(marker) && c.need.includes(r.id));
    if (already) {
      console.log(`skip ${r.id} (already converged)`);
      continue;
    }
    const res = await fileCanonicalRequest({
      by: `sovereignty (legacy mirror · ${r.id} · converged-from-Domain/T53)`,
      need: `[${r.id} — מתכנס מספר-Domain]\n${r.need}`,
      evidence: [
        ...r.evidence,
        `origin book: Domain/agents/sovereign-requests.json · ${r.id}@${r.at}`,
        `SAOS-SOVEREIGN-CHANNEL/1: agents file requests in the sovereignty's name, with evidence`,
      ],
      deadline: r.deadline,
    });
    console.log(`${res.ok ? "filed" : "FAILED"} ${r.id} -> ${res.id} · push=${res.push?.pushed}/${res.push?.verified} ${res.push?.commit ?? res.error ?? ""}`);
    if (res.ok) filed++;
  }

  const final = await pushStreams(["state/sovereign-channel/requests.jsonl"], `convergence: legacy Domain requests filed to the canonical stream (T53) [skip ci]`);
  console.log(`final push: ${final.pushed}/${final.verified} ${final.commit ?? final.error}`);
  console.log(`filed=${filed}`);
}

main().catch((e) => {
  console.error("convergence failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
