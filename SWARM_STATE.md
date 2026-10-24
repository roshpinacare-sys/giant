# SWARM_STATE — מרשם-הנחיל הריבוני (ראש-ארכיטקטורה · trace 1a16e979cd7b1fa9 · מחזור 30)

חוק-השקיפות (§8 מההנחיה): כל-מופע-מכריז כאן claim לפני-קוד. איסור-גישה לנתיבים-מוכרזים של אחרים.

## Instance 0 — Chief Sovereign Architect (מופע-ראשי זה)
- **Task IDs**: 4-a (saos-dex N4 curation-boost · TDD), Defi roll-up audit, ledgers/pushes/dispatches.
- **Branch**: `feat/external-profit-curation-boost` @ saos-dex (merge-to-main אחרי-ירוק).
- **Paths owned**: saos-dex `grids/curate-params.json`, `grids/curate-params-selftest.mjs`, `grids/curate-beat.mjs` (params consumption), `grids/curate.mjs` (topics widen), `docs/DEFI-POLICY-ROLLUP.md`; giant `SWARM_STATE.md`, `worklog.md`, ledgers refresh.
- **APIs/dependencies**: GitHub REST (external-profit-publish + dex-grid dispatch), selftest suite saos-dex.
- **Verboden לאחרים**: כל-הנתיבים-לעיל + קבצי-מצב-חיים (db/custom.db, mini-services/fleet-economy/state/*).

## Instance 1 — Task 4-b (Saosmartwallet HSM runtime)
- **Branch**: `feat/hsm-vault-runtime` @ roshpinacare-sys/Saosmartwallet (clone: /home/z/work/Saosmartwallet).
- **Paths owned**: `packages/vault/**` (AES-256-GCM envelope vault · Ed25519/WIF/Secp256k1 · fail-closed), `packages/vault/state/*` (gitignored).
- **Dependencies**: node:crypto בלבד — אפס-תלות-שלישית-לא-מאומתת (§11).

## Instance 2 — Task 4-c (Native issue-to-PR worker §9)
- **Branch**: `feat/autonomy-issue-forge` @ giant (worktree: /home/z/work/giant-forge).
- **Paths owned**: `mini-services/issue-forge/**` (port 3046, audit→issues→claim→author→verify→PR), `state/forge-ledger.jsonl` (מקומי-בענף).
- **Dependencies**: GitHub REST (token מ-vault-נתיב-בלבד, אפס-סוד-בקוד), z-ai-web-dev-sdk (backend-import בלבד, דפוס sovereign-llm.ts), selftest אופליין.
- **Verboden**: instrumentation.ts, דחיפה ל-main, קבצי-מצב-חיים, issues עם לייבל `voice` (נתיב-אחר).

## חוקי-הנחיל (מחזור 29-30)
1. Branch-claim אטומי `feat/<subsystem>-<action>` — איסור-עבודה-על-main של-אחרים.
2. TDD: קודם-selftest דטרמיניסטי, אחר-כך מימוש; אדום=לחפור-לשורש עד-ירוק.
3. אפס-placeholder/stub/mock/TODO בקוד-ייצור; עדות-בדיקות בכל-PR.
4. Conventional commits: `feat|fix|test|refactor(<subsystem>): ...`.
5. Rebase מול-main לפני-כל-push; אימות-שלמות-שרשרת-חשיש.
6. סודות: vault בלבד, אפס-פליינטקסט-בזיכרון-מודפס/בלוג/בגיט.
7. fail-closed על-כל-שער-מצב; שינוי-מצב = קבלה-חתומה.
8. אינווריאנט-AMM 30bps + שימור-ערך + minOut fail-closed (saos-dex).
