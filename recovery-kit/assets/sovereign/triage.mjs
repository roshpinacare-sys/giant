// claims-triage — the autonomy that receives the claims (owner mandate: claims to
// the operator must be ROUTED TO AUTONOMY, and the autonomy must decide, check,
// and be certain). Deterministic rules first; every decision lands in the ledger;
// escalation to a human is the LAST resort and deduped per signature.

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';

const OWNER = 'roshpinacare-sys';
const HOME = process.cwd();
const CLAIMS = `${HOME}/ops/claims`;
const DECISIONS = `${HOME}/ops/decisions.jsonl`;
const TOKEN = process.env.GITHUB_TOKEN;
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
  return { action: 'escalate', reason: 'unknown claim shape' };
}

mkdirSync(CLAIMS, { recursive: true });
const files = existsSync(CLAIMS) ? readdirSync(CLAIMS).filter(f => f.startsWith('claim-') && f.endsWith('.json')) : [];
let acted = 0, quarantined = 0, escalated = 0, healed = 0;

for (const f of files) {
  let c;
  try { c = JSON.parse(readFileSync(`${CLAIMS}/${f}`, 'utf8')); } catch { continue; }
  if (c.status !== 'open') continue;
  const d = decide(c);

  try {
    if (d.action === 'redispatch') {
      await gh(`/repos/${OWNER}/${c.repo}/actions/workflows/${c.workflowId}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
      c.attempts = (c.attempts ?? 0) + 1; healed++;
    }
    if (d.action === 'quarantine') {
      await gh(`/repos/${OWNER}/${c.repo}/actions/workflows/${c.workflowId}/disable`, { method: 'PUT' });
      c.status = 'quarantined'; c.quarantinedAt = stamp; c.quarantineReason = d.reason; quarantined++;
      // the ONE escalation for this signature: a deduped issue (search before open)
      const q = encodeURIComponent(`repo:${OWNER}/FleetHQ is:issue is:open "sig:${c.sig}" in:body`);
      const found = await gh(`/search/issues?q=${q}`);
      if ((found.total_count ?? 0) === 0) {
        await gh(`/repos/${OWNER}/FleetHQ/issues`, {
          method: 'POST',
          body: JSON.stringify({
            title: `[QUARANTINE] ${c.repo}/${c.workflow} disabled-schedule — needs fix + re-enable`,
            body: [`signature: \`sig:${c.sig}\``, `reason: ${d.reason}`, `evidence: ${c.evidence?.runUrl}`, '',
              'To re-enable after the fix: Actions tab → the workflow → Enable, or dispatch `claims-triage` with REENABLE claim.',
              'The ledger (ops/decisions.jsonl) and network/STATE.md keep the RED visible — nothing is hidden.'].join('\n'),
            labels: ['operator-needed', 'quarantined'],
          }),
        });
        escalated++;
      }
    }
    if (d.action === 'escalate') {
      c.status = 'needs-operator'; c.escalatedAt = stamp; escalated++;
      const q = encodeURIComponent(`repo:${OWNER}/FleetHQ is:issue is:open "sig:${c.sig}" in:body`);
      const found = await gh(`/search/issues?q=${q}`);
      if ((found.total_count ?? 0) === 0) {
        await gh(`/repos/${OWNER}/FleetHQ/issues`, {
          method: 'POST',
          body: JSON.stringify({ title: `[NEEDS-OPERATOR] ${c.repo}/${c.workflow} — ${d.reason}`, body: `signature: \`sig:${c.sig}\`\nevidence: ${c.evidence?.runUrl}`, labels: ['operator-needed'] }),
        });
      }
    }
    c.lastAction = { action: d.action, reason: d.reason, at: stamp, runUrl: RUN_URL };
    writeFileSync(`${CLAIMS}/${f}`, JSON.stringify(c, null, 2));
    appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, claim: `${c.repo}/${c.workflow}`, action: d.action, reason: d.reason, evidence: RUN_URL }) + '\n');
    acted++;
  } catch (e) {
    appendFileSync(DECISIONS, JSON.stringify({ at: stamp, actor: 'claims-triage', sig: c.sig, action: 'error', error: String(e.message).slice(0, 120) }) + '\n');
  }
}

console.log(`triage done: claims=${files.length} acted=${acted} healed=${healed} quarantined=${quarantined} escalated=${escalated}`);
process.exit(0); // the triage duty is done — loud in the ledger, quiet in the inbox
