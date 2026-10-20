# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 43.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at 17cdbe635a83ad3f: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: b49c2883cc6aecd7, 144e396e57eaf131, 5c29dd93e420ce88, be8bb8e5462633f8, d0f22994d1131a1b, bec1d57a0cfabb76, 51e440b7324f9529, 19c7abd822ab430e, 84de7898889a8be3, a0f365f1eb36ff98, ce5a8ebd328cd7b5, 81a1dbe4a09947b3, 30be30e196c1dcb6, 17cdbe635a83ad3f

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

Bundle SHA-256: `d239f903bbf4dd99c6a06ff92f28f6c8cc90953f374ff2e58433a7cfd1b44205`
