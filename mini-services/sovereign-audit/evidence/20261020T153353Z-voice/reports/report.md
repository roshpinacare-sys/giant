# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 51.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at a34736c9aad53696: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: d69a16b443a1897b, 9b0df0240128d536, 63ad96a512febcb4, 082b1c997c34b4ed, 6e3225c50f0efa61, 124d0ca9a02e2ffd, 69d62d301440158c, 43bd7eddbb5679bd, 6f97e24b45078e06, 5bb17ab5956ff047, 3fb31db8adb9267e, 095fd4c8558293e9, c7af3d1a1377f074, a34736c9aad53696

## Coverage

- graph: EVALUATED
- permission: EVALUATED
- approval: NOT_EVALUATED
- delegation: NOT_EVALUATED
- budget: EVALUATED
- citation: NOT_EVALUATED

## Limitations

- Capture completeness, collector identity, actor identity, human approval and costs are caller declarations, not authenticated facts.
- This passive audit inspects already-recorded actions and does not prevent execution or reverse effects.
- Recorded dependency edges establish declared lineage, not physical causality or completeness of unobserved activity.
- Citations verify recorded source identity and content digests, not semantic entailment, factual truth or licensing.
- Integer costs use caller-defined units; this is not billing proof or currency conversion.
- Checksums provide integrity, not authenticity, production certification or deployment authorization.

Bundle SHA-256: `90e947a697ec98b58cec23b4bfb122e42f1782dd54277dc96879c5c9cfbd3267`
