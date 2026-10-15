# SOVEREIGN GATEWAY (:3011) — השער הריבוני המקומי

נקודת-קצה **אחת יציבה ומקומית** בתאימות OpenAI, שכל סוכן/כלי/סקריפט יכול להצביע
אליה — בלי לדעת כלום על המוחות שמאחוריה, בלי מפתח אמיתי (כל מחרוזת מקובלת),
ובלי לקרוס כשספק כלשהו נופל.

```bash
OPENAI_API_BASE=http://127.0.0.1:3011/v1
OPENAI_API_KEY=any-string-here   # zero-auth by design
```

## מה יש בפנים
- **שרשרת מוחות ריבונית** (העותק המוסמך של הדוקטרינה): xAI → OpenRouter×3 →
  Groq/Cerebras/Mistral/Google/GitHub-Models/Together → Cloudflare-AI →
  duckai (אם `DUCKAI_URL`) → Kilo → LLM7 → Pollinations → OVH → z-ai.
- **Failover בזמן אמת**: 429/403/402/401/404/timeout/מוות-רשתתי → מעבר שקוט
  למוח הבא. קירור פר-מוח+מודל: 45s ל-429, 5 דק' למתים, 15s לרשת.
- **ניהול קירור מרכזי**: כל הצרכנים (foreman, reception, כלים חיצוניים)
  נהנים מאותה מפת קירור אחת — מוח שנחסם לאף אחד לא נשאל שוב.
- **עדיפות קבלה**: קריאה עם `x-reception-priority: 1` (עמית) דורכת על צוותים.
- **AI_TIMEOUT / MAX_RETRIES**: משמעת רשת ריבונית (deadline כולל + תקרת ניסיונות).
- **אפס טלמטריה**: לוג של מזהה-מוח ולטנצי בלבד. אף תוכן הודעה, אף מפתח.

## נקודות קצה
| נתיב | תיאור |
|---|---|
| `GET /health` | מצב כנה לכל מוח (live/cooling), מונים, uptime |
| `GET /v1/models` | איחוד המודלים החיים + `auto` (מסע מלא בשרשרת) |
| `POST /v1/chat/completions` | תאימות OpenAI (`stream` לא נתמך — כנות) |
| `GET /v1/system-prompt` | ה-prompt הריבוני (מוזרק גם לסוכני המשרד) |

## ריצה בכל מכונה
```bash
cd mini-services/sovereign-gateway && bun install && bun run dev
```
השירות קורא את הסודות מהכספת (`.env.local`/`.env` בשורש הריפו — merge-deploy
של vault), ולכן אחרי `auto-unseal` הוא קם עשיר במוחות. בלי כספת — מצב כן/ללא
מפתחות כנה עם המוחים האנונימיים בלבד.

## duckai — גשר הנדסה-לאחור מקומי
מקור הקוד של [amirkabiri/duckai](https://github.com/amirkabiri/duckai) חולץ
ל-`mini-services/duckai/`. זה שרת OpenAI-compatible מעל backend ה-AI החינמי
של DuckDuckGo (אפס מפתח, אפס עלות). מהסנדבוקס הזה DDG חסום רשתית (נמדד פעמיים
בכנות) — לכן ה-slot מופעל רק כש-`DUCKAI_URL` מוגדר, על מכונה עם גישה ל-DDG:

```bash
cd mini-services/duckai && bun install && PORT=3031 bun run start
# ואז ב-.env של השער: DUCKAI_URL=http://127.0.0.1:3031/v1
```

## הפיכת השער לסופרוויזד
`/api/foreman/health` (שרת Next) מקים את השער כילד של עץ השרת כשהוא נופל —
אותה חסינות-ריפר ממנה נהנה הפורמן.
