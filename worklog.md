# Worklog — saos-sovereign-foundry professional review

---
Task ID: 0
Agent: Z.ai (orchestrator)
Task: Clone roshpinacare-sys/saos-sovereign-foundry via owner PAT and launch a professional, no-mercy engineering review.

Work Log:
- Read PAT from /home/z/my-project/upload/pat.env (never exposed in output).
- Identified owner: roshpinacare-sys; repo cloned with --depth 50 to /home/z/foundry-review/foundry.
- Inventoried repo: 321 files (74 TS, 180 md), 26 API routes under src/app/api/saos/*, 7 mini-services, 470KB worklog.md inside repo.
- Verified secrets in git history: agent/vault/* (key access generation, "password next to the envelope" incident R11), upload/חח.txt (GitHub fine-grained PAT) — removed from HEAD only, history retained by doctrine (no force-push).
- Read .gitleaksignore (2 triaged fingerprints, both "historical"), package.json, CRITICAL-R11-KEY-BROADCAST.md, docs/OWNER-KEYS-MASTER-FILE.md, src/lib/saos/auth.ts.
- Latest commit on main is a selftest FAIL (a13be7a, 2026-10-08).

Stage Summary:
- Repo cloned at /home/z/foundry-review/foundry (branch main @ a13be7a).
- Confirmed historical secret material retained in git history (PAT + encrypted key backups + R11 password exposure).
- Parallel review agents dispatched for: 3-a API+lib security/code, 3-b mini-services, 3-c CI/scripts/config/prisma, 3-d frontend/docs/repo hygiene.

---
Task ID: 3-c
Agent: senior DevOps & supply-chain reviewer (3-c)
Task: READ-ONLY review of CI (.github/workflows + yaml_guard.py), scripts/*.mjs|cjs|ts, configs (.env.example, .gitignore, eslint, next.config, tsconfig, postcss), package.json/bun.lock posture, prisma/schema.prisma config cross-check.

Work Log:
- wc -l'd all 33 in-scope files (5,588 lines); read every workflow, config, and all 22 scripts + FORENSICS-INDEX.md in full.
- Interrogated git history: trigger-removal commits 29ad7f7/e8b09bd; selftest FAIL commit a13be7a (diffs author-distributed); remote refs (0 PR refs, 3 branches).
- Grep sweep: curl/wget, rm -rf/rmSync, shred, kill, sudo, chmod 777, secrets.GITHUB_TOKEN, pull_request_target, ${{, exec/spawn, /home/z/, AbortSignal, VACUUM INTO, broadcast.
- Reproduction: copied tracked HEAD (a13be7a) to /tmp/foundry-tc, bun install --frozen-lockfile (428 pkgs), prisma generate, then bunx tsc --noEmit (exit 0), bun run lint (exit 0), next build (exit 0). Selftest FAIL on main does NOT reproduce on committed HEAD.
- Verified fleet_keys.enc / fleet_keys.meta.json are NOT gitignored (git check-ignore) though fleet-vault-template.cjs writes them into scripts/ with the passphrase inside the meta file.
- Confirmed zero in-repo references to the ":3044 sovereign CI engine" (grep 3044 → 0 hits); all quality gating is an unversioned external bot that self-commits status banners.
- No repo files modified (review read-only; install/build ran in /tmp copy only).

Stage Summary:
- CI is decorative: ci.yml/gitleaks.yml/yaml-guard have pull_request+workflow_dispatch only (push triggers deleted 2026-10-06 after trigger corrupted to `branches: ain]`), remote has 0 PR refs, Actions minutes exhausted since 09-20 → last Actions-class verification of anything: weeks. Production build is verified NOWHERE by the project's own gates ("skipped-local") — my clean-room build passes, so HEAD is actually healthy; the red banner on main is a false alarm from an unauditable bot.
- P0: (1) no functioning gate + external :3044 black box self-committing PASS/FAIL; (2) deep-agent-audit.cjs autonomously force-pushes re-written HEADs to default branches of all token-visible repos on regex path matches (line 282) and persists the bearer token into .git/config of every audited clone (line 361); (3) vault design stores the AES passphrase in plaintext meta.json next to the ciphertext envelope (build-vault-task36.cjs:141, fleet-vault-template.cjs:7) — incident R11's "password next to the envelope" is baked into the design, and the envelope+pass can be committed from scripts/ since not gitignored.
- P1: yaml-guard clones the default branch, not the PR ref (validates wrong code, never runs in practice); gitleaks binary downloaded without checksum pinning; all actions tag-pinned only; next.config.ts has zero security headers (X-Powered-By default on); blurt-sign-diag2.cjs broadcasts to Blurt mainnet from the "read-only forensics" dir; restore.mjs hardcodes db/custom.db ignoring DATABASE_URL.
- Positives: tsconfig strict:true and typecheck enforced (ignoreBuildErrors:false); .env.example clean of real values; .gitignore covers .env*/db/uploads/*.evm; backup/restore/cleanup are genuinely well-built (chain-proof verified restore, verified-backup gate before deletion); scripts never print key material (only verdicts/fingerprints); bun.lock coherent with next 16.3.4; api-check is a real 193-assertion contract suite.
- Scripts: 22 files, 3,817 lines; 16 hardcoded /home/z paths in 8 scripts; ~10 fetch sites without timeout (api-check, concurrency-check, steem-plane-probe); eslint exempts scripts/** entirely; 72% of last 25 commits are bots.

---
Task ID: 3-d
Agent: senior frontend & repo-hygiene reviewer (general-purpose subagent)
Task: Read-only review of src/app/*, src/components/saos/*, ui/kit.tsx, and repository documentation hygiene (180 md files, worklog.md, agent/*.json, docs/PORTS.md, download/).

Work Log:
- wc -l all 19 in-scope frontend files (6,624 LOC total); overview-tab.tsx 948 lines = largest.
- Read page.tsx, layout.tsx, globals.css, api.ts, kit.tsx, labels.tsx, command-center.tsx fully; overview-tab.tsx (948), breakthrough-tab.tsx, live-proof-card.tsx, security-tab.tsx (login form), treasury-tab.tsx excerpts.
- Grepped src for `any` (0 in components), dangerouslySetInnerHTML (0), setInterval (1 — 1s clock with cleanup), console.* (1 legitimate server-side console.error), target=_blank (all with rel=noreferrer).
- Read types.ts structure: 41 exported types, 0 `any`, 2 Record<string,unknown> escape hatches.
- Verified polling: zero data polling; api.ts is fetch-once-per-session useSyncExternalStore store with manual refresh + registered-fetcher refreshAll. Verified error/loading/empty states per tab (grep counts per component).
- Quantified markdown: 179 md files total; 81 (45%) are byte-identical 19-line "אוחד לבית הקנוני — G6" tombstone stubs with `sha256 העותק שהיה כאן | undefined` — including ALL 29 broadcasts/, ALL 38 docs/reports/, 12 of 14 root md, 2 docs top (FORENSIC-AUDIT pair). "undefined" = JS undefined interpolated; provenance hash never captured.
- md5 dedup across all md: exactly 1 duplicate pair — docs/briefings/latest.md == BRIEF-2026-09-11T22-16-54.md.
- Sampled per group: root (AGENTS.md real contract, 12 stubs), broadcasts/ (all tombstones), docs/reports/ (49KB total, 100% tombstones), docs/briefings/ (31 machine-generated chief-of-staff LLM briefs, 376KB), docs/evidence/ (28 substantive on-chain evidence records with real txids), docs/README.md (claims dev port 3000 — stale vs package.json :3100).
- worklog.md: 470,694 bytes / 2,526 lines, append-only; head/middle/tail sampled; documents OTHER repos (saos-sovereign-platform ports 3005/3006/3007/8545, SAOSExchange v75) mixed with this repo's history.
- agent/status.json: machine selftest state committed by bot commits (16 "foundry-selftest:" commits; HEAD a13be7a = FAIL 2026-10-08). agent/rotation.json: static registry OK but references broadcasts/rotation/ledger.jsonl which does not exist in tree.
- docs/PORTS.md vs reality: verified correct — package.json dev/start :3100 ✓, vault-guardian 3031 ✓, chief-of-staff 3032 ✓, external-signer 3033 (SIGNER_PORT ?? 3033) ✓, fleet-cure 3034 (FLEET_CURE_PORT ?? 3034) ✓, rotation-keeper 3035 ✓, key-broker 3040 ✓. Drift found elsewhere: docs/README.md still says port 3000; UI prose hardcodes :3033/:3034/:3040.
- Dead weight: download/ = single 34-byte README placeholder; no root README.md exists; no empty dirs.

Stage Summary:
- FRONTEND: genuinely disciplined — zero `any`, zero XSS sinks, zero data polling, real loading/error/empty states, solid a11y (skip link, aria, focus-visible, prefers-reduced-motion, RTL+lang=he), port-free relative api.ts. Verdict: best-engineered area of the repo.
- P1: overview-tab.tsx:674 frozen `integ.evm === "12/12"` fleet-size check — the exact frozen-count anti-pattern the codebase's own comments condemn ("the frozen === 16 check went silent"). P1: breakthrough-tab.tsx bypasses shared store (bespoke fetch, unregistered with refreshAll, divergent 401/403 handling). P2: overview-tab god-file 948 lines; all-or-nothing 4-query gating; agents-tab.tsx:146 setTimeout without cleanup. P3: hardcoded network counts/ports in UI prose; useClock re-renders whole shell every second; saosFetch throws non-Error objects.
- REPO HYGIENE: 81 sha256:undefined tombstones = systematic data corruption of the dedup process (crimes: destroyed provenance, 45% of md mass is lies-by-pointer to an unverifiable external repo). worklog.md 470KB cross-project append-only log at root with no README.md. docs/reports + broadcasts = 67 files/67 tombstones. latest.md duplicate. download/ dead. Machine state in git (16 selftest bot commits, latest FAIL at HEAD).
- Recommendation: delete all 81 stubs + download/, gitignore briefings/ + agent/status.json, externalize worklog.md, add root README.md, fix docs/README.md port + overview-tab frozen check; docs/evidence/ + docs/PORTS.md are the only doc groups earning their place.
---
Task ID: 3-a
Agent: senior security & code reviewer (general-purpose sub-agent)
Task: Read-only no-mercy review of src/app/api/saos/**/route.ts (28 files), src/lib/saos/*.ts (27 files), src/lib/db.ts, src/instrumentation*.ts, prisma/schema.prisma.

Work Log:
- Read worklog.md (Task 0 context: historical secrets, R11, latest commit = selftest FAIL).
- Inventoried scope: 28 route.ts files / 5,407 LOC; src/lib/saos 27 files ≈ 5,527 LOC; db.ts 11; instrumentation 18+208; schema.prisma 238.
- Read every route.ts fully (auth, revoke-all, treasury, anchor-pulse, keys-map, signer, live-proof, verify-chain, seal, agent-bridge, repo-status, breakthrough-proof, energy, treasury-ops, owner-keys, decisions, status, live-gate, audit, anchor-ingest, anchor-reverify, anchor-preflight, kernel, verify-pack, research, plans, economy, verify-live).
- Read all lib modules fully or in relevant depth: auth, rate-limit, api-errors, db, signer, external-signer-client, receipt-store, repo-git, supervisor-bridge, instrumentation-node, modes, merkle, canonical-json, evidence, kernel, preflight, network-status (head), treasury-ops-live, tron-energize-live, hive-rc-live, fleet-cure, anchor-gates, economy, historic, tron-energize, networks/{live-probes,ethereum,types}, breakthrough/owner-decisions/findings (heads), schema.prisma, next.config.ts, .env.example, .gitignore, package.json.
- Built requireAuth/enforceRateLimit matrix per route via rg; grepped for eval/new Function/child_process/$queryRaw/console/any/TODO.
- Verified: upload/ gitignored (no admin key tracked at HEAD); no middleware.ts (no CSP/security headers); cookie flags httpOnly+SameSite=strict, Secure only in production; keys-map returns raw admin material to authenticated callers, masked prefix+length to anonymous.
- Quantified: 59 explicit status:200 error returns, 1 status:500 (keys-map), 5 status:502; ~1 TODO in src; 0 real `any`; 48 files contain Hebrew text; 4 duplicate signerToken() copies; EvidenceReceipt lacks createdAt index while hot paths full-scan it unbounded.

Stage Summary:
- P0: unauthenticated DB-write surface in default dry-run mode — POST /seal (auth ONLY when liveArmed, seal/route.ts:48-54) + GET-with-side-effects /energy, /economy, /kernel, /research write EnergyPlan/EconomySnapshot/receipt rows anonymously → evidence-chain pollution + unbounded SQLite growth.
- P0/P1: rate limiting keyed on LAST XFF entry (auth.ts:145-154, rate-limit.ts:104-111) — safe only behind the appending gateway; direct exposure = free bucket rotation bypass. Singleton in-memory state (rate-limit, caches, writeQueue, auditDropped) breaks multi-instance; documented but structural.
- P1: keys-map releases raw admin key to any authenticated session (keys-map/route.ts:213-217,347) + bearer is revocation-immune (auth.ts doc) → session theft escalates to permanent full admin; masked prefix+length leaked to anonymous.
- P1: unguarded JSON.parse on DB payloads in verify-chain:114, live-gate:89, preflight:188, signer:106, plans:40-47 — one corrupt row kills whole verification surfaces; preflight/live-gate fetch ALL receipts unbounded (O(N) per call).
- P1: treasury-ops requestId "UTC-day" is actually hour bucket (slice(0,13), treasury-ops/route.ts:134) — idempotency window 1/24 of intended → retry double-execution window for claim_rewards/delegate_rc.
- P1: repo-status fully public — leaks uncommitted file names, branch/sha, backup names, secret-scan matches, env perms to anonymous callers.
- P2: keys-map catch returns 500 violating the never-500 doctrine; inconsistent 200/502/500 error statuses; 59 status:200 error returns break HTTP semantics/monitoring.
- P2: instrumentation-node spawns 6 `bun run dev` child processes from request paths (ensureSupervisor on GET) with full process.env inheritance; infinite respawn (no attempt cap).
- P2: prisma schema — EvidenceReceipt/AuditEvent/OpLog/AgentMessage/EnergyPlan/EconomySnapshot unbounded (cleanup covers PendingSignature only); missing @@index([createdAt]) on EvidenceReceipt; no cascade on AnchorTx/EvidenceReceipt/PendingSignature→Seal.
- P3: agent-bridge token compare not timing-safe (=== at line 161); stale live-gate checklist text claims "no global session revocation" (contradicts Task 11 epoch rotation); dead code in keys-map (GEN marker, files[6]); 4× duplicated signerToken(); safeMeta duplicated; ~20× duplicated rate-limit/auth guard boilerplate; seal-bucket shared by anchor-ingest; wallet address constants duplicated treasury↔keys-map.
- GOOD (credit): CAS/immutability discipline (signer PATCH roast 60, anchor-pulse guarded promotions), in-process write mutex + retry ladder, coarseError scrubbing with server-side full logging, safeRpcUrl refusing keyed URLs, merkle phantom-leaf+concatenation hardening, canonical-json fail-closed, timing-safe auth compares, rate-map hard cap, single-flight caches, audit never logs key material, 0 eval/raw-SQL/any, ~1 TODO.
- Full report delivered in agent final message (auth matrix of 28 routes, metrics, file:line references).


---
Task ID: 3-b
Agent: senior security & backend reviewer (sub-agent)
Task: READ-ONLY security review of mini-services (external-signer, key-broker, vault-guardian, rotation-keeper, fleet-cure, chief-of-staff, keepalive.sh) + src/lib/saos/external-signer-client.ts.

Work Log:
- Read worklog.md; inventoried scope with wc -l (4,169 LOC incl. hidden .d10.ts/.derive6.ts = 111 LOC).
- Read all 11 in-scope files fully, including hidden forensic scripts in external-signer.
- Grep-quantified: console.log(14), writeFileSync(16), chmod(3, signer only), scrypt(10), wif(110 in signer), mnemonic(9, forensic only), JSON.parse(17), empty catch{} (30), hostname/127.0.0.1 (only rotation-keeper binds loopback).
- Verified .d10.ts/.derive6.ts are never imported by any runtime code (grep across repo) and contain no secret values — only the ROT1 derivation-label scheme; both read mnemonic/password from outside the repo ($HOME, upload/).
- Verified gitignore coverage: *.log, *.evm, .secrets/, cure-state.json, pulse-state.json, fleet-cure-status.json all ignored; no logs/state tracked in git.
- Checked supervisor (src/instrumentation-node.ts) probes via 127.0.0.1 only.
- Confirmed Bun.serve default binding (no hostname option) = 0.0.0.0 for external-signer/key-broker/vault-guardian/fleet-cure/chief-of-staff.

Stage Summary:
- P0×2: (1) signer openSeal() still honors legacy vault password stored BESIDE the ciphertext (fleet_keys.meta.json) — the R11-class pattern, live code path; (2) POST /keys/backup returns the ENTIRE fleet key material (all roles, 3 chains, main+fleet) encrypted under a caller-chosen passphrase — one static bearer token = permanent offline key exfiltration; contradicts the file's own "keys never served by any endpoint" invariant.
- P1×6: 5/6 services bind 0.0.0.0 incl. the signer (rotation-keeper shows the loopback pattern exists); vault-guardian has ZERO auth on /run-now (can trigger force-push neutralize) and /status; vault-guardian neutralize() interpolates remote git paths into shell (crafted filename = RCE with GitHub token in env, production mode); after any /keys/ingest the vault helper writes PLAINTEXT .env + keys/vault.json to disk and never shreds them; key-broker holds EVM/TRON/SOL private keys in plaintext JSON on disk and signs as ANY of 12 agents with one shared token; zero rate limiting anywhere — /auth/verify-owner is an online oracle to brute-force the owner's fast-derivation master password.
- Functional bug: rotation-keeper beatBackupFreshness POSTs /keys/backup with no body → always HTTP 400 — auto-backup control is dead (security-neutral but silently broken).
- Hidden files: clean of secrets, forensic-only, recommend relocation to scripts/ (repo's own DEEP-AUDIT concurs).
- Positives worth keeping: AES-256-GCM+scrypt envelope, timing-safe token compares, verify-before-broadcast authority gate, idempotent /sign ledger, fail-closed token handling, no key material found in any log line or HTTP response (except the encrypted backup export).
- Full report delivered in agent final message (Verdict/P0/P1/P2/P3/inventory/metrics).
