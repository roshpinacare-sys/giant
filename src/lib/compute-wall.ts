/**
 * compute-wall — מודעות-חומת-המחשוב-החוץ (T75-c · "הריבונות-מודעת-להתראות-שלה")
 * ══════════════════════════════════════════════════════════════════════════
 * המצב: דקות-Actions של הריפו-הפרטיים אזלו (13.10 · ~95 מיילי-חסימה ביום) →
 * הרשת חנתה-את-עצמה (18 ריפו · רחובת compute-rearm על דקות-ציבוריות) ומודדת
 * את-החומה כל-6ש׳ ע"י compute-canary. הפגם-שנמדד: כל-בדיקה מול-חומה-סגורה =
 * ריצת-0-step = failure = מייל-כשל לבעלים (×4 ביום) — גם-כשהכל-בסדר.
 *
 * התיקון-הפנימי: משטח-מודעות. הלדגר-והיומן של הריבונות עצמה הם ציבוריים
 * (Autonomy) → נקראים-מכאן בלי-טוקן. fail-honest: כישלון-שליפה = null-כנה +
 * errors[], לעולם-לא-ירוק-מזויף.
 */
import { execFile } from "node:child_process";

export interface ComputeWallState {
  /** החומה-סגורה? (parked=true + canary failure אחרון) — null = לא-נמדד */
  walled: boolean | null;
  parkedAt: string | null;
  parkedCount: number | null;
  lastCanaryAttempt: string | null;
  canaryConclusion: string | null;
  lastJournalEvent: string | null;
  lastJournalTs: string | null;
  /** כמה זמן מאז הבדיקה האחרונה (שניות) */
  sinceLastProbeS: number | null;
  /** הסבר-כנה-בעברית לבעלים: מה כל מייל אומר */
  he: string;
  errors: string[];
  measuredAt: string;
}

const LEDGER_URL =
  "https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/agents/compute-park-ledger.json";
const JOURNAL_URL =
  "https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/agents/compute-journal.jsonl";

async function curlText(url: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "curl",
      ["-s", "-m", String(Math.ceil(timeoutMs / 1000)), "--compressed", url],
      { timeout: timeoutMs, maxBuffer: 1_000_000 },
      (err, stdout) => resolve(err ? null : stdout || null),
    );
  });
}

export async function measureComputeWall(timeoutMs = 6000): Promise<ComputeWallState> {
  const errors: string[] = [];
  const measuredAt = new Date().toISOString();

  let ledger: {
    parkedAt?: string;
    repos?: string[];
    lastCanaryAttempt?: string;
    cooldownHours?: number;
    armed?: boolean;
  } | null = null;
  let journalTail: { ts?: string; event?: string } | null = null;

  const [ledgerRaw, journalRaw] = await Promise.all([
    curlText(LEDGER_URL, timeoutMs),
    curlText(JOURNAL_URL, timeoutMs),
  ]);

  if (!ledgerRaw) errors.push("ledger-fetch-failed");
  else {
    try {
      ledger = JSON.parse(ledgerRaw);
    } catch {
      errors.push("ledger-parse-failed");
    }
  }
  if (!journalRaw) errors.push("journal-fetch-failed");
  else {
    const lines = journalRaw.trim().split("\n");
    const last = lines[lines.length - 1];
    try {
      journalTail = JSON.parse(last);
    } catch {
      errors.push("journal-parse-failed");
    }
  }

  const canaryConclusion =
    journalTail?.event === "still-walled"
      ? "failure"
      : journalTail?.event === "canary-green" || journalTail?.event === "wall-open"
        ? "success"
        : null;

  let walled: boolean | null = null;
  if (ledger && journalTail) {
    walled = Boolean(ledger.parkedAt) && journalTail.event === "still-walled";
  }

  let sinceLastProbeS: number | null = null;
  if (ledger?.lastCanaryAttempt) {
    const t = Date.parse(ledger.lastCanaryAttempt);
    if (!Number.isNaN(t)) sinceLastProbeS = Math.round((Date.now() - t) / 1000);
  }

  const he =
    walled === true
      ? "חומת-החיוב של דקות-Actions הפרטיות סגורה — הרשת חונה-את-עצמה (18 ריפו) וממשיכה על מחשוב-פנימי-מקומי + דקות-ציבוריות. מייל-canary כל-~6ש׳ = בדיקה-מתוזמנת-של-הריבונות, לא-תקלה-חדשה."
      : walled === false
        ? "החומה נפתחה — הרשת מתעוררת בשלבים (sentinel ירוק קודם)."
        : "מצב-החומה לא-נמדד כרגע (כישלון-שליפה-כנה) — אין-להכריז-ירוק-או-אדום.";

  return {
    walled,
    parkedAt: ledger?.parkedAt ?? null,
    parkedCount: Array.isArray(ledger?.repos) ? ledger!.repos!.length : null,
    lastCanaryAttempt: ledger?.lastCanaryAttempt ?? null,
    canaryConclusion,
    lastJournalEvent: journalTail?.event ?? null,
    lastJournalTs: journalTail?.ts ?? null,
    sinceLastProbeS,
    he,
    errors,
    measuredAt,
  };
}
