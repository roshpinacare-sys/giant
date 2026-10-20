# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 44.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at b5aa61e6d7df7b41: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: f5a5f586afa515bf, cae7928731bac4be, 99ad2f6babde4cdc, 956435b207b77772, a5a370be226e0160, f6c36b3657514d7a, 4375014ea9bb04b0, 3eef63811b5da18e, 574ff090ddeba03f, be5de5ee70a89af3, 87a27bb999dbd31b, 05edbf32b016aa40, f4e9dd9d7390adb4, b5aa61e6d7df7b41

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

Bundle SHA-256: `df4febb0f00b817a31ce29da6defae8670294a97077dad77066224a9e5507d4c`
