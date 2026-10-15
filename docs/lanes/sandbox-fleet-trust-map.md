# sandbox-fleet-trust-map — wave 5 (Task 45)

trace: מפת-האמון של הצי · מחזור: בחינת-מקורות → תכנון → ביצוע → בדיקה → הפעלה

## מה הבעלים ביקש
"תמשיך · בחן גם https://skillry.dev/ai-videos/opus-5-5 וגם
https://github.com/awesome-dsh-plugin/awesome-dsh-plugin · חשוב שיהיה
מקצועי ומושקע מאוד ביכולות."

## מה נלמד מהמקורות (ונאומץ)
- **awesome-dsh-plugin (dsh-trust-check)**: מתודולוגיית סריקת-אמון —
  (1) המדידה היא **חשיפה, לעולם לא פסק-דין** (אף-שורה לא כותבת "בטוח");
  (2) "לא הצלחנו להסתכל" ≠ "הסתכלנו ולא ראינו" — רק-אחד-מהם אמת, וכשל
  מוצג כ-unscanned עם-השגיאה-עצמה, לעולם לא ריק-כהוכחת-ניקיון;
  (3) הסקאנר לא מריץ-קוד ולא פותח-sockets — קורא-עץ-גיט ומדווח file:line;
  (4) incremental RECHECK: נסרק מחדש רק-מה-שנדחף-אחרי-הסריקה שלו.
- **skillry/opus-5-5**: הצהרה-מול-תוצר **זה-מול-זה**, הראיה-המדויקת
  להעתקה-חופשית, קטגוריות-מסופרות.

## מה נבנה (הכל חי · אפס-סימולציה)
- `app/src/lib/giant/trust-scan.ts` — saos-trust-check@0.1.0:
  עץ-גיט (trees?recursive=1) לכל-ספר → capabilities (api/front/db/
  workflows/docs/tests/scripts) + signals (נתיבי-mock/fake/sim/placeholder/
  stub/sample/todo) + redLines (קבצי-סודות-פוטנציאליים — **שמות-נתיבים
  בלבד, תוכן לעולם לא נקרא**); deep-scan נקודתי (≤12 קבצים × ≤24KB,
  file:line בלבד); מטמון db/trust-cache.json + RECHECK.
- `app/src/lib/giant/fleet.ts` — מנוע-הצי מופשט מה-route (שימוש-משותף,
  בלי-כפילות).
- `app/src/app/api/giant/trust/route.ts` — GET (?deep=<repo> · ?force=1).
- `app/src/components/giant/TrustView.tsx` — המודול "האמון": פס-מדידה,
  קטגוריות-מסופרות, זה-מול-זה "מה-הספר-מצהיר מול מה-נמדד", העתקת-ראיה
  מדויקת, deep-scan, מסננים, Recipe (חוק prompt-motion).
- חיווט: NAV (page.tsx) + פלטת Ctrl+K + מובייל.

## מדידות-קבלה (נמדדו-חי בסנדבוקס)
- סריקה ראשונה: **39 ספרים · 38 נסרקו · 1 לא-נבדק (sanbox — HTTP 409,
  מוצג-כנה) · 82 סימנים · 30 קווים-אדומים**.
- deep-scan (steem): 12 קבצים · 33,595 בתים נקראו · 0 ממצאים — "הסתכלנו
  ולא ראינו" (משפט-מדוד, שונה-מ-"לא הצלחנו להסתכל").
- E2E דפדפן: המפה חיה · הרחבת-שורות · deep-scan חי · העתקת-ראיה
  ("הועתק") · מסננים (לא-נבדקו → sanbox בלבד) · מובייל-390 תקין ·
  lint נקי · אפס-שגיאות-קונסולה.

## תקלות-שנתפסו-ותוקנו
1. import-צולב route↔lib (Turbopack אינו מאשר) → מנוע-הצי הופשט
   ל-lib/giant/fleet.ts.
2. deep-scan קודד ref=main → steem (ענף-אחר) החזיר 0-קבצים → הענף
   האמיתי עובר-דרך TrustRow.branch.
3. סינון-מועמדים ל-ts/js בלבד → ספרי C++/Python לא נבדקו → הורחב
   (py/cpp/go/rs/…).
4. סביבת-הסנדבוקס: `setsid nohup bun run dev` מת-אחרי-~15ש׳ (וגם
   OOM-kill אחד של next-server ב-1.4GB) → הדפוס העובד:
   `(bun run dev > dev.log 2>&1 &)` ב-shell המתמשך.

## לליינים-המקבילים
- `/api/giant/trust` זמין-לכל-הצי; `saos-trust-check` הוא הסטנדרט
  לחשיפת-אמון — הוסיפו-כללים, אל-תשכפלו-סקאנרים.
- החוק: חשיפה≠פסק-דין · לא-נבדק≠נקי · file:line בלבד · אפס-תוכן-סודות.
