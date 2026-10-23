/**
 * empire-registry.test.ts — מבחני-הרישום-הקנוני (T-584 · חוק-ה-TDD של הנחיל).
 * ═══════════════════════════════════════════════════════════════════════════
 * דטרמיניסטי לחלוטין: אפס-רשת, אפס-סביבה — הצי-הנמדד נקרא מהסנאפשוט
 * המקוממט db/trust-cache.json (הבוט-מרענן-ומחויב-אותו). כל-גלאי-חוק
 * מוכח-באמצעות-fixture-פגום-מכוון: המבחן-מוכיח-שהגלאי יורה, לא-רק-שהמפה נקייה.
 * כשל-חוק = fail-closed: רשימת-פגמים מלאה, לעולם לא שתיקה.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validateEmpireRegistry,
  empireRegistryIsCanonical,
  UNMAPPED_ALLOWLIST,
} from "./empire-registry";
import { EMPIRE_MAP, EMPIRE_GROUPS, GROUP_COLORS } from "./empire-map";
import { DOORS } from "./doors";
import { DOORS as TRANSPORT_DOORS } from "@/lib/dispatch/doors";

/** הצי-המדוד מהסנאפשוט-המקוממט (אפס-רשת — דטרמיניזם מלא) */
function cacheFleetRepos(): string[] {
  const raw = JSON.parse(
    readFileSync(path.join(process.cwd(), "db", "trust-cache.json"), "utf8"),
  ) as { entries?: Array<{ row?: { name?: string } }> };
  return (raw.entries ?? [])
    .map((e) => e.row?.name ?? "")
    .filter((n): n is string => n.length > 0);
}

describe("empire-registry — חוקי-הרישום-הקנוני (fail-closed)", () => {
  test("סכמה: לכל-רשומה תפקיד · ראיה · קבוצה-מוכרת · מודול-מוכר (המפה-האמיתית)", () => {
    const issues = validateEmpireRegistry().filter((i) =>
      ["EMPTY-ROLE", "EMPTY-EVIDENCE", "BAD-GROUP", "BAD-MODULE"].includes(i.code),
    );
    expect(issues).toEqual([]);
  });

  test("אפס-התנגשויות-רישיות — empireRoleFor חייב-להיות-חד-משמעי", () => {
    const collisions = validateEmpireRegistry().filter((i) => i.code === "CASE-COLLISION");
    expect(collisions).toEqual([]);
  });

  test("חוק-הדלתות: כל-מודול-ממופה הוא דלת-חיה בממשק", () => {
    const doorIds = new Set(DOORS.map((d) => d.id));
    for (const [key, role] of Object.entries(EMPIRE_MAP)) {
      if (role.module !== null) {
        expect(doorIds.has(role.module), `${key} → module "${role.module}" אינו דלת-חיה`).toBe(true);
      }
    }
  });

  test("חוק-הצבעים: כל-קבוצה מקבלת-צבע ב-View (אחרת-ה-View קורס)", () => {
    for (const g of EMPIRE_GROUPS) {
      expect(GROUP_COLORS[g], `קבוצה ללא-צבע: ${g}`).toBeString();
    }
    expect(GROUP_COLORS["לא-מופה"]).toBeString();
  });

  test("חוק-הכיסוי: כל-ריפו-בצי-המדוד ממופה-קנונית או רשום-בכנה ב-allowlist", () => {
    const fleet = cacheFleetRepos();
    expect(fleet.length).toBeGreaterThan(40); // הסנאפשוט עצמו סניטרי — אסור-שיתרוקן בשקט
    const issues = validateEmpireRegistry(fleet).filter((i) => i.code === "ORPHAN-REPO");
    expect(issues).toEqual([]);
  });

  test("קנוניות-מלאה: אפס-פגמים על המפה-מול-הצי-המדוד", () => {
    expect(empireRegistryIsCanonical(cacheFleetRepos())).toBe(true);
  });

  test("sanbox רשום-בכנה ב-allowlist (HTTP 409 — לא-נסרק, לא-מומצא)", () => {
    expect(UNMAPPED_ALLOWLIST["sanbox"]).toBeString();
    expect(UNMAPPED_ALLOWLIST["sanbox"]!.length).toBeGreaterThan(10);
  });

  test("גלאי-CASE-COLLISION יורה על fixture פגום-מכוון (הוכחת-הגלאי)", () => {
    const bad = {
      Foo: { role: "x", group: "ליבה-מחוברת" as const, module: null, evidence: "y" },
      FOO: { role: "z", group: "ליבה-מחוברת" as const, module: null, evidence: "w" },
    };
    const issues = validateEmpireRegistry(undefined, bad);
    expect(issues.filter((i) => i.code === "CASE-COLLISION").length).toBe(1);
  });

  test("גלאי-BAD-MODULE יורה על מודול-שאינו-דלת (הוכחת-הגלאי)", () => {
    const bad = {
      Ghost: { role: "x", group: "ליבה-מחוברת" as const, module: "לא-דלת" as never, evidence: "y" },
    };
    const issues = validateEmpireRegistry(undefined, bad);
    expect(issues.filter((i) => i.code === "BAD-MODULE").length).toBe(1);
  });

  test("גלאי-EMPTY-EVIDENCE יורה על רשומה-בלי-ראיה (חוק: אסור-להמציא)", () => {
    const bad = {
      NoProof: { role: "x", group: "ליבה-מחוברת" as const, module: null, evidence: "   " },
    };
    const issues = validateEmpireRegistry(undefined, bad);
    expect(issues.filter((i) => i.code === "EMPTY-EVIDENCE").length).toBe(1);
  });

  test("גלאי-BAD-GROUP יורה על קבוצה-לא-מוכרת (הוכחת-הגלאי)", () => {
    const bad = {
      Odd: { role: "x", group: "קבוצה-בדויה" as never, module: null, evidence: "y" },
    };
    const issues = validateEmpireRegistry(undefined, bad);
    expect(issues.filter((i) => i.code === "BAD-GROUP").length).toBe(1);
  });

  test("גלאי-ORPHAN-REPO יורה על ריפו-צי-חסר-מיפוי (הוכחת-הגלאי)", () => {
    const issues = validateEmpireRegistry(["definitely-not-mapped-repo"]);
    expect(issues.filter((i) => i.code === "ORPHAN-REPO").length).toBe(1);
    // ה-allowlist מגן-בכנה:
    expect(validateEmpireRegistry(["sanbox"]).length).toBe(0);
  });
});

