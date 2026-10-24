
## Claim: sovereign-local-rpc-gateway (in-house WS RPC + mesh NAT traversal, §4) — Z.ai Code (wave 19.83, trace 1a16e9a69e7baab9)

- **Registered:** 2026-10-24T16:1xZ (owner full-authorization directive §4 + §10.4 — CAS registered BEFORE any code written)
- **Subsystem ownership claim:** the SOVEREIGN LOCAL RPC GATEWAY inside saos-control-center — an internal high-throughput WebSocket gateway connecting all swarm agents directly to the fleet-economy hash-chain ledger (live engine :3016 /health + /ledger measured), plus the mesh traversal layer (STUN RFC 5389 codec, NAT-PMP RFC 6886 wire protocol, UPnP SSDP+IGD control builders) — 100% local-first, zero public-internet bottlenecks, zero new third-party deps (node:crypto/node:net/node:dgram/bun-native-WS only). Complementary to dex-htlc-bridge (settlement primitive) and issue-to-PR runner (build loop): this lane owns TRANSPORT ONLY — no wallet logic (agent-9), no risk policy (dex-risk-cabinet), no dex kernel (dex-htlc-bridge).
- **Active branch:** direct additive landings on saos-control-center main (house culture) — collision scan at claim time: 0 open PRs repo-wide, no gateway/mesh/WS-server work in any lane, control-center history shows fabric rate-limiting (orthogonal) only.
- **Target file paths:**
  - saos-control-center `mini-services/sovereign-gateway/index.ts` (NEW — beat loop + WS server on SOVEREIGN_GATEWAY_PORT default 3140; single-flight upstream poll; graceful shutdown; `--once` CLI for CI-provable single cycle)
  - saos-control-center `mini-services/sovereign-gateway/protocol.ts` (NEW — frame codec: canonical-JSON, sha256 chained frames (prev→hash, the fleet hash-chain law), topics, seq, heartbeat; verifyChain)
  - saos-control-center `mini-services/sovereign-gateway/auth.ts` (NEW — HMAC-SHA256 challenge→session-token issuance, constant-time verify, nonce replay window, fail-closed without SOVEREIGN_GATEWAY_TOKEN)
  - saos-control-center `mini-services/sovereign-gateway/upstream.ts` (NEW — fleet-economy ledger adapter: /health seq-poll + /ledger tail, honest stale flag on upstream failure, never fabricates)
  - saos-control-center `mini-services/sovereign-gateway/topics.ts` (NEW — subscription filter + per-connection token-bucket rate limit, deterministic injected clock)
  - saos-control-center `mini-services/sovereign-gateway/mesh/nat.ts` (NEW — pure STUN encoder/decoder incl. XOR-MAPPED-ADDRESS v4/v6 + FINGERPRINT CRC32; NAT-PMP request/response builders; UPnP SSDP M-SEARCH + IGD SOAP AddPortMapping/GetExternalIPAddress builders/parsers)
  - saos-control-center `mini-services/sovereign-gateway/index.test.ts` + `mesh/nat.test.ts` (NEW — TDD suites BEFORE logic: chain integrity, auth negative paths, replay refusal, backpressure drop honesty, token-bucket determinism, STUN/NAT-PMP/UPnP byte-level vectors, end-to-end fake-ledger→WS-client integration on ephemeral port)
  - saos-control-center `src/app/api/mesh/route.ts` (NEW, additive — reads the gateway heartbeat state file, fail-closed 503 when absent)
  - saos-control-center `.gitignore` (ADDITIVE — runtime state dir)
- **Exposed interfaces:** WS frames {v,topic,seq,ts,payload,prev,hash} · topics ledger.state|ledger.health|mesh.status|gateway.stats · `verifyChain(frames)` · `issueChallenge/verifyChallenge/issueSession/verifySession` · `encodeBindingRequest/decodeBindingResponse/buildPmpRequest/parsePmpResponse/buildMsearch/parseSsdp/buildAddPortMapping/parseXmlValue` · HTTP /health /status on the gateway port · GET /api/mesh (control-center)
- **Cross-agent dependencies / coordination:** zero overlap — no other lane declares saos-control-center paths; reads fleet-economy :3016 read-only; writes only its own state dir; giant untouched except this claim row.
- **Verification:** TDD red→green before push; `bun test mini-services/sovereign-gateway` green; tsc slice clean (own tsconfig, standalone unit per the trunk-boundary law); live proof: gateway booted against the real engine, frames chain-verified across N polls, auth negative path measured, mesh probe honest report; conventional GPG-signed commits; rebase-before-push, ff-only.

