# חוקי-העיצוב של הענקים — 10 רפרנסים שנשמרו (גל-6)

> הבעלים: "מעצבים, זה בשבילכם — 10 אתרי-רפרנסים מעולים לפרויקטים… שומרים — ושוכחים מהמחסור ברעיונות."
> שמור. ומומש: החוקים שחולצו יושמו ישירות על הממשק-המאוחד GIANT (globals.css §גל-6 + page.tsx).
> כלל-הבית: **מדידה-קודמת-לכל-טענה** — מה שנמדד, נכתב "נמדד"; מה שלא, נכתב "לא-נמדד" (כנה).

מצב-המדידה (2026-10-14, page_reader חי): **5 נמדדו · 5 לא-נמדדו** (fetch-כשל — חסומים/מוגנים).

## הרשימה (כפי-שנמסרה, בשלמותה)

| # | אתר | מצב-מדידה | מה-חולץ (מדוד) | החוק-שאומץ ל-GIANT |
|---|-----|-----------|------------------|---------------------|
| 1 | mobbin.com | **לא-נמדד** (fetch-כשל) | — | דפוסי-מסך שמושכים-משתמשים: עקביות-כרטיסים, מרווחים-שווים (44px מגע) |
| 2 | godly.website | **נמדד** | "The best design inspiration on the Internet." | ארט-דיירקשן: `.g-ambient` — זוהר-ענבר רדיאלי + גרעין-סרט (עומק-עדין) |
| 3 | awwwards.com | **נמדד** | "recognize and promote the talent… of the best developers, designers and web agencies"; בקוד-המדוד: Inter-Tight-Variable + רשת-12-עמודות | משמעת-ביצוע: focus-ring-ענבר, היררכיה-טיפוגרפית, קו-נשימה תחת-פריט-פעיל |
| 4 | cosmos.so | **לא-נמדד** (fetch-כשל) | — | לוח-השראה — מדיניות: נשמר לגל-7 (אין-למידה-אוטומטית מהתנהגות-משתמש בלי-היתר) |
| 5 | curated.design | **לא-נמדד** (fetch-כשל) | — | סידור-לפי-קטגוריות: ה-NAV-שלנו כבר-קטגורי (12-מודולים עם תיאור-חד-שורתי) |
| 6 | designspells.com | **נמדד** | "Discover micro-interactions, easter eggs, and other seemingly extra design details that infuse life, personality, and fun back into the web." | מיקרו-אינטראקציות: `.g-card` הרמת-כרטיס+זוהר-גבול · `.g-breathe` נשימת-חיים |
| 7 | 60fps.design | **נמדד** | "curated collection of UI/UX animation and interaction design details from the world's best iOS and web apps" | תנועה-חלקה: `g-view-in` 300ms ease-out-expo · `prefers-reduced-motion` תמיד |
| 8 | supahero.io | **נמדד** | "A handpicked library of stunning website hero sections designed to captivate and engage." | hero-הכניסה: הצהרה-גדולה + CTA-יחיד (שער-headcorner) + מספרים-חיים (fleet/dex/pulse) |
| 9 | saaspo.com | **לא-נמדד** (fetch-כשל) | — | דפי-SaaS + פילטרים: המסננים של TrustView/LeagueView כבר-בדפוס-הזה |
| 10 | layers.to | **לא-נמדד** (fetch-כשל) | — | פורטפוליו-מעצב-מוביל: טיפוגרפיה-דומיננטית — הוצק ב-hero (font-black + tracking-tight) |

## כללי-השימוש (מחייבים לגלים-הבאים)

1. **כל-פאנל-חדש** נולד עם: `g-card` (ריחוף-חי) + `Recipe` (חוק-prompt-motion מגל-4) + `g-scroll` אם-הרשימה-ארוכה.
2. **כל-מספר** ב-hero או בכותרת מגיע מ-API-חי — כשל = `—` (אין-מספר-מזויף; חוק-האמת קודם לכל-יופי).
3. **כל-תנועה** עוברת דרך `g-view-in` / `g-rise` / `g-breathe` — והכל מת-בכבוד תחת `prefers-reduced-motion`.
4. **אין-מודול-עיצוב-נפרד** ואין-גלריית-רפרנסים-בתוך-המוצר: הרפרנסים חיים-כאן (docs) והחוקים חיים-בקוד. אפס-כפילויות.
5. **"לא-הצלחנו להסתכל" ≠ "הסתכלנו ולא ראינו"** — 5 האתרים שלא-נמדדו רשומים כך במפורש (חוק-dsh מגל-5).

## היכן-החוקים-חיים-בקוד

- `src/app/globals.css` — §"גל-6 · חוקי-העיצוב של הענקים" (keyframes + utilities + reduced-motion).
- `src/app/page.tsx` — hero-הכניסה (supahero) · ניווט-מאויש (awwwards) · אמביינט (godly) · מעברי-תצוגה (60fps).
- החלת-עתיד: כל-קומפוננטה-חדשה-ב-`src/components/giant/` חייבת לשאת את המחלקות האלה — לא-לשכפל-CSS.
