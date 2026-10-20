# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 49.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at 2f8bdd09043db226: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: 70d6e91140899676, 3ab51bc5b6e185ac, 765e68a1823a2cb3, c322b3cf0c156b8e, ec747683a7de853b, 65cbaec10288652e, ca538fb1a4731e04, ee3857f51b421ff3, 5157dccd9d206c9a, 99678a2cab05cea2, b716af605f1a8fa0, db9ef4a5ae1574a5, 9f8f0f6141a9ad14, 2f8bdd09043db226

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

Bundle SHA-256: `49970c9555e9bcded87508f43c79bc1431ec7851ae9bc4fb16bab18b34fe9972`
