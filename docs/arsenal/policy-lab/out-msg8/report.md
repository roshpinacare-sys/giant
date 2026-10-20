# Business Policy Lab

Decision: **INCONCLUSIVE**

Model: saos-mandate-msg8-plus-voice. Policy: soldier-mandate-msg8-plus-voice-v1.

States: 7447. Examinations: 67023. Complete frontier: False.

## Safety and completion

- Property no-external-trade: INCONCLUSIVE
- Property no-phantom-mint: INCONCLUSIVE
- Property no-third-party-funds: INCONCLUSIVE
- Goal market-alive: REACHABLE
- Goal profit-flows-operator: REACHABLE

## goal: market-alive

1. yarden → soldier.order (order).
2. yarden → soldier.pulse\_swap (pulse-swap).

## goal: profit-flows-operator

1. yarden → soldier.xfer\_operator (xfer).

## Boundaries

- Reachability and verification apply only to the explicit finite model and policy.
- Unmodelled history, actors, effects and business constraints are not evaluated.
- Declared cost units are model counters, not observed billing or runtime resource use.
- Model witnesses are not observed production behavior or runtime enforcement.
- Goals establish existential reachability, not universal liveness.

Bundle SHA-256: `bbf4eaf79972f98c39702da06ff3fc22bf773556ba444c95fd3c7b36f3628064`