describe("חוקי-התיאום-בין-סוכנים (סבב-19.81 — הגבול-מול dispatch-kernel וחוק-מקור-האמת)", () => {
  test("חוק-אי-הסטייה: union-המודולים המקובל-באוכיף שווה-בדיוק לדלתות-ה-NAV החיות (אפס-עודף, אפס-חסר)", () => {
    // סטייה-נמדדה-חיה: MODULE_UNION היה-13 מול 16 דלתות (capital/empire/marketing חסרים) —
    // מפה-עתידית-שתמפה-אליהם הייתה-נופלת BAD-MODULE על-אף-דלת-חיה.
    // התיקון: האוכיף נגזר-מ-DOORS עצמו (מקור-אמת-יחיד) — המבחן-נועל-את-השוויון.
    const doorIds = new Set(DOORS.map((d) => d.id));
    for (const door of DOORS) {
      // כל-דלת-NAV חיה חייבת-להתקבל-כמודול-חוקי (מפה-עתידית-רשאית-להשתמש-בה)
      const issues = validateEmpireRegistry(undefined, {
        Probe: { role: "x", group: "ליבה-מחוברת" as const, module: door.id as never, evidence: "y" },
      }).filter((i) => i.code === "BAD-MODULE");
      expect(issues, `דלת "${door.id}" חיה אך נדחית-כמודול`).toEqual([]);
    }
    // והכיוון-ההפוך: המפה-האמיתית אינה-ממפה-אל-מודול-שאינו-דלת
    for (const [key, role] of Object.entries(EMPIRE_MAP)) {
      if (role.module !== null) expect(doorIds.has(role.module), key).toBe(true);
    }
  });

  test("חוק-הגבול: דלתות-NAV (id,api) ודלתות-תעבורה (port,prefix) הן-שני-תחומים-נפרדים-במכוון", () => {
    // מלכודת-שנמדדה-חיה: שני-המודולים מייצאים בשם DOORS — סוכן-שיחליף-ביניהם
    // יקרוס-את-חוק-המודולים. הגבול-עצמו נאכף-כאן (§7A — תחומים-מוכרזים):
    const nav = DOORS as unknown as Array<Record<string, unknown>>;
    expect(nav.length).toBeGreaterThan(10);
    for (const d of nav) {
      expect(typeof d.id).toBe("string");          // NAV: מזוהה-id
      expect(typeof d.api).toBe("string");         // NAV: נושא-API-פנימי
      expect(d.port, "דלת-NAV לא נושאת port — זה תחום-התעבורה").toBeUndefined();
      expect(d.prefix, "דלת-NAV לא נושאת prefix — זה תחום-התעבורה").toBeUndefined();
    }
    for (const d of TRANSPORT_DOORS) {
      expect((d as unknown as Record<string, unknown>).id, "דלת-תעבורה לא נושאת id — זה תחום-ה-NAV").toBeUndefined();
      expect(typeof d.port).toBe("number");        // תעבורה: מזוהה-port
      expect(typeof d.prefix).toBe("string");
    }
  });

  test("חוק-מנוע-יחיד: סולם-התעבורה נושא בדיוק דלת-מנוע אחת (3040 · engine) — אמת-המנוע משטח-אחד", () => {
    const engineDoors = TRANSPORT_DOORS.filter((d) => (d as { engine?: unknown }).engine === true);
    expect(engineDoors.length).toBe(1);
    expect((engineDoors[0] as unknown as { port: number }).port).toBe(3040);
    // והרגיסטרי עצמו נשאר קנוני-מלא על הצי-המדוד (שלם-ותקין אחרי-הגבול-המוכרז)
    expect(empireRegistryIsCanonical(cacheFleetRepos())).toBe(true);
  });
});
