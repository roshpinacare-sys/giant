# tools/office3d-r3f — החדר המקצועי כ-bundle סטטי (R58)

המשרד החי היחיד: אותו קוד-מקור כמו האפליקציה (`src/components/hq` + `src/lib/hq`),
נבנה ב-vite ל-bundle עצמאי ללא-Next — מוגש ב-`Domain/office3d/` וב-`office-pages`.

## בנייה

```bash
bun run office3d:build     # vite → dist-office3d + models + favicon
```

## CSS

`office.css` מקומפל מראש מ-`office-src.css` (Tailwind v4 CLI על רכיבי-hq).
**אחרי כל שינוי-מחלקות ברכיבי-hq יש לרגנרק:**

```bash
bunx @tailwindcss/cli -i tools/office3d-r3f/office-src.css -o tools/office3d-r3f/office.css --minify
```

ה-CI לא מריץ Tailwind — ה-CSS הבנוי מוגש ב-commit (דטרמיניזם-בייק).

## חוזה-הבייק (office-3d-bake.mjs)

החדר חושף `window.__hqRoomReady` (נמדד מהרנדרר: draw-calls > 6), `window.__hq`
(gl/scene/camera) ומגיב לאירועי `hq-camera-preset` — אותו חוזה-כנות של הבייק
ההיסטורי: אין פריימי-מקום, כשל = קבלת-כשל.
