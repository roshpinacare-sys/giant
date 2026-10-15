/**
 * books-types.ts — טיפוסי-דלת-ארבעת-הספרים (גל-9).
 * מופרד-מה-route-בכוונה: לקוח-מייבא-מכאן בלבד — איסור-מוחלט לייבא
 * מקובץ-route (מושך node:fs לגרף-הלקוח ושובר-את-כל-ה-build — כשל-נמדד-גל-9).
 */

export interface BookFacts {
  k: string;
  v: string;
}

export interface BookPayload {
  book: string;
  role: string;
  ok: boolean;
  note?: string;
  headline: string | null;
  facts: BookFacts[];
  fetchedAt: string | null;
}

export interface BooksPayload {
  ok: boolean;
  books: BookPayload[];
  fetchedAt: string;
}
