# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 43.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at 7e4514c502d0daf2: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: 3656af51728a1f1f, 81d0eaded5bf58e2, abec2b5044c8efb5, ce6628c44bb07280, a15bb2679aaa913d, d00265f56d659a19, 11d06b8e3fed9aae, 9ebbe2fceb353fa2, 29305d4e8450dd48, eb14e16f5b0ffb86, 0f8aefda486d711e, dad3c8ec09fd5c8e, db4557665fcc1dcc, 7e4514c502d0daf2

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

Bundle SHA-256: `70dd0faf3ba643f782f57026673d2a19b86372ba47c1c8bc80cc3f21b7531c2c`
