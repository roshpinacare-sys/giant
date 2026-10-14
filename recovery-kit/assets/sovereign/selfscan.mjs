// sovereign-selfscan — the network's self-awareness organ (keyless, GITHUB_TOKEN only).
// Law: a scheduled scanner's duty is to MEASURE AND RECORD. It exits 0 when the
// measurement duty is done, even if the world is RED — the RED lives in the book,
// the claims, and (once per new signature) in an issue. Never in per-run emails.
// Owner mandate trace 1a1374da43d52c39: the network must know itself, detect new
// capabilities the operator adds, and route claims to autonomy — not to a storm.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const OWNER = 'roshpinacare-sys';
const REPOS = ['FleetHQ', 'Domain', 'Console', 'saos-runtime', 'Autonomy', 'sovereign-lighthouse'];
const HOME = process.cwd(); // FleetHQ checkout root
const NETDIR = `${HOME}/network`;
const CLAIMS = `${HOME}/ops/claims`;
const DECISIONS = `${HOME}/ops/decisions.jsonl`;
const TOKEN = process.env.GITHUB_TOKEN;
const API = 'https://api.github.com';
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : 'local';

const now = Date.now();
const stamp = new Date(now).toISOString();

// staleness budgets per repo, minutes: newer than this = fresh
const FRESH_BUDGET_MIN = { FleetHQ: 360, Domain: 180, Console: 180, 'saos-runtime': 180, Autonomy: 180, 'sovereign-lighthouse': 720 };

