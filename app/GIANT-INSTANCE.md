# app-instance — ה-instance-החי של GIANT (מראה-מדוד)

**חוק-המשטח (SYSTEM.md):** ה-instance-החי בסנדבוקס = מראה של הקוד-הזה.
התיקייה `app/` היא מראה מלאה של מקור-האפליקציה (Next.js 16 · App Router · TypeScript strict) שרצה עכשיו בפורט-3000 — אפס-סתירה בין-המראה-לחי.

## מה חי כאן
| נתיב | תפקיד |
|---|---|
| `src/app/page.tsx` | מעטפת-GIANT: ערוץ · דקס · דופק · המשרד-החי (מודול-אחד לכל-יכולת) |
| `src/components/giant/ChannelView.tsx` | **הערוץ-היחיד** — הדלת-הראשית: פניות-הריבונות · הוראות-הבעלים · קול · רישומים |
| `src/app/api/giant/channel/` | קריאת-זרמים קנוניים (`Pulse/state/sovereign-channel/`, cache 30 שניות) |
| `src/app/api/giant/channel/directive/` | **קומיט-ישיר-מהמשטח** (סוגר את פריט 20-c-הפתוח): הוראת-בעלים ← איטום append-only אל `directives.jsonl` בגיט — מאומת-שרת, PAT שרת-בלבד, אפס-הצלחה-כוזבת |
| `src/app/api/giant/pulse/` | דופק-39-הספרים + רישום-ההחלטות (נמדד-חי) |
| `src/app/api/giant/market/` | מטבעות-גדולים (BTC·ETH·SOL·USDT — מדיד-חי) · steem/hive = שכבת-עגין-מושתקת |
| `src/components/giant/OfficeView.tsx` | המשרד-החי — המשרד-היחיד (חוק-משטח-אחד); עמדת-המפעיל מוטמעת |
| `src/components/hq/OperatorDrawer.tsx` | עמדת-המפעיל (אותו מפתח-מנהל פותח-הכל) |

## קבלה-מדודה (2026-10-14, טריים מהדפדפן)
- `GET /` 200 · `GET /api/giant/channel` 200 (זרמים-קנוניים: 3 פניות-פתוחות מוצגות)
- דקס: BTC $81,783 · ETH $2,432 · SOL $104.33 — `measured · live` (CoinGecko) · saos-dex/saos-markets מדודים-מהגיט
- דופק: 39 ספרים · 23 חיים (6 שע') · 15 פעילים (48 שע') — מדיד
- שער-הבעלים: סשן-מלא-בממשק נמדד; `POST directive` ללא-טוקן = **401**; קלט-פגום = **400** כנה
- נייד-390px: ניווט-תחתון + משרד-תלת-ממד חי · אפס-שגיאות-קונסולה
- אפס-סודות: סריקה-חמה (PAT/WIF/headcorner) — נקי; `upload/`, `.secrets/`, `db/` אינם-במראה

## חוזר-למעגל-החיים
כל-שינוי-ב-instance נדחף-לכאן באותו-סשן (איטום-G2). מי שרוצה להריץ מקומית: `bun install && bun run db:push && bun run dev` — נדרש קובץ-הסכם-מפתח-מקומי (`upload/headcorner.txt`) לכתיבה; קריאה-פומבית עובדת-בלעדיו.
