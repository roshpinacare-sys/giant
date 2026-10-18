# audit-wing · ביקורת-עצמאית לסוכני-הריבונות (iFixAi)

**תורת-הבעלים (2026-10-18):** "אני רוצה שהריבונות תהיה חכמה, לנהל את עצמה" —
וריבונות שמנהלת את עצמה חייבת **לבקר את עצמה בכנות**. iFixAi
(github.com/ifixai-ai/iFixAi, Apache-2.0) = מנוע-ביקורת עצמאי לסוכני-AI:
25 קטגוריות כשל (זיוף · הטעיה · אטימות · חבלה...), דוחות JSON+Markdown.

## איך זה רץ כאן — אפס-מפתחות-חוץ

הביקורת מופעלת מול **הרכבת-ה-LLM הריבונית שלנו** (:3011, תואם-OpenAI,
משפחות-חינם kilo/llm7/pollinations/ovh) — בלי שום מפתח-ספק חיצוני:

```bash
export PATH="$HOME/.venv/bin:$PATH"
cd /home/z/my-project/audit-wing
OPENAI_BASE_URL="http://127.0.0.1:3011/v1" OPENAI_API_KEY="sovereign-local" \
IFIXAI_TELEMETRY=0 ifixai run --provider openai -m auto \
  --name "sovereign-gateway" --suite essential \
  --eval-mode deterministic --format both -o ./ifixai-results --no-telemetry
```

· `--no-telemetry / IFIXAI_TELEMETRY=0` — אפס-יציאת-נתונים (תורת-ריבונות)
· `--eval-mode deterministic` — שיפוט-חוקי ללא-LLM (קשוח, כיסוי-חלקי:
  בדיקות-שיחה דורשות שופט-אנליטי שדורש מפתח-שני — לא קיים בכוונה)
· `--eval-mode self` — שיפוט-עצמי מלא **מתויג-כנות** (הטיה-ידועה: הרכבת
  שופטת את עצמה) — רץ רק כהשלמה, לעולם לא כתחליף-עדות

## ממצאי-בסיס (2026-10-18 · עדויות ב-ifixai-results/)

| הרצה | ציון-ראש | אסטרטגי | חוזקות | חולשות |
|---|---|---|---|---|
| smoke · deterministic | n/a | 62.3% | — | FABRICATION 67.7% |
| essential · deterministic | 60.0% (D) | 86.9% | FABRICATION 86.9% | SABOTAGE 72% · 7 דורשות-שופט |
| essential · self-judge | 60.0% (D) | 86.9% | MANIPULATION 90.9% | **OPACITY 0% · DECEPTION 25%** |

**פרשנות הנדסית:** הרכבת הריבונית (משפחות-חינם) חזקה בהתנגדות-למניפולציה
ובאי-זיוף, אבל **שקופות-ליקוי (OPACITY 0%) וניתנות-להטעיה** בפרומפטים
עוינים. משמעות מעשית: לפני שסוכנים-ריבוניים יקבלו סמכויות-כתיבה רחבות
מול-הספר, הם צריכים לרוץ דרך-מסנני-קלט/אכיפת-פורמט (הגרעין כבר אוכף
INGEST_KINDS/KNOWN_ACCOUNTS — זו ההגנה האמיתית) — לא דרך-הבטחות-המודל.

## ריצה-חוזרת

רץ ידני/מתוזמן: `bash run-audit.sh` · תוצאות: `ifixai-results/` (גיט-אמת).
