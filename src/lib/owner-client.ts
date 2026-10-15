"use client";

// giant · עזר-לקוח-מאוחד לפעולות-בעלים (headcorner)
// האסימון הנגזר (SHA-256, לא הסוד) נשמר-localStorage ועובר בכותרת x-giant-owner
// — תמיכת-iframe: העוגייה HttpOnly נחסמת בתצוגה-מוטמעת, הכותרת עוברת תמיד.

const TOKEN_KEY = "giant_owner_token";

export function saveOwnerToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // אחסון-חסום — העוגייה-בלבד תמשיך-לעבוד
  }
}

export function clearOwnerToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // לא-קריטי
  }
}

export function ownerHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { "x-giant-owner": t } : {};
  } catch {
    return {};
  }
}

/** fetch עם כותרות-בעלים — לכל פעולה שמזיזה כסף או מנהלת-את-המערכת */
export async function ownerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), ...ownerHeaders() },
  });
}
