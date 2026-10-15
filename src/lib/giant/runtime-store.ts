/**
 * runtime-store — מאגר-ריצה-מחוץ-עץ-הפרויקט (מיזוג-גיאנט · תיקון-לולאת-ההידור)
 *
 * הבעיה-שנמדדה: כל-כתיבה-לקובץ-בתוך-עץ-הפרויקט (db/*.json) מזיזה-את-ה-watch
 * של-Turbopack → בנייה-מחדש → טעינה-מלאה-של-הדף → מדידת-דלתות-מחדש → כתיבה
 * שוב = לולאה-אינסופית-של-רענונים-ששוברת-את-מצב-הממשק.
 *
 * הפתרון: מטמוני-ריצה חיים-מחוץ-לעץ (‫/home/z/.giant-runtime‬) — בלי-עיניים-עליהם.
 * קריאה: קובץ-ריצה קודם; אם-אין — קובץ-הקנון-בתוך-העץ (מה שהפעימה-דחפה-לגיט).
 * אפס-שינוי-חוזה: אותם-JSON-ים, אותם-שדות, רק-המקום-והדיסציפלינה-חדשים.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const RUNTIME_DIR = process.env.GIANT_RUNTIME_DIR?.trim() || "/home/z/.giant-runtime";

export function runtimePath(name: string): string {
  return path.join(RUNTIME_DIR, name);
}

/** קריאה: מאגר-הריצה קודם, ואז-הקנון-בתוך-העץ (fallback כנה) */
export async function readRuntimeOrCanon<T>(name: string, canonAbsPath: string): Promise<T | null> {
  for (const p of [runtimePath(name), canonAbsPath]) {
    try {
      if (!existsSync(p)) continue;
      return JSON.parse(await readFile(p, "utf8")) as T;
    } catch {
      /* קובץ-שבור = כאילו-אין — הבא-בתור */
    }
  }
  return null;
}

/** כתיבה-ממושמעת: רק-אם-התוכן-באמת-השתנה (מונע-רענוני-שווא) */
export async function writeRuntimeIfChanged(name: string, value: unknown): Promise<boolean> {
  const p = runtimePath(name);
  try {
    const next = JSON.stringify(value);
    try {
      if (existsSync(p) && JSON.stringify(JSON.parse(await readFile(p, "utf8"))) === next) return false;
    } catch {
      /* ישן-שבור = כותבים-מחדש */
    }
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, next, "utf8");
    return true;
  } catch {
    return false; /* כשל-מטמון לא מזייף-מדידה */
  }
}
