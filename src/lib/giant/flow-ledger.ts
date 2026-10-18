/**
 * T70 · פנקס-הזרימה — הזיכרון-העצמי-הכנה של-המערכת.
 *
 * החוק: כל-רשומה-היא מדידה-אמיתית-שנעשתה-בפועל (גובה-השרשרת + חתימת-הסנאפשוט
 * savedAt + זמן-המדידה). אפס-זריעה-ידנית, אפס-שחזור-רטרואקטיבי — הפנקס
 * נכתב-רק-על-ידי-המדידות-החיות-עצמן, וההתקדמות-שהוא-מראה היא-הפרש-בין-שתי-
 * מדידות-אמיתיות-ולא-הנחה.
 *
 * fail-honest: קריאה-כושלת = null · כתיבה-כושלת = כנה (false) · אפס-סודות.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FlowTrajectory, FlowTrajectoryEntry } from "@/lib/giant/flow-types";

const LEDGER = path.join("/home/z", "my-project", "db", "flow-ledger.json");
const CAP = 500; // מספיק-לימים-של-דופק-שעתי; הפנקס-לא-בלון

let lastWriteAt = 0; // חנק-כתיבה: לפחות 5 שניות בין-רישומים (מניעת-מירוץ-בין-נקודות-הקצה)

async function loadEntries(): Promise<FlowTrajectoryEntry[]> {
  try {
    const raw = await fs.readFile(LEDGER, "utf8");
    const j = JSON.parse(raw) as { entries?: FlowTrajectoryEntry[] };
    return Array.isArray(j.entries) ? j.entries : [];
  } catch {
    return [];
  }
}

function entryId(e: FlowTrajectoryEntry): string {
  return e.savedAt ?? `h${e.height}`;
}

/** רישום-מדידה-חיה. תוצאה-כנה: נרשם / זהה-לקודם / חנוק-בזמן / נכשל. */
export async function recordMeasurement(
  height: number,
  savedAt: string | null,
  measuredAt: string,
): Promise<"recorded" | "duplicate" | "throttled" | "failed"> {
  try {
    if (!Number.isFinite(height)) return "failed";
    if (Date.now() - lastWriteAt < 5_000) return "throttled"; // חנק — כנה-ושקט
    const entries = await loadEntries();
    const fresh: FlowTrajectoryEntry = { measuredAt, height, savedAt };
    const last = entries[entries.length - 1];
    if (last && entryId(last) === entryId(fresh)) return "duplicate"; // אותו-סנאפשוט — אין-רשומה-כפולה
    entries.push(fresh);
    while (entries.length > CAP) entries.shift();
    await fs.writeFile(LEDGER, JSON.stringify({ entries }, null, 1), "utf8");
    lastWriteAt = Date.now();
    return "recorded";
  } catch {
    return "failed";
  }
}

/** מסלול-הזרימה — ההתקדמות-בין-שתי-המדידות-האמיתיות-הראשונה-והאחרונה-שנשמרו.
 * כנות: פחות-משתי-רשומות = delta null (לא-0 — 0 מרמז-על-עצירה; null אומר "טרם-נמדד").
 * T71 · recent = הקצה-האחרון-של-הפנקס (עד-24 מדידות-אחרונות, סדר-כרונולוגי) —
 * הזיכרון-העצמי-הופך-נראה; הגרף-ניזון-רק-ממדידות-שנרשמו-בפועל. */
export async function readTrajectory(): Promise<FlowTrajectory> {
  const entries = await loadEntries();
  const first = entries[0] ?? null;
  const last = entries[entries.length - 1] ?? null;
  const measurable = entries.length >= 2 && first && last;
  const deltaHeight =
    measurable && Number.isFinite(first.height) && Number.isFinite(last.height)
      ? last.height - first.height
      : null;
  const deltaMinutes = measurable
    ? Math.floor((Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / 60_000)
    : null;
  return { entries: entries.length, first, last, deltaHeight, deltaMinutes, recent: entries.slice(-24) };
}
