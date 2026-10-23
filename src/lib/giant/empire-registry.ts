/**
 * empire-registry.ts — האוכיף-הדטרמיניסטי של-הרישום-הקנוני (T-584 · נתיב WS-1).
 * ═══════════════════════════════════════════════════════════════════════════
 * מנדט-הנחיל (§7A): giant הוא-הרישום-הקנוני-היחיד; כל-ספר-נרשם-עם-ראיה.
 * empire-map.ts מכריז על חוקיו-שלו ("אסור-להמציא חיבור" · "התאמה-לא-תלוית-
 * רישיות") — המודול-הזה הופך-את-ההכרזות-לחוק-נאכף: כל-הפרה = פגם-מקודד,
 * ו-fail-closed: אפס-שתיקה, כל-פגם נושא-קוד-ומפתח-ופירוש.
 *
 * חוקי-האכיפה:
 *  1. EMPTY-ROLE / EMPTY-EVIDENCE — סכמה: תפקיד וראיה קיימים ולא-ריקים.
 *  2. BAD-GROUP — הקבוצה חייבת-להיות-אחת מ-EMPIRE_GROUPS.
 *  3. BAD-MODULE — המודול חייב-להיות-null או דלת-חיה ב-DOORS (חוזה-הממשק).
 *  4. CASE-COLLISION — שני-מפתחות-שווים-ללא-רישיות = עמימות ב-empireRoleFor
 *     (המפה-עצמה-מצהירה התאמה-לא-תלוית-רישיות — עמימות = רישום-שבור).
 *  5. UNCOLORED-GROUP — קבוצה-ללא-צבע מפילה את ה-View.
 *  6. ORPHAN-REPO — ריפו-בצי-המדוד בלי-מיפוי-ובלי-רישום-כנה ב-allowlist.
 *     (הכיוון-ההפוך — "רוח-רפאים": רשומה-שאינה-בצי — מדווח ע"י סריקת-הצי,
 *     לא כאן: המפה מתעדת-גם-מוזגים/קפואים שאינם-בפליט-הסריקה-השוטף.)
 *
 * דטרמיניזם: אפס-רשת, אפס-סביבה, אפס-תלויות-חוץ — קלט-אופציונלי
 * (רשימת-הצי) ומפה-אופציונלית (ברירת-מחדל: הקנון) לשם-הוכחת-הגלאים.
 */
import { EMPIRE_MAP, EMPIRE_GROUPS, GROUP_COLORS, type EmpireGroup, type EmpireRole } from "./empire-map";
// דלתות-NAV של הממשק-המאוחד ({id, api}) — לא-להתבלבל-עם דלתות-התעבורה של
// dispatch-kernel (../dispatch/doors.ts — {port, prefix}, סולם 3040→3100→3200).
// הגבול-בין-התחומים נאכף-במבחן (חוק-הגבול, empire-registry.test.ts).
import { DOORS as NAV_DOORS } from "./doors";

/** ריפו-ים-שנשארים-מחוץ-למפה-בכנה-ומפורש — הסיבה-המדודה-חייבת-להופיע */
export const UNMAPPED_ALLOWLIST: Record<string, string> = {
  sanbox: "HTTP 409 — לא נסרק כנה (גל-45); מוצג-דרך-המדידה-החיה בלבד, בלי-המצאה",
};

export type RegistryIssueCode =
  | "EMPTY-ROLE"
  | "EMPTY-EVIDENCE"
  | "BAD-GROUP"
  | "BAD-MODULE"
  | "CASE-COLLISION"
  | "UNCOLORED-GROUP"
  | "ORPHAN-REPO";

export interface RegistryIssue {
  code: RegistryIssueCode;
  key: string | null;
  detail: string;
}

/**
 * מקור-אמת-יחיד למודולים-חוקיים: הדלתות-החיות-עצמן (NAV_DOORS).
 * רשימה-מקודדת-ידנית (MODULE_UNION) נמחקה — נמדדה-בה-סטייה-חיה
 * (13-מקודד מול 16-דלתות חיות: capital/empire/marketing חסרים,
 * מפה-עתידית-אליהם הייתה-נופלת BAD-MODULE על-אף-דלת-חיה).
 * הטיפוס EmpireRole.module מראה-את-ה-union-המלא; הריצה-נגזרת-מכאן.
 */
const DOOR_IDS: ReadonlySet<string> = new Set(NAV_DOORS.map((d) => d.id));

export function validateEmpireRegistry(
  fleetRepos?: readonly string[],
  map: Record<string, EmpireRole> = EMPIRE_MAP,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const doorIds = DOOR_IDS;

  /* 1-3: סכמה · קבוצה · מודול-דלת */
  for (const [key, role] of Object.entries(map)) {
    if (!role || typeof role.role !== "string" || role.role.trim() === "") {
      issues.push({ code: "EMPTY-ROLE", key, detail: "תפקיד-ריק או חסר" });
    }
    if (typeof role?.evidence !== "string" || role.evidence.trim() === "") {
      issues.push({ code: "EMPTY-EVIDENCE", key, detail: "ראיה-חסרה — אסור-להמציא חיבור" });
    }
    if (!EMPIRE_GROUPS.includes(role?.group as EmpireGroup)) {
      issues.push({ code: "BAD-GROUP", key, detail: `קבוצה-לא-מוכרת: ${String(role?.group)}` });
    }
    const m = role?.module ?? null;
    if (m !== null && !doorIds.has(m)) {
      issues.push({ code: "BAD-MODULE", key, detail: `אין-דלת-חיה עבור המודול: ${String(m)}` });
    }
  }

  /* 4: התנגשויות-רישיות (fail-closed — עמימות-זיהוי = רישום-שבור) */
  const seen = new Map<string, string>();
  for (const key of Object.keys(map)) {
    const low = key.toLowerCase();
    const prev = seen.get(low);
    if (prev !== undefined && prev !== key) {
      issues.push({ code: "CASE-COLLISION", key, detail: `שווה-ללא-רישיות למפתח הקיים "${prev}"` });
    }
    seen.set(low, key);
  }

  /* 5: צבעי-קבוצות (חוזה-ה-View) */
  for (const g of EMPIRE_GROUPS) {
    if (!GROUP_COLORS[g]) {
      issues.push({ code: "UNCOLORED-GROUP", key: g, detail: "קבוצה-ללא-צבע ב-GROUP_COLORS" });
    }
  }

  /* 6: כיסוי-הצי (כאשר סנאפשוט-הצי נמסר) */
  if (fleetRepos) {
    const mapped = new Set(Object.keys(map).map((k) => k.toLowerCase()));
    const allowed = new Set(Object.keys(UNMAPPED_ALLOWLIST).map((k) => k.toLowerCase()));
    for (const repo of fleetRepos) {
      if (!repo) continue;
      const low = repo.toLowerCase();
      if (!mapped.has(low) && !allowed.has(low)) {
        issues.push({
          code: "ORPHAN-REPO",
          key: repo,
          detail: "ריפו-בצי-המדוד ללא-מיפוי-קנוני וללא-רישום-כנה ב-allowlist",
        });
      }
    }
  }

  return issues;
}

/** פסק-דין-אחד: האם-הרישום-קנוני (אפס-פגמים)? — לשימוש-CI/שערי-מיזוג */
export function empireRegistryIsCanonical(fleetRepos?: readonly string[]): boolean {
  return validateEmpireRegistry(fleetRepos).length === 0;
}
