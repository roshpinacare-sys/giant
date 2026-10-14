import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/office/world — פרוקסי-כנה לעולם הקנוני (Domain/office/world-state.json).
 * המצב-הקנוני חי בגריד הציבורי; הקונסולה לא מחזיקה עותק-שידור משלה אלא
 * מושכת את הפעימה האחרונה. כשל = כנה (502 עם סיבה), בלי עותק-מזויף.
 */
const CANON_URL = 'https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-state.json';

export async function GET() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(CANON_URL + '?_=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'canon unavailable', status: res.status }, { status: 502 });
    }
    const world = await res.json();
    return NextResponse.json(world, { headers: { 'cache-control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'canon fetch failed', detail: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
