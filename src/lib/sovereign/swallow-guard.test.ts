/**
 * swallow-guard.test.ts — מבחני-מגן-הבליעות (§8 deadlock-break · חוק-ה-TDD של הנחיל).
 * ═════════════════════════════════════════════════════════════════════════════
 * המחלקה-שנמדדה-חיה: ours-merge vault-sync בולע-קבצי-קנון שנחתו-ב-main
 * (היום: identity-guard.yml/swallow-watch.yml נבלעו-פעמיים, empire-registry
 * נבלע-וחולץ). המגן = נוכחות-קבוצת-הקנון ב-tip; היעדרות = בליעה-מוכחת;
 * שינוי-תוכן = התראה-בלבד (המגן-לא-נלחם-באבולוציה-לגיטימית של הלהקה).
 * דטרמיניזם מלא: אפס-שעון, אפס-רשת, אפס-RNG — הזמן-נכנס-כקלט מהקורא.
 * fail-closed: תוכנית-שחזור לעולם-לא-ממציאה-תוכן — רק-מ-blob-מאומץ-ידוע.
 */
import { describe, test, expect } from "bun:test";
import {
  CANONICAL_SET,
  detectSwallows,
  rescuePlan,
  guardReceipt,
  verifyReceiptChain,
  type Swallow,
  type ContentAlert,
} from "./swallow-guard";

/** עץ-מלא: כל-נתיבי-הקנון קיימים (sha-ים-יציבים-כלשהם) */
function fullTree(): Record<string, string> {
  const t: Record<string, string> = {};
  for (const p of CANONICAL_SET) t[p] = "sha-" + p.length.toString(16).padStart(4, "0");
  return t;
}

