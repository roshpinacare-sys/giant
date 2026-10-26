# doc-truth-sync — אמת-תיעוד מדודה (:3062)

§4 ULTIMATE DIRECTIVE: census + re-index + legacy-archive isolation ל-giant/Domain/github.io.

- **ליבה טהורה**: census.ts (מסווג-דומם/חי/אוטומט עם שעון-מוזרק) · convergence.ts (מניפסט-בידוד DECISIONS #42/#43) · receipts.ts (SAOS-DOC-TRUTH/1 שרשרת-השיש)
- **I/O אמיתי**: collect.ts (git log ∪ ls-files — חוק-השלמות: דוממים-בחלון לא נעלמים)
- **איבר**: index.ts — :3062 `/health` `/census` `/isolation` `POST /receipt` · `--once` לריצת-הוכחה

```bash
bun test .                                   # 49 בדיקות
DOC_TRUTH_ROOT=/repo DOC_TRUTH_INCLUDE="*.md" bun index.ts --once
bun index.ts                                 # שרת :3062
```

חוקים: אפס-מוקס/סטאב/TODO · fail-closed (שעון-לפני-commit זורק) · מאוטומטים-מוצהרים בלבד · אפס-תלות-רשת בליבה.
