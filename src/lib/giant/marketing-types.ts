/**
 * marketing-types.ts — טיפוסי-החוזה של דלת-השיווק החיה (גל-11).
 * חוק-books-types חל כאן: הלקוח מייבא טיפוסים **מקובץ-הטיפוסים הזה בלבד** —
 * איסור-מוחלט לייבא טיפוסים מקבצי-route (נמדד: 500-קולקטיבי, גל-9).
 * מה שכתוב בריפו = מה שמוצג: ה-API מחזיר טקסט-מילולי-מהמקור (verbatim), אפס-סינתזה.
 */

export interface MarketingSection {
  /** כותרת-הסעיף מהמקור (## ...) — null לפתיח-הקובץ לפני-הכותרת-הראשונה */
  h: string | null;
  /** הטקסט המילולי של הסעיף (markdown גולמי — התצוגה מרנדרת-בלבד, לא-מפרשת) */
  text: string;
}

export interface MarketingFile {
  file: string;
  he: string;
  ok: boolean;
  note?: string;
  /** גודל-הקובץ-הנמדד בבייטים (מהמקור-החי) */
  bytes: number | null;
  /** כותרת-ה-# הראשונה בקובץ — מילולית */
  headline: string | null;
  /** שורת-ה-אמת (>) הראשונה — מילולית */
  quote: string | null;
  sections: MarketingSection[];
  fetchedAt: string | null;
}

export interface MarketingPayload {
  ok: boolean;
  files: MarketingFile[];
  fetchedAt: string;
  /** הצהרת-שקיפות קבועה — מוצגת-כמו-שהיא בדלת */
  note: string;
}