describe("swallow-guard — חוקי-המגן (fail-closed)", () => {
  test("עץ-מלא → אפס-בליעות ואפס-התראות (שלם-ותקין)", () => {
    const r = detectSwallows(fullTree());
    expect(r.swallows).toEqual([]);
    expect(r.alerts).toEqual([]);
  });

  test("עץ-ריק → כל-נתיבי-הקנון מדווחים-בליעה (המחלקה-הממשית: ours-merge)", () => {
    const r = detectSwallows({});
    expect(r.swallows.length).toBe(CANONICAL_SET.length);
    for (const p of CANONICAL_SET) {
      expect(r.swallows.find((s) => s.path === p)).toBeDefined();
    }
    expect(r.swallows.every((s) => s.code === "SWALLOWED-PATH")).toBe(true);
  });

  test("חוזה-המדידה-השקרן (נתפס-חי 16:32Z): measure_tip מזרים \"\" לנעדר — הליבה חייבת לסווג זאת כבליעה, לא-כדריפט-תוכן", () => {
    // האמדן-החי: ב-tip 6dcdaae7c המגן רשם "9 content-drift ALERTS" במקום
    // 9 SWALLOWED-PATH — כי measure_tip הזרים "" והליבה סיווגה "" כתוכן-שונה.
    // התוצאה-החיה: אף-חילוץ-לא-ירד על-9 קבצי-קנון נעדרים-ממש. החוק-המתוקן:
    // "" (והיעדר-מפתח) = היעדרות-מוכחת → SWALLOWED-PATH, לעולם-לא ALERT.
    const t = fullTree();
    t["src/lib/giant/empire-registry.ts"] = "";
    t["src/lib/giant/empire-registry.test.ts"] = "";
    t["src/lib/dispatch/doors.ts"] = "";
    t["src/lib/dispatch/receipts.ts"] = "";
    t["src/lib/dispatch/redact.ts"] = "";
    t[".github/workflows/identity-guard.yml"] = "";
    t[".github/workflows/swallow-watch.yml"] = "";
    t[".github/workflows/trust-heartbeat.yml"] = "";
    t[".github/workflows/ext-audit.yml"] = "";
    const { swallows, alerts } = detectSwallows(t, fullTree());
    expect(swallows.length).toBe(9);
    for (const s of swallows) {
      expect(s.code).toBe("SWALLOWED-PATH");
      expect(s.path).not.toBe("src/lib/giant/empire-map.ts"); // הקיים-לא-נשפט-כנעדר
      expect(s.path).not.toBe("SWARM_STATE.md");
    }
    expect(alerts).toHaveLength(0);
    // התוכנית-חייבת-לרדת מהמקורות-המאומצים בלי-המצאה:
    const adopted: Record<string, string> = {};
    for (const s of swallows) adopted[s.path] = "adopted-blob-" + s.path.length;
    const plan = rescuePlan(swallows, adopted);
    expect(plan.length).toBe(9);
    expect(plan.every((a) => a.action === "restore")).toBe(true);
  });

  test("בליעה-חלקית: רק-הנעדרים מדווחים — אפס-שקרים-חיוביים על-הקיימים", () => {
    const t = fullTree();
    delete t["src/lib/giant/empire-registry.ts"];
    delete t[".github/workflows/identity-guard.yml"];
    const r = detectSwallows(t);
    expect(r.swallows.length).toBe(2);
    expect(r.swallows.map((s) => s.path).sort()).toEqual([
      ".github/workflows/identity-guard.yml",
      "src/lib/giant/empire-registry.ts",
    ]);
  });

  test("חוק-ההתראה-בלבד: שינוי-תוכן (sha-אחר) אינו-בליעה — הוא-התראה מול-baseline-מוצהר (המגן-לא-נלחם-באבולוציה)", () => {
    const baseline = fullTree();
    const t = { ...baseline, "SWARM_STATE.md": "sha-evolved-legitimately" };
    const r = detectSwallows(t, baseline);
    expect(r.swallows).toEqual([]);
    expect(r.alerts.length).toBe(1);
    expect(r.alerts[0].path).toBe("SWARM_STATE.md");
    expect(r.alerts[0].code).toBe("CONTENT-DRIFT-ALERT");
    expect(r.alerts[0].foundSha).toBe("sha-evolved-legitimately");
  });

  test("תוכנית-שחזור: כל-בליעה-מתורגמת-ל-restoration מ-blob-מאומץ — ואף-פיקסל-לא-מומצא", () => {
    const t = fullTree();
    delete t["src/lib/dispatch/doors.ts"];
    const r = detectSwallows(t);
    const plan = rescuePlan(r.swallows, { "src/lib/dispatch/doors.ts": "blob:97e1d96" });
    expect(plan.length).toBe(1);
    expect(plan[0]).toEqual({ path: "src/lib/dispatch/doors.ts", action: "restore", from: "blob:97e1d96" });
  });

  test("fail-closed: בליעה-בלי-מקור-מאומץ → תוכנית-השחזור מסרבת-להמציא (זריקה-מפורשת)", () => {
    const swallows: Swallow[] = [{ path: "src/lib/giant/never-adopted.ts", code: "SWALLOWED-PATH" }];
    expect(() => rescuePlan(swallows, {})).toThrow(/אין-מקור-מאומץ/);
  });

  test("קבלה-hash-linked: כל-קבלה חותמת את קודמתה (prevHash → hash, SHA-256)", () => {
    const r1 = guardReceipt(null, { cycle: 1, rescued: [] }, "2026-10-24T16:00:00Z");
    expect(r1.prevHash).toBeNull();
    expect(r1.hash).toHaveLength(64);
    const r2 = guardReceipt(r1.hash, { cycle: 2, rescued: ["x"] }, "2026-10-24T16:05:00Z");
    expect(r2.prevHash).toBe(r1.hash);
    expect(verifyReceiptChain([r1, r2])).toEqual({ ok: true, verified: 2 });
  });

  test("גלאי-התחזות: שינוי-שדה-בודד בקבלה-אמצעית שובר-את-השרשרת בנקודה-המדויקת", () => {
    const r1 = guardReceipt(null, { cycle: 1 }, "2026-10-24T16:00:00Z");
    const r2 = guardReceipt(r1.hash, { cycle: 2 }, "2026-10-24T16:05:00Z");
    const r3 = guardReceipt(r2.hash, { cycle: 3 }, "2026-10-24T16:10:00Z");
    const forged = JSON.parse(JSON.stringify([r1, r2, r3]));
    forged[1].payload.cycle = 999; // זיוף-הפיילוד בלי-חישוב-מחדש
    const v = verifyReceiptChain(forged);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
    expect(v.reason).toContain("hash-mismatch");
  });

  test("שרשרת-מנותקת (prevHash לא-תואם) נשברת-גם-היא fail-closed", () => {
    const r1 = guardReceipt(null, { cycle: 1 }, "2026-10-24T16:00:00Z");
    const impostor = guardReceipt(null, { cycle: 2 }, "2026-10-24T16:05:00Z");
    const v = verifyReceiptChain([r1, impostor]);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
  });

  test("דטרמיניזם: קלט-זהה → פלט-עמוק-שווה (אפס-שעון-פנימי, אפס-RNG)", () => {
    const t = fullTree();
    delete t[".github/workflows/swallow-watch.yml"];
    const a = detectSwallows(t);
    const b = detectSwallows(t);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ra = guardReceipt(null, { cycle: 9 }, "T1");
    const rb = guardReceipt(null, { cycle: 9 }, "T1");
    expect(ra.hash).toBe(rb.hash);
  });
});
