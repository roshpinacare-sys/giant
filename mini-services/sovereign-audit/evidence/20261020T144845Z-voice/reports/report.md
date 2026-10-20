# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 44.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at f53a58c9ac87db9f: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: e5fa1dd015b174fa, 8911071e1e939f20, 59dddd511e02ecc3, 3ab05053adaba569, c3a88bd2a7005360, 9ea5198a813cd369, fcab151eba3bf91a, 87eba508482c2878, 872aa579480f7b21, 22f0cb41c068e98e, 7bfd4c17ee8b0c07, f97cf3a82c869344, e6d7fa817a561dcf, f53a58c9ac87db9f

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

Bundle SHA-256: `dc1dbc5fd0edac7acd79abe12b86cd66f99947949d3372db4954e1429afb6610`
