// claims-triage — the autonomy that receives the claims (owner mandate: claims to
// the operator must be ROUTED TO AUTONOMY, and the autonomy must decide, check,
// and be certain). Deterministic rules first; every decision lands in the ledger;
// escalation to a human is the LAST resort and deduped per signature.

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';

const OWNER = 'roshpinacare-sys';
const HOME = process.cwd();
const CLAIMS = `${HOME}/ops/claims`;
const DECISIONS = `${HOME}/ops/decisions.jsonl`;
const TOKEN = process.env.SOVEREIGN_PAT || process.env.GITHUB_TOKEN; // cross-repo powers ride the sealed org PAT when present
const CROSS_OK = !!process.env.SOVEREIGN_PAT;
const API = 'https://api.github.com';
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local';
const stamp = new Date().toISOString();

async function gh(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'claims-triage', 'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`gh ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function decide(c) { // the decision ladder — deterministic, evidence-based
  const freq = c.evidence?.runsInWindow ?? 0;
  // R1: recently resolved — close it
  if (c.status === 'resolved') return { action: 'none', reason: 'already resolved by selfscan evidence' };
  // R2: failing on a HIGH-FREQUENCY schedule (>=12 runs in scan window ≈ every ~2h)
  //     and persistent — quarantine: the storm must not continue. Low-frequency
  //     jobs (dailies/weeklies) are NEVER quarantined — they escalate instead.
  if (c.kind === 'failing' && (c.attempts ?? 0) >= 2 && freq >= 12) return { action: 'quarantine', reason: `failing on schedule (${freq} runs in window), ${c.attempts} unchanged observations — disabling schedule; fix lands via claim resolution, not email pressure` };
  // R3: failing but young — one auto-fix attempt: re-dispatch the workflow (transient runners do heal)
  if (c.kind === 'failing') return { action: 'redispatch', reason: 'young failure — one self-heal attempt before quarantine' };
  // R4: stale beat — re-ignite via dispatch; escalate after 3 dead attempts
  if (c.kind === 'stale' && (c.attempts ?? 0) < 3) return { action: 'redispatch', reason: `stale beat, ignite attempt ${(c.attempts ?? 0) + 1}/3` };
  if (c.kind === 'stale') return { action: 'escalate', reason: 'beat dead after 3 ignitions — operator or code-fix needed' };
  // fill-reject: the validator network REFUSED to sign — the enforcement already
  // happened (refuse-to-sign is the PolicyAVS semantic). The operator notice is the
  // receipt of the refusal, not a request for help.
  if (c.kind === 'fill-reject') return { action: 'escalate', reason: 'validator refused to sign (refuse-to-sign is the enforcement; this notice is the receipt)' };
  return { action: 'escalate', reason: 'unknown claim shape' };
}

// claims come in several shapes: repo-scoped (repo+workflow), corridor-scoped
// (ref), etc. Render the subject honestly whatever shape arrived.
function subjectLabel(c) {
  if (c.repo && c.workflow) return `${c.repo}/${c.workflow}`;
  if (c.ref) return `${c.kind || 'claim'} ${c.ref}`;
  return c.kind || 'claim';
}

mkdirSync(CLAIMS, { recursive: true });
const files = existsSync(CLAIMS) ? readdirSync(CLAIMS).filter(f => f.startsWith('claim-') && f.endsWith('.json')) : [];
let acted = 0, quarantined = 0, escalated = 0, healed = 0, closedIssues = 0;

async function findIssue(sig) { // the ONE deduped issue for this signature, if open
  const q = encodeURIComponent(`repo:${OWNER}/FleetHQ is:issue is:open "sig:${sig}" in:body`);
  const found = await gh(`/search/issues?q=${q}`);
  return (found.items && found.items[0]) || null;
}
async function openIssue(title, body, labels) {
  await gh(`/repos/${OWNER}/FleetHQ/issues`, { method: 'POST', body: JSON.stringify({ title, body, labels }) });
  escalated++;
}

// ISSUE LIFECYCLE — the anti-storm law's closing bracket: when selfscan resolved
// a claim with evidence, the operator's issue closes WITH the evidence. An open
// issue whose problem is gone is noise, and noise is a storm in slow motion.
for (const f of files) {
  let c;
  try { c = JSON.parse(readFileSync(`${CLAIMS}/${f}`, 'utf8')); } catch { continue; }
  if (c.status === 'resolved' && !c.issueClosed) {
    try {
      const iss = await findIssue(c.sig);
      if (iss) {
        await gh(`/repos/${OWNER}/FleetHQ/issues/${iss.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `RESOLVED with evidence: ${JSON.stringify(c.resolveEvidence || {})}. Closing — the red lives on in the ledger history, not in an open issue.` }) });
        await gh(`/repos/${OWNER}/FleetHQ/issues/${iss.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
        closedIssues++;
      }
      c.issueClosed = stamp;
      writeFileSync(`${CLAIMS}/${f}`, JSON.stringify(c, null, 2));
      appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, claim: `${c.repo}/${c.workflow}`, action: 'close-issue', issue: iss?.number ?? 'none-found', evidence: c.resolveEvidence ?? null }) + '\n');
      acted++;
    } catch (e) {
      appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, action: 'error', error: String(e.message).slice(0, 120) }) + '\n');
    }
  }
}