function sig8(s) { // stable 8-hex signature from a string (no crypto import needed for dedupe purposes)
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

async function gh(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sovereign-selfscan',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`gh ${path} -> ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

mkdirSync(NETDIR, { recursive: true });
mkdirSync(CLAIMS, { recursive: true });

const prev = existsSync(`${NETDIR}/STATE.json`) ? JSON.parse(readFileSync(`${NETDIR}/STATE.json`, 'utf8')) : { repos: {}, workflows: {} };
const claimsSeen = new Map();
for (const f of existsSync(CLAIMS) ? readdirSync(CLAIMS) : []) {
  try { const c = JSON.parse(readFileSync(`${CLAIMS}/${f}`, 'utf8')); claimsSeen.set(c.sig, c); } catch { /* torn file — skip, rescan rewrites */ }
}

const state = { generatedAt: stamp, runUrl: RUN_URL, repos: {}, workflows: {}, newClaims: [], newCapabilities: [], counts: { green: 0, red: 0, disabled: 0, stale: 0, archived: 0 } };
// run names are unstable: push-event runs can carry the PATH as name while
// dispatch/schedule carry the display name. Normalize once, module-level.
const disp = (n) => String(n || '').replace(/^\.github\/workflows\//, '').replace(/\.ya?ml$/, '');
// ARCHIVED (2026-10-14, trace 1a137fbff7c7c4ad): a workflow whose file was deleted
// (state `deleted` / `deleted_inactivity`) can NEVER run again — its last failed run
// is archaeology, not a live problem. Counting it red forever made the book lie
// (measured: saos-runtime repair-rot2-custody red 1634m with state=deleted) and
// starved its claim of any resolution path. Honesty is re-homed, not deleted: the
// row stays visible with 🗄️, the count gets its own bucket, and an open claim
// resolves with evidence ("nothing left to heal").
const lines = [];
lines.push('# Network STATE — the sovereign self-scan');
lines.push('');
lines.push(`- generatedAt: \`${stamp}\``);
lines.push(`- scan run: ${RUN_URL}`);
lines.push('');
lines.push('| repo | last push | push age | workflows | green | red | disabled | archived |');
lines.push('|---|---|---|---|---|---|---|---|');

for (const repo of REPOS) {
  try {
    const info = await gh(`/repos/${OWNER}/${repo}`);
    const pushedAt = info.pushed_at;
    const pushAgeMin = Math.round((now - Date.parse(pushedAt)) / 60000);
    const budget = FRESH_BUDGET_MIN[repo] ?? 180;

    let runs = [];
    try {
      const p1 = (await gh(`/repos/${OWNER}/${repo}/actions/runs?per_page=100`)).workflow_runs || [];
      let p2 = [];
      try { p2 = (await gh(`/repos/${OWNER}/${repo}/actions/runs?per_page=100&page=2`)).workflow_runs || []; } catch { /* page 2 optional */ }
      runs = [...p1, ...p2];
    } catch (e) { lines.push(`| ${repo} | \`${pushedAt}\` | ${pushAgeMin}m | runs-api-error: ${String(e.message).slice(0, 40)} | | | |`); continue; }
    const runsInWindow = new Map();
    for (const r of runs) runsInWindow.set(disp(r.name), (runsInWindow.get(disp(r.name)) || 0) + 1);

    // Judged run per WORKFLOW (keyed by workflow_id — run names are unstable:
    // push-event runs can carry the PATH as name while dispatch/schedule carry the
    // display name; keyed by name, one workflow became two rows and a dead push
    // ghost out-voted two newer successes — measured: Autonomy selfhood red 63m
    // while its last two runs succeeded). Judgement prefers the newest run whose
    // conclusion is not 'cancelled' — a cancel means a sibling superseded the run
    // (concurrency), it is NOT evidence of failure (measured: saos-runtime
    // grid-watchdog cancelled while a dispatch success landed 6m earlier).
    const byWf = new Map(); // workflow_id -> { best (newest non-cancelled), newest }
    for (const r of runs) {
      const k = String(r.workflow_id || disp(r.name));
      const e = byWf.get(k) || { best: null, newest: null };
      if (!e.newest || Date.parse(r.created_at) > Date.parse(e.newest.created_at)) e.newest = r;
      if ((r.conclusion || '') !== 'cancelled' && (!e.best || Date.parse(r.created_at) > Date.parse(e.best.created_at))) e.best = r;
      byWf.set(k, e);
    }
    const latest = new Map();
    for (const [k, e] of byWf) latest.set(k, e.best || e.newest);

    let g = 0, red = 0, dis = 0, stale = 0, arch = 0;
    const wfRows = [];
    for (const [, r] of latest) {
      const name = disp(r.name); // stable display name regardless of the run's event
      const ageMin = Math.round((now - Date.parse(r.created_at)) / 60000);
      const wfMeta = await (async () => {
        try { return await gh(`/repos/${OWNER}/${repo}/actions/workflows/${r.workflow_id}`); } catch { return { state: 'unknown' }; }
      })();
      const wstate = wfMeta.state || 'active';
      const key = `${repo}|${name}`;
      const archived = wstate === 'deleted' || wstate === 'deleted_inactivity';
      const failing = r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'skipped' && !archived && wstate !== 'disabled_manually' && wstate !== 'disabled_inactivity';
      // cadence-aware staleness: a scheduled beat silent 48h is effectively dead
      // (worldbeat would never be); low-frequency jobs (weekly retros) are never
      // "stale" — their runsInWindow count protects them from false quarantine.
      const isStale = ageMin > 2880;

      if (wstate === 'disabled_manually') { dis++; state.counts.disabled++; }
      else if (archived) { arch++; state.counts.archived++; }
      else if (failing) { red++; state.counts.red++; }
      else if (isStale) { stale++; state.counts.stale++; }
      else { g++; state.counts.green++; }

      // claims: NEW failing signature, or NEW staleness signature (deduped by sig, re-armed after resolve)
      if ((failing || isStale) && wstate !== 'disabled_manually') {
        const kind = failing ? 'failing' : 'stale';
        const sig = sig8(`${kind}|${repo}|${name}|${r.conclusion || 'no-runs'}`);
        const prior = claimsSeen.get(sig);
        const resolved = prior && prior.status === 'resolved' && prior.lastConcl !== (r.conclusion || 'no-runs');
        if (!prior || resolved) {
          const claim = {
            sig, kind, repo, workflow: name, workflowId: r.workflow_id,
            firstSeenAt: prior?.firstSeenAt || stamp, lastSeenAt: stamp,
            lastConcl: r.conclusion || 'no-runs', status: 'open',
            attempts: prior?.attempts || 0,
            evidence: { runUrl: r.html_url, conclusion: r.conclusion, ageMin, event: r.event, workflowState: wstate, runsInWindow: runsInWindow.get(name) || 0 },
            claimedBy: { runUrl: RUN_URL, at: stamp },
          };
          writeFileSync(`${CLAIMS}/claim-${sig}.json`, JSON.stringify(claim, null, 2));
          state.newClaims.push(sig);
        } else {
          prior.lastSeenAt = stamp; prior.lastConcl = r.conclusion || 'no-runs';
          writeFileSync(`${CLAIMS}/claim-${prior.sig}.json`, JSON.stringify(prior, null, 2));
        }
      } else if (!failing && !isStale) {
        // honest resolution: a claim whose subject is no longer failing resolves with
        // evidence — the scan saw it green (workflow recovered) or archived/deleted
        // (nothing left to heal). This includes escalated needs-operator claims: the
        // operator issue closes WITH the evidence via triage's lifecycle (anti-storm
        // law §2 — resolution closes the claim, the inbox stays clean). Moot
        // skill-repair proposals (harness) retire the same way.
        for (const [s, c] of claimsSeen) {
          if ((c.status === 'open' || c.status === 'needs-operator') && c.repo === repo && disp(c.workflow) === name && (c.kind === 'failing' || c.kind === 'skill-repair')) {
            c.status = 'resolved'; c.resolvedAt = stamp;
            c.resolveEvidence = { runUrl: r.html_url, conclusion: r.conclusion };
            if (archived) c.resolveEvidence.note = `workflow state=${wstate} (archived) at HEAD — the failure is archaeological, the file no longer exists, nothing left to heal`;
            else if (c.status === 'needs-operator' || c.kind === 'skill-repair') c.resolveEvidence.note = `subject workflow recovered — measured conclusion=${r.conclusion} at scan time; the escalation is retired by observation`;
            writeFileSync(`${CLAIMS}/claim-${s}.json`, JSON.stringify(c, null, 2));
          }
        }
      }

      const mark = wstate === 'disabled_manually' ? '⏸' : archived ? '🗄️' : failing ? '❌' : isStale ? '⏳' : '✅';
      wfRows.push(`| ${mark} ${name} | ${r.conclusion || '—'} | ${ageMin}m | ${wstate} |`);

      // NEW-CAPABILITY awareness: a workflow the owner added since the last scan
      // is an event the network must NOTICE (the owner's mandate: "the network is
      // not aware of the new things I build at all") — recorded, never alarmed.
      const wfKey = `${repo}|${name}`;
      state.workflows[wfKey] = { state: wstate, lastConcl: r.conclusion || '—', lastRun: r.created_at };
      if (prev.workflows && Object.keys(prev.workflows).length > 0 && !(wfKey in prev.workflows)) {
        const nsig = sig8(`new-capability|${repo}|${name}`);
        if (!claimsSeen.has(nsig)) {
          const nc = { sig: nsig, kind: 'new-capability', repo, workflow: name, firstSeenAt: stamp, status: 'noted', evidence: { runUrl: r.html_url, conclusion: r.conclusion } };
          writeFileSync(`${CLAIMS}/claim-${nsig}.json`, JSON.stringify(nc, null, 2));
          state.newCapabilities.push(nc);
        }
      }
    }

    lines.push(`| [${repo}](https://github.com/${OWNER}/${repo}) | \`${pushedAt}\` | ${pushAgeMin}m${pushAgeMin > budget ? ' ⚠️STALE' : ''} | ${latest.size} | ${g} | ${red} | ${dis} | ${arch} |`);
    lines.push('');
    if (wfRows.length) { lines.push(`<details><summary>${repo} workflow detail</summary>`, '', '| workflow | conclusion | age | state |', '|---|---|---|---|', ...wfRows, '', '</details>', ''); }

    state.repos[repo] = { pushedAt, pushAgeMin, fresh: pushAgeMin <= budget, workflows: latest.size, green: g, red, disabled: dis, stale, archived: arch };
  } catch (e) {
    lines.push(`| ${repo} | ERROR | — | ${String(e.message).slice(0, 60)} | | | | |`);
    state.repos[repo] = { error: String(e.message) };
  }
}

// OUT-OF-WINDOW CLAIM MEASUREMENT (2026-10-14): dispatch-only, quiet workflows
// (anchor-execute, operator-console…) have NO runs inside the ~200-run window —
// they never appear in the judged map above, so claims about them would linger
// forever. Absence in the window is NOT evidence either way, so we go LOOK at
// each such subject directly (bounded: one 3-run call per unresolved claim).
for (const [s, c] of claimsSeen) {
  try {
    if (c.status !== 'open' && c.status !== 'needs-operator') continue;
    if (c.kind !== 'failing' && c.kind !== 'skill-repair') continue;
    const dispName = disp(c.workflow);
    if (state.workflows[`${c.repo}|${dispName}`]) continue; // in-window — already judged above
    const wfRef = String(c.workflow || '').includes('/') ? c.workflow : `${dispName}.yml`;
    const res = await gh(`/repos/${OWNER}/${c.repo}/actions/workflows/${wfRef}/runs?per_page=3`).catch(() => null);
    if (!res || !Array.isArray(res.workflow_runs)) {
      // the workflow object itself is gone (deleted/archived) — nothing left to heal or repair
      c.status = 'resolved'; c.resolvedAt = stamp;
      c.resolveEvidence = { note: `subject workflow not found at HEAD (archived/deleted) — measured directly, out-of-window`, runUrl: c.runUrl || RUN_URL };
      writeFileSync(`${CLAIMS}/claim-${s}.json`, JSON.stringify(c, null, 2));
      continue;
    }
    const last = res.workflow_runs.find((r) => (r.conclusion || '') !== 'cancelled');
    if (!last) continue; // all cancelled — no signal; leave the claim as-is
    if (last.conclusion === 'success' || last.conclusion === 'skipped') {
      c.status = 'resolved'; c.resolvedAt = stamp;
      c.resolveEvidence = { runUrl: last.html_url, conclusion: last.conclusion, note: `subject measured GREEN outside the scan window (out-of-window direct check)` };
      writeFileSync(`${CLAIMS}/claim-${s}.json`, JSON.stringify(c, null, 2));
    }
    // still failing outside the window: leave the claim — the subject's own repo scan
    // will surface it in-window when runs accumulate (honesty never retired by silence)
  } catch { /* one claim's direct check failing must not kill the scan */ }
}

lines.push('');
lines.push(`## Totals — green ${state.counts.green} · red ${state.counts.red} · disabled(quarantined) ${state.counts.disabled} · stale ${state.counts.stale} · archived(deleted-file, never-runs-again) ${state.counts.archived}`);
lines.push('');
lines.push('This page is the network looking at itself. RED here is honesty, not alarm: every red has a claim in `ops/claims/`, triage decides, the operator gets ONE issue per new signature — never a storm.');
lines.push('');
lines.push(`Scan window: last ~200 runs per repo (high-frequency writers fill it fast; low-frequency jobs are protected by cadence-aware rules — 48h staleness + runsInWindow evidence).`);

writeFileSync(`${NETDIR}/STATE.md`, lines.join('\n'));
if (state.newCapabilities.length) {
  const ncLines = ['', '## NEW capabilities noticed this scan (the owner built — the network noticed)', ''];
  for (const nc of state.newCapabilities) ncLines.push(`- ${nc.repo}/${nc.workflow} — first seen ${nc.firstSeenAt}`);
  writeFileSync(`${NETDIR}/STATE.md`, lines.join('\n') + ncLines.join('\n') + '\n');
}
writeFileSync(`${NETDIR}/STATE.json`, JSON.stringify({ ...state, newClaims: state.newClaims }, null, 2));

// one issue per NEW signature batch, deduped by signature tag in the body
let opened = 0;
for (const sig of state.newClaims) {
  try {
    const c = JSON.parse(readFileSync(`${CLAIMS}/claim-${sig}.json`, 'utf8'));
    const tag = `sig:${sig}`;
    const q = encodeURIComponent(`repo:${OWNER}/FleetHQ is:issue is:open "${tag}" in:body`);
    const found = await gh(`/search/issues?q=${q}`);
    if ((found.total_count ?? 0) > 0) continue;
    await gh(`/repos/${OWNER}/FleetHQ/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[${c.kind.toUpperCase()}] ${c.repo}/${c.workflow} — ${c.lastConcl}`,
        body: [
          `signature: \`${tag}\``,
          `kind: ${c.kind}`,
          `first seen: ${c.firstSeenAt}`,
          `evidence: ${c.evidence.runUrl} (conclusion=${c.evidence.conclusion}, age=${c.evidence.ageMin}m)`,
          '',
          'Triage (claims-triage) owns the next step: auto-fix attempt, quarantine (disable schedule), or operator-needed.',
          'This issue is the ONLY escalation for this signature — the storm ends here.',
        ].join('\n'),
        labels: ['sovereign-claim', `kind-${c.kind}`],
      }),
    });
    opened++;
  } catch (e) { /* issue path failing must not break the scan; the claim is already on disk */ }
}

writeFileSync(`${DECISIONS}`, (existsSync(DECISIONS) ? readFileSync(DECISIONS, 'utf8') : '')
  + JSON.stringify({ at: stamp, actor: 'sovereign-selfscan', runUrl: RUN_URL, scanned: REPOS.length, newClaims: state.newClaims.length, issuesOpened: opened, counts: state.counts }) + '\n');

console.log(`selfscan done: ${REPOS.length} repos, newClaims=${state.newClaims.length}, issuesOpened=${opened}, totals=${JSON.stringify(state.counts)}`);
process.exit(0); // measurement duty completed — the book is loud, the runner is quiet
