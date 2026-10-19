# iFixAi — אינטגרציה-ריבונית (גל-93 · צו-בעלים "בחן תכנן בצע דחף")

**מה זה**: iFixAi (github.com/ifixai-ai/iFixAi · Apache-2.0 · PyPI 4.2.0) = ביקורת-בלתי-תלויה
על סוכני-AI: מסלולי-פעולה נבדקים מול מדיניות-עסקית (הרשאות-תפקיד, תקרות-תקציב, אישורים) —
לא-מדידות-טכניות (latency/tokens) אלא "האם-הסוכן עושה-את-שהוטל-עליו".

**למה זה-קריטי-לריבונות**: הצבא שלנו סוחר עם בנק-אמיתי ללא-בעלים-נוכח. ביקורת-עצמית של
הסוכן-עצמו אינה-ביקורת — נדרש שופט-בלתי-תלוי. iFixAi בדיוק-זה: מבקר **פסיבי**
(מעולם-לא-מריץ-כלי-שנקרא-בנתונים), מקפיא-הוכחות, ניתן-לשחזור.

## מה-נבנה-ונמדד-חי (2026-10-18)

1. **ציוד-הצבא** (soldier-army): כל-פעולה-אמיתית (הזמנה/דלק/העברה) נפלטת ל-
   `mini-services/soldier-army/state/actions.jsonl` — מי · מה · משאב · תוצאה · עלות-µ.
2. **המבקר** (mini-services/sovereign-audit :3022 · python3 + ifixai):
   - `audit_soldiers.py` קורא את האירועים, בונה `TraceCapture` נטיבי (ה-callable מחזיר
     את-התוצאה-שהוקלטה — **אפס-ביצוע-מחדש**), ומפעיל `create_audit_bundle` מול
     מדיניות `soldier-mandate-msg8`:
     - הרשאות: soldier→order@SAOS/USDS · soldier→fuel@credits · soldier→xfer@operator בלבד ·
       operator→xfer@* (מימון)
     - תקציבים: `BudgetRule(scope="actor", limit_units=300_000)` **פר-חייל** — תקרת-הבנק-היציב
   - פלט: `decision` (CLEAR/FINDINGS) + הוכחות-מוקפאות (`evidence/<stamp>/capture.jsonl` + דוחות)
   - לולאה: כל-15 דק + POST /run · נכנס למניפסט-המשגיחה (mini-guard) → בן-אלמוות
3. **ריצה-ראשונה-ממוסמכת**: 18 אירועים (מימוני-העלייה) → **CLEAR, 0 ממצאים**
   (evidence/20261018T074859Z).

## שלבים-הבאים (תור-בנייה)

- **SUT=http**: ביקורת-סוכן-חי דרך `--provider http --n <url>` — השער-הריבוני (:3011,
  OpenAI-compatible) כשופט; הצבא כ-SUT-חי.
- **Policy Lab**: `docs/business-policy-lab.md` של iFixAi — מציאת-מסלולי-נזק-קצרים
  ביותר-מתוך-הרשאות-מותרות (pre-mortem למנדטים-חדשים לפני-הפעלה).
- **כיסוי-רחב**: אותו-תבנית (actions.jsonl → AuditPolicy) ל-bridge, voice, ועתידיים.

## חוקים

- המבקר אף-פעם לא כותב לספר-החי ולא מריץ מסחר (פסיבי-טהור).
- כשל-פייתון/חבילה = `AUDIT-ERROR` כנה ב-/health — לעולם לא CLEAR-מזויף.
- אפס-סודות במבקר (הוא קורא רק actions.jsonl מקומי).
