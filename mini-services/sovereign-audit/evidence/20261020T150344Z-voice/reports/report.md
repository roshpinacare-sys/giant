# Recorded trajectory assurance

Decision: **BLOCK**

Policy: voice-mandate-v1. Retained events: 46.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- BUDGET\_EXCEEDED at 41e038fb9f949316: Configured actor:voice budget rule 0 exceeded its integer limit.. Witnesses: bcf4c69ad0d7d7ab, a0cb930fe2b4f997, 1ceee8c6d85a126b, 6c1bb80bd88baf81, 0f838421bf6b1058, 273fa3294ecfc36e, 3ff3d8311eac6dc2, da41743d44282114, bf7c7a50d1ca9cfd, 9246b8c5ed101316, aa4f268ebc67c509, deabde3460f3a4cc, 96bcb3b640f94b0d, 41e038fb9f949316

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

Bundle SHA-256: `9df0d32a82e0f81963fc5802fa9b5b8ab36e6db9ed5843ff5d2c682810207284`