for (const f of files) {
  let c;
  try { c = JSON.parse(readFileSync(`${CLAIMS}/${f}`, 'utf8')); } catch { continue; }
  if (c.status !== 'open') continue;
  const d = decide(c);

  try {
    const ownRepo = c.repo === 'FleetHQ';
    if (!ownRepo && !CROSS_OK) {
      // named terminal — honest, not an error storm: the cross-repo powers need the
      // sealed SOVEREIGN_PAT secret on FleetHQ. The claim stays open and re-decides
      // every triage flight once the secret lands.
      appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, claim: `${c.repo}/${c.workflow}`, action: 'awaiting-credential', reason: 'cross-repo autonomy needs SOVEREIGN_PAT secret on FleetHQ (sealed by owner PAT)' }) + '\n');
      c.lastAction = { action: 'awaiting-credential', at: stamp, runUrl: RUN_URL };
      writeFileSync(`${CLAIMS}/${f}`, JSON.stringify(c, null, 2));
      continue;
    }
    if (d.action === 'redispatch') {
      await gh(`/repos/${OWNER}/${c.repo}/actions/workflows/${c.workflowId}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
      c.attempts = (c.attempts ?? 0) + 1; healed++;
    }
    if (d.action === 'quarantine') {
      await gh(`/repos/${OWNER}/${c.repo}/actions/workflows/${c.workflowId}/disable`, { method: 'PUT' });
      c.status = 'quarantined'; c.quarantinedAt = stamp; c.quarantineReason = d.reason; quarantined++;
      const iss = await findIssue(c.sig);
      if (!iss) {
        await openIssue(`[QUARANTINE] ${c.repo}/${c.workflow} disabled-schedule — needs fix + re-enable`, [
          `signature: \`sig:${c.sig}\``, `reason: ${d.reason}`, `evidence: ${c.evidence?.runUrl}`, '',
          'To re-enable after the fix: Actions tab → the workflow → Enable, or dispatch `claims-triage` with REENABLE claim.',
          'The ledger (ops/decisions.jsonl) and network/STATE.md keep the RED visible — nothing is hidden.'].join('\n'),
          ['operator-needed', 'quarantined']);
      }
    }
    if (d.action === 'escalate') {
      c.status = 'needs-operator'; c.escalatedAt = stamp;
      const iss = await findIssue(c.sig);
      if (!iss) await openIssue(`[NEEDS-OPERATOR] ${subjectLabel(c)} — ${d.reason}`, `signature: \`sig:${c.sig}\`\nevidence: ${c.evidence?.runUrl || c.runUrl || 'n/a'}`, ['operator-needed']);
    }
    c.lastAction = { action: d.action, reason: d.reason, at: stamp, runUrl: RUN_URL };
    writeFileSync(`${CLAIMS}/${f}`, JSON.stringify(c, null, 2));
    appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, claim: `${c.repo}/${c.workflow}`, action: d.action, reason: d.reason, evidence: RUN_URL }) + '\n');
    acted++;
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('-> 422')) {
      // named terminal: this workflow cannot be dispatched (no workflow_dispatch
      // trigger / disabled). Self-heal by redispatch is IMPOSSIBLE here — an
      // infinite retry loop would be noise. Escalate once, deduped.
      c.status = 'needs-operator'; c.escalatedAt = stamp; escalated++;
      try {
        const iss = await findIssue(c.sig);
        if (!iss) await openIssue(`[NEEDS-OPERATOR] ${subjectLabel(c)} — not dispatchable (422): self-heal impossible`, `signature: \`sig:${c.sig}\`\nreason: workflow has no workflow_dispatch trigger or is disabled — needs a code fix or schedule-based recovery\nevidence: ${c.evidence?.runUrl || c.runUrl || 'n/a'}`, ['operator-needed']);
      } catch { /* issue path failing — the ledger line below stays loud */ }
      c.lastAction = { action: 'escalate', reason: 'not dispatchable (422)', at: stamp, runUrl: RUN_URL };
      writeFileSync(`${CLAIMS}/${f}`, JSON.stringify(c, null, 2));
      appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, claim: `${c.repo}/${c.workflow}`, action: 'escalate', reason: 'not dispatchable (422) — self-heal impossible' }) + '\n');
      acted++;
    } else {
      appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, action: 'error', error: msg.slice(0, 120) }) + '\n');
    }
  }
}

console.log(`triage done: claims=${files.length} acted=${acted} healed=${healed} quarantined=${quarantined} escalated=${escalated} issuesClosed=${closedIssues}`);
process.exit(0); // the triage duty is done — loud in the ledger, quiet in the inbox
