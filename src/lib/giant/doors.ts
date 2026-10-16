/**
 * doors.ts — מפת-הדלתות × ה-API-שלהן (גל-11: "ראיה-מוצגת-על-כל-כפתור").
 * ═══════════════════════════════════════════════════════════════════════════
 * כל-כפתור-בניווט הוא דלת-חיה ל-API-מדוד; הלקוח מודד-חי כל-דלת
 * (ok · זמן-תגובה-נמדד · זמן-מדידה) ומציג-את-הראיה על-הכפתור-עצמו:
 *  · נקודה-ירוקה-נושמת = נמדד-חי-ok · אדום = כשל-כנה · אפור = טרם-נמדד.
 * המיפוי מהקוד-עצמו (fetch-map נמדד-מהמקור, גל-11) — אפס-הצהרות.
 */

export interface DoorDef {
  id: string;
  api: string;
}

export interface DoorStatus {
  ok: boolean | null;
  ms: number | null;
  at: number | null;
}

export type DoorStatusMap = Record<string, DoorStatus>;

export const DOORS: DoorDef[] = [
  { id: "submission", api: "/api/giant/books" },
  { id: "machine", api: "/api/giant/dex" },
  { id: "dex", api: "/api/giant/dex" },
  { id: "league", api: "/api/giant/league" },
  { id: "channel", api: "/api/giant/channel" },
  { id: "wallet", api: "/api/giant/dex" },
  { id: "desk", api: "/api/giant/desk" },
  { id: "capital", api: "/api/giant/capital" },
  { id: "treasury", api: "/api/giant/treasury" },
  { id: "ledger", api: "/api/giant/decisions" },
  { id: "products", api: "/api/giant/products" },
  { id: "pulse", api: "/api/giant/pulse" },
  { id: "office", api: "/api/giant/office" },
  { id: "estate", api: "/api/organism" },
  { id: "empire", api: "/api/giant/empire" },
  { id: "trust", api: "/api/giant/trust" },
  { id: "marketing", api: "/api/giant/marketing" },
];

/** מדידה-אחת של דלת: fetch עם-קצב-זמן-אמיתי; כשל = ok:false כנה */
export async function measureDoor(api: string, timeoutMs = 9000): Promise<DoorStatus> {
  const t0 = performance.now();
  try {
    const res = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const ms = Math.round(performance.now() - t0);
    let ok = res.ok;
    try {
      const j = (await res.json()) as { ok?: boolean };
      if (typeof j.ok === "boolean") ok = ok && j.ok;
    } catch {
      /* מסמך-לא-json: status מספיק */
    }
    return { ok, ms, at: Date.now() };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - t0), at: Date.now() };
  }
}

/** מדידה-מקבילית של כל-הדלתות */
export async function measureAllDoors(): Promise<DoorStatusMap> {
  const entries = await Promise.all(
    DOORS.map(async (d): Promise<[string, DoorStatus]> => [d.id, await measureDoor(d.api)]),
  );
  return Object.fromEntries(entries);
}