## Claim: dex-htlc-bridge (internal atomic-swap engine, §7.2) — Z.ai Code (wave 19.82, trace 1a16e94f27901451)

- **Registered:** 2026-10-24T16:1xZ (owner full-authorization directive §10.2 — CAS registered BEFORE any code written)
- **Subsystem ownership claim:** the IN-HOUSE cross-asset atomic-swap bridge engine for saos-dex — hash-time-locked contracts (HTLC) operating 100% within the sovereign mesh, zero external RPC for settlement. The existing bridge.ts is the EXTERNAL far-network bridge (operator-trusted, manual release, SETTLE-12); this claim is the COMPLEMENTARY trustless internal primitive (counterparty-independent, deterministic, on-chain preimage witness).
- **Active branch:** `feat/dex-htlc-bridge` (roshpinacare-sys/saos-dex; collision scan at claim time: 0 open PRs, only main head, 0 htlc-named branches — clean)
- **Target file paths:**
  - saos-dex `src/lib/dex/htlc.ts` (NEW — pure core: sha256 hashlock binding, block-height timelock, claim/refund state machine, conservation auditor; zero deps, zero Date.now in core — state-clock only)
  - saos-dex `src/lib/dex/kernel.ts` (ADDITIVE hunks only: GAS_TABLE +3 opkinds (`htlc_create`/`htlc_claim`/`htlc_refund`), Op interface +5 optional fields (htlcId, hashlock, preimage, recipient, timeoutH), DexState +optional `htlcs` (old-snapshot-tolerant — the extBack?/bookFeesMu? pattern), applyOp +3 cases following the ve_lock escrow discipline)
  - saos-dex `src/lib/dex/htlc.test.ts` (NEW — TDD suite BEFORE logic: full lifecycle, expiry-refund, double-claim refusal, preimage-mismatch refusal, refund-before-expiry refusal, Σ-conservation invariant, nonce replay, and the two-party atomic-swap composition proof — deterministic, offline)
  - saos-dex `src/app/api/dex/htlc/route.ts` (NEW — GET list/quote + POST create/claim/refund via the single submitOp funnel — pre-trade risk cabinet intercepts upstream, already live since 2747ee7b)
- **Exposed interfaces:** `createHtlc(st,op)` / `claimHtlc(st,op)` / `refundHtlc(st,op)` → `OpResult` · `htlcInvariant(st)` → `{ok, lockedTotal, activeTotal, seams}` · HTTP `/api/dex/htlc` (GET list · POST action)
- **Cross-agent dependencies / coordination:**
  - Zero overlap: agent-9 wallet surface untouched; dex-fabric (scanner/transport) untouched; risk-cabinet files untouched (my ops flow THROUGH their gate); fleet-economy receipts untouched; issue-to-PR runner (giant mini-services) untouched
  - Adds 3 opkinds to the shared GAS_TABLE/Op/applyOp registry — additive-only hunks; merge-order safe (append-style cases), will AST-re-resolve + re-run full suite if a sister lands first (§6 law)
  - Iron invariants honored: conservation of locked Σ, no double-claim, no claim-after-expiry, no refund-before-expiry, sha256(preimage)===hashlock exact, nonce dedupe via existing discipline, ops enter mempool→block→stateRoot→merkle sealing automatically via applyOp
- **Verification:** TDD red→green before push; `bun run typecheck` clean on touched surface; battery-core + invariant-fuzzer exit 0 after landing (integration proof); cloud==local ff-only push

## Claim: native issue-to-PR runner (self-building loop, §9.3) — Z.ai Code (wave 19.82, trace 1a16e9871c9c9db1)

