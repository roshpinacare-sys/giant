# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 43.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at b7589531aeaf8c9e: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: 8813d9d3c0dc6ab5, c71596eb8e03dceb, 4ba4ff0a20c5b076, 03093dff3d2c6334, b555928ca960aae9, a6b6a8a58bd01af2, abe2187f6d33815c, 877f1bde53c83260, 1e69670c29fa1b11, 458698e241e7f372, b8ff8220a31425e6, 045e970b024796e6, ecc0fd97b5036a36, b7589531aeaf8c9e

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

Bundle SHA-256: `0b281c7c1e6c1626fc4d7640f5da19d7625f62874393bcf72114c066b1516c50`