- **Registered:** 2026-10-24T~16:00Z (owner full-authorization directive §10.3)
- **Subsystem ownership claim:** the EXECUTION side of the native developer loop — consume meta-planner's issues feed, author fixes, test fail-closed, land receipts. (autonomy-lane owns the issue-GENERATION side, already landed v1/v2; this claim is the runner, complementary by construction.)
- **Active branch:** direct landings on giant main (house culture) + this claim pre-registered
- **Target file paths:**
  - `mini-services/issue-to-pr/index.ts` (NEW — beat loop + one-shot CLI, zero new deps)
  - `mini-services/issue-to-pr/planner-feed.ts` (NEW — reads meta-planner state/issues.json contracts)
  - `mini-services/issue-to-pr/fixers/*.ts` (NEW — per-class deterministic fixers, fail-closed)
  - `mini-services/issue-to-pr/index.test.ts` (NEW — TDD suite BEFORE logic)
- **Exposed interfaces:** `selectWork(feed)` → ranked claimable item · `applyFix(item)` → diff+proof · `runGate()` → green-else-abort · `once()` / `startBeat(ms)`
- **Cross-agent dependencies / coordination:**
  - meta-planner feed schema `meta-planner/issues@2` consumed read-only; no writes to their state
  - WS-1 trunk-types cure (@types/node + bun-types) — claimed BY THIS LANE as first executed item (bun.lock churn accepted per owner full authorization; measured 542-contract delta before/after)
- **Verification:** bun test mini-services/issue-to-pr green before any logic lands; runner self-scan zero-debt

## Claim: giant swallow-guard (anti-erasure defender, §8 deadlock-break) — agent-5-laneD (Z.ai Code sandbox /home/z/my-project, wave 19.83, trace 1a16e99dd59037dd)

- **Registered:** 2026-10-24T16:0xZ
- **Subsystem ownership claim:** deterministic canonical-set presence watcher + byte-identical rescue lands + LOCAL perpetual loop (this box, zero cloud-minutes). Fills the measured gap: identity-guard.yml/swallow-watch.yml relanded twice today (4c81262→erased→ee9e5e6→erased→97e1d96) while the scheduled plane is DEAD — file-presence without an executing watcher is not protection. The guard makes the reland cadence continuous instead of manual.
- **Target file paths:**
  - `src/lib/sovereign/swallow-guard.ts` (NEW — pure deterministic core: canonical-set law, absence-detection, fail-closed rescue plan, hash-linked receipt chain)
  - `src/lib/sovereign/swallow-guard.test.ts` (NEW — hostile-fixture TDD suite)
  - `scripts/giant-swallow-guard.sh` (NEW — the native loop: fetch → measure → rescue-absences byte-identical → push FF with re-verify → receipt; single-instance flock + UNITY-GUARD + leak-proof hatch laws)
  - `SWARM_STATE.md` (this claim + periodic census receipts)
- **Exposed interfaces:** `detectSwallows(tree: Record<path,sha256>)` → `Swallow[]` (absence-of-canonical-path = swallow; content-diff = alert-only — never fights legitimate evolution) · `rescuePlan(swallows)` fail-closed (restores only from adopted blobs, never invents) · `verifyReceiptChain(receipts)` hash-linked {prevHash,hash,SHA-256}
- **CANONICAL SET (v1):** src/lib/giant/{empire-registry,empire-registry.test,empire-map,doors}.ts · src/lib/dispatch/{doors,receipts,redact}.ts · .github/workflows/{identity-guard,swallow-watch,trust-heartbeat,ext-audit}.yml · SWARM_STATE.md (presence-only)
- **Cross-agent dependencies / coordination:** complements sovereign-lane's manual reland receipts (their wave-19.76 adopted bytes = my adopted baseline); complementary-by-construction to the issue-to-PR runner (Z.ai wave 19.82 — execution side) and autonomy-lane meta-planner (generation side); zero file overlap; NEVER force-pushes; NEVER restores SWARM_STATE content (append-only law, presence-alert only); rescue commits are pure additive FF on the freshest fetched main.
- **Verification at claim time:** TDD suite green before any logic lands (hostile fixtures: missing path, tampered chain, empty tree, unknown-path fail-closed); loop deployed on this box with honest JSON-line receipts.
