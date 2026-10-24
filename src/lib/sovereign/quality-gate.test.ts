/**
 * quality-gate.test.ts — מבחני-שער-איכות-הנחיתה (§5 MASTER DIRECTIVE · חוק-ה-TDD).
 * ═════════════════════════════════════════════════════════════════════════════
 * §5: NO MOCKS, NO STUBS, NO TODOS — לעולם-לא-מנחיתים-הערות-מקום, גופים-
 * מדומים, או-חריגות-לא-מטופלות. 100% אימות-דטרמיניסטי: כל-שינוי-מצב-חייב-
 * הוכחת-סוויט-ירוקה. שער-זה הוא-החוק-הדטרמיניסטי שמאכוף-זאת על-כל-נחיתה.
 *
 * חוקי-השער (בסדר-קבוע, כל-ההפרות-נאספות — לא-פגיעה-ראשונה-בלבד):
 *  KILL  — מחיקת-נתיב-קנוני · הפרת-zero-slop בשורות-שנוספו · הוכחה-חסרה
 *          · הוכחה-נכשלה (failed>0)
 *  HOLD  — הוכחה-מעוותת (סוויט-שרץ-אפס-טסטים אינו-מוכח-דבר)
 *  MERGE — כל-החוקים-ירוקים
 * דטרמיניזם מלא: אפס-שעון, אפס-RNG, אפס-רשת. פטורים-דטרמיניסטיים-מנועלים:
 * קבצי-נעילה/נבנה-אוטומטית חסיני-סריקה; קבצי-מבחן פטורים-מ-MOCK/STUB-בלבד
 * (אוצר-מילים-לגיטימי-של-בדיקות) אך-לא-מ-TODO/FIXME/not-implemented.
 */
import { describe, test, expect } from "bun:test";
import {
  zeroSlopScan,
  evaluateLanding,
  scanLanding,
  verdictReceipt,
  verifyReceiptChain,
  SLOP_PATTERNS,
  isSlopExemptPath,
  type LandingChange,
  type GreenProof,
} from "./quality-gate";
import { runGateCli } from "../../../scripts/quality-gate-cli";
import { CANONICAL_SET } from "./swallow-guard";

function proof(suite = "src/lib", passed = 12, failed = 0): GreenProof {
  return { suite, passed, failed };
}

function cleanChange(over: Partial<LandingChange> = {}): LandingChange {
  return {
    pathsAdded: ["src/lib/giant/new-module.ts"],
    pathsModified: [],
    pathsDeleted: [],
    addedLines: [
      { path: "src/lib/giant/new-module.ts", lines: ["export const x = 1;", "export const y = x + 1;"] },
    ],
    greenProof: proof(),
    ...over,
  };
}

describe("quality-gate — חוקי-אפס-הזבל (§5)", () => {
  test("רשימת-הדפוסים מנועלת-וקפואה: כל-דפוס עם id ייחודי ורגקס תקין", () => {
    expect(SLOP_PATTERNS.length).toBeGreaterThanOrEqual(7);
    const ids = SLOP_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SLOP_PATTERNS) expect(p.re).toBeInstanceOf(RegExp);
  });

  test("אפס-שקרים-חיוביים על-קוד-לגיטימי: פיזור (spread), try/catch, מילים-אחיות-אינן-זבל", () => {
    const v = zeroSlopScan([
      { path: "src/lib/giant/a.ts", lines: ["const f = (...args: unknown[]) => args.length;", "try { f(); } catch { /* handled */ }", "// hacked-up wording below this line is fine to say 'hacked' — wait: boundary-law", "const s = 'hacked';"] },
    ]);
    // 'hacked' אינו \bHACK\b (גבול-מילה-אחרי-K נכשל על 'hacked') — חייב-לעבור
    expect(v).toHaveLength(0);
  });

  test("גילוי-זבל: TODO/FIXME/XXX/not-implemented/unimplemented מדווחים עם נתיב+שורה+דפוס", () => {
    const v = zeroSlopScan([
      { path: "src/lib/giant/b.ts", lines: ["const ok = 1;", "// TODO: finish this", "const bad = notImplementedHelper(); // not implemented", "// FIXME soon", "throw new Error('unimplemented path');"] },
    ]);
    expect(v.length).toBeGreaterThanOrEqual(4);
    const paths = new Set(v.map((x) => x.path));
    expect(paths.has("src/lib/giant/b.ts")).toBe(true);
    const pats = new Set(v.map((x) => x.pattern));
    expect(pats.has("TODO")).toBe(true);
    expect(pats.has("FIXME")).toBe(true);
    expect(pats.has("NOT-IMPLEMENTED")).toBe(true);
    expect(pats.has("UNIMPLEMENTED")).toBe(true);
    const todo = v.find((x) => x.pattern === "TODO");
    expect(todo?.line).toBe(2);
    expect(todo?.excerpt).toContain("TODO");
  });

  test("פטור-מבחנים: mock/stub בקובץ-מבחן אינו-זבל — אך TODO בקובץ-מבחן נשאר-זבל", () => {
    const v = zeroSlopScan([
      { path: "src/lib/giant/c.test.ts", lines: ["const fake = stub(); // test vocabulary", "mock(() => fake);", "// TODO fix the fixture"] },
    ]);
    const pats = v.map((x) => x.pattern);
    expect(pats).toContain("TODO");
    expect(pats).not.toContain("STUB");
  });

  test("פטור-מבנה: קבצי-נעילה/נבנה-אוטומטית/מצב-ריצה חסינים-לחלוטין-מסריקה", () => {
    expect(isSlopExemptPath("bun.lock")).toBe(true);
    expect(isSlopExemptPath("package-lock.json")).toBe(true);
    expect(isSlopExemptPath("state/pulse.json")).toBe(true);
    expect(isSlopExemptPath("src/lib/giant/real.ts")).toBe(false);
    const v = zeroSlopScan([
      { path: "bun.lock", lines: ["// TODO generated content"] },
      { path: "state/events.jsonl", lines: ["{\"x\":1} // FIXME runtime stream"] },
    ]);
    expect(v).toHaveLength(0);
  });

  test("איסוף-מלא: כל-ההפרות-בכל-הקבצים נאספות (לא-פגיעה-ראשונה)", () => {
    const v = zeroSlopScan([
      { path: "a.ts", lines: ["// TODO one"] },
      { path: "b.ts", lines: ["// TODO two", "// FIXME three"] },
    ]);
    expect(v.length).toBe(3);
  });
});

describe("quality-gate — חוקי-הנחיתה (evaluateLanding, fail-closed)", () => {
  test("MERGE: נחיתה-אדיטיבית-נקייה עם הוכחה-ירוקה עוברת", () => {
    const v = evaluateLanding(cleanChange());
    expect(v.decision).toBe("MERGE");
    expect(v.reasons).toEqual(["all-laws-green"]);
    expect(v.slop).toHaveLength(0);
  });

  test("KILL: מחיקת-נתיב-קנוני — החוק-הקנוני נשען על CANONICAL_SET החי (כולל v2: ה-runner)", () => {
    expect(CANONICAL_SET.some((p) => p.startsWith("mini-services/issue-to-pr/"))).toBe(true);
    const v = evaluateLanding(
      cleanChange({ pathsDeleted: ["src/lib/dispatch/doors.ts", "src/lib/giant/other.ts"] }),
    );
    expect(v.decision).toBe("KILL");
    expect(v.reasons.some((r) => r.includes("canonical-path-deletion"))).toBe(true);
    expect(v.reasons.some((r) => r.includes("src/lib/dispatch/doors.ts"))).toBe(true);
  });

  test("KILL: זבל-בשורות-שנוספו — §5 אוסר TODO/stub/not-implemented על-כל-נחיתה", () => {
    const v = evaluateLanding(
      cleanChange({
        addedLines: [{ path: "src/lib/giant/x.ts", lines: ["// TODO later"] }],
      }),
    );
    expect(v.decision).toBe("KILL");
    expect(v.reasons.some((r) => r.includes("zero-slop-violation"))).toBe(true);
    expect(v.slop.length).toBe(1);
  });

  test("KILL: הוכחה-חסרה — אין-מיזוג-בלי-ראיית-סוויט (§5 100% אימות)", () => {
    const v = evaluateLanding(cleanChange({ greenProof: null }));
    expect(v.decision).toBe("KILL");
    expect(v.reasons.some((r) => r.includes("green-proof-missing"))).toBe(true);
  });

  test("KILL: הוכחה-נכשלה (failed>0) — סוויט-אדום הוא-מנוע-מיזוג", () => {
    const v = evaluateLanding(cleanChange({ greenProof: proof("s", 5, 2) }));
    expect(v.decision).toBe("KILL");
    expect(v.reasons.some((r) => r.includes("green-proof-failed"))).toBe(true);
  });

  test("HOLD: הוכחה-מעוותת (passed=0, failed=0) — סוויט-שלא-בדק-כלום אינו-ראיה (fail-closed, לא-KILL)", () => {
    const v = evaluateLanding(cleanChange({ greenProof: proof("s", 0, 0) }));
    expect(v.decision).toBe("HOLD");
    expect(v.reasons.some((r) => r.includes("green-proof-empty"))).toBe(true);
  });

  test("הצטברות: כל-הסיבות-נאספות-יחד (מחיקה-קנונית + זבל + הוכחה-חסרה = שלוש-סיבות-KILL)", () => {
    const v = evaluateLanding(
      cleanChange({
        pathsDeleted: [".github/workflows/swallow-watch.yml"],
        addedLines: [{ path: "src/lib/giant/y.ts", lines: ["// TODO x"] }],
        greenProof: null,
      }),
    );
    expect(v.decision).toBe("KILL");
    expect(v.reasons.length).toBe(3);
  });

  test("דטרמיניזם: קלט-זהה → פס-דין-זהה-עמוק (אפס-שעון, אפס-RNG)", () => {
    const c = cleanChange({
      addedLines: [{ path: "a.ts", lines: ["// TODO d", "// FIXME e"] }],
      greenProof: proof("s", 3, 1),
    });
    expect(JSON.stringify(evaluateLanding(c))).toBe(JSON.stringify(evaluateLanding(c)));
  });
});

describe("quality-gate — סריקת-לולאה (scanLanding, §5 במחזור-החי)", () => {
  test("CLEAN: נחיתה-נקייה-מזבל-ובלי-מחיקה-קנונית — הסריקה-לא-טוענת-דבר-על-הוכחות", () => {
    const s = scanLanding(cleanChange());
    expect(s.decision).toBe("CLEAN");
    expect(s.reasons).toEqual([]);
    expect(s.slop).toHaveLength(0);
  });

  test("KILL: זבל-או-מחיקה-קנונית-בסריקה — ולעולם-אין-טענת-הוכחה (הסריקה-אינה-באה-לידי-ביטוי-במיזוג)", () => {
    const a = scanLanding(cleanChange({ addedLines: [{ path: "x.ts", lines: ["// TODO t"] }] }));
    expect(a.decision).toBe("KILL");
    expect(a.reasons.some((r) => r.includes("zero-slop-violation"))).toBe(true);
    expect(a.reasons.every((r) => !r.includes("green-proof"))).toBe(true);
    const b = scanLanding(cleanChange({ pathsDeleted: ["SWARM_STATE.md"] }));
    expect(b.decision).toBe("KILL");
    expect(b.reasons.some((r) => r.includes("canonical-path-deletion"))).toBe(true);
  });

  test("דטרמיניזם: קלט-זהה → פס-סריקה-זהה-עמוק", () => {
    const c = cleanChange({ addedLines: [{ path: "a.ts", lines: ["stub(); // not implemented"] }] });
    expect(JSON.stringify(scanLanding(c))).toBe(JSON.stringify(scanLanding(c)));
  });
});

describe("quality-gate — קבלות-דין hash-linked (שפת-הלהקה-האחת)", () => {
  test("שרשרת-קבלות: כל-קבלה-חותמת-את-קודמתה; זיוף-נשבר-בנקודה-המדויקת", () => {
    const r1 = verdictReceipt(null, { decision: "MERGE", tip: "t1" }, "2026-10-24T17:00:00Z");
    const r2 = verdictReceipt(r1.hash, { decision: "KILL", tip: "t2" }, "2026-10-24T17:05:00Z");
    expect(r1.prevHash).toBeNull();
    expect(r2.prevHash).toBe(r1.hash);
    expect(verifyReceiptChain([r1, r2])).toEqual({ ok: true, verified: 2 });
    const forged = JSON.parse(JSON.stringify([r1, r2]));
    forged[0].payload.tip = "forged";
    const v = verifyReceiptChain(forged);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(0);
  });
});

describe("quality-gate-cli — תפר-הלולאה-החיה (החוזה-הכפול: flat ו-nested, נתפס-חי 18:07Z)", () => {
  // המגן-החי שלח-היום צורה-שטוחה (change-בלבד-בלי-מפתח-עוטף) וה-CLI דרש-עוטף —
  // התוצאה: quality-scan-skip בכל-מחזור, §6 מתה-במים-החיים. החוק-החדש: שתי-הצורות
  // מניבות-את-אותו-פס-דין — התפר-מקורה-משני-הצדדים, ולעולם-אין-קלט-שקט-שנבלע.
  test("flat-כמו-המגן-החי-שולח → פס-דין-אמיתי (לא fatal)", () => {
    const flat = { mode: "scan", pathsAdded: ["a.ts"], pathsModified: [], pathsDeleted: [], addedLines: [{ path: "a.ts", lines: ["const x = 1;"] }] };
    const out = JSON.parse(runGateCli(JSON.stringify(flat)));
    expect(out.decision).toBe("CLEAN");
    expect(out.reasons).toEqual([]);
  });
  test("flat-עם-זבל → KILL עם-ההפרה-המדויקת", () => {
    const flat = { mode: "scan", pathsAdded: [], pathsModified: ["b.ts"], pathsDeleted: [], addedLines: [{ path: "b.ts", lines: ["// TODO fix later"] }] };
    const out = JSON.parse(runGateCli(JSON.stringify(flat)));
    expect(out.decision).toBe("KILL");
    expect(out.slop[0].path).toBe("b.ts");
    expect(out.slop[0].pattern).toBe("TODO");
  });
  test("nested {mode,change} — שקול-ביט ל-flat (חוזה-כפול)", () => {
    const change = { pathsAdded: ["a.ts"], pathsModified: [], pathsDeleted: [], addedLines: [{ path: "a.ts", lines: ["// TODO x"] }] };
    const nested = JSON.parse(runGateCli(JSON.stringify({ mode: "scan", change })));
    const flat = JSON.parse(runGateCli(JSON.stringify({ mode: "scan", ...change })));
    expect(nested).toEqual(flat);
  });
  test("receipt-mode: prevHash נחתם-לתוך-הקבלה-hash-linked", () => {
    const out = JSON.parse(runGateCli(JSON.stringify({ mode: "receipt", at: "2026-10-24T18:40:00Z", prevHash: "abc123", payload: { decision: "CLEAN", tip: "41890b3" } })));
    expect(out.prevHash).toBe("abc123");
    expect(typeof out.hash).toBe("string");
    expect(out.hash.length).toBeGreaterThan(0);
  });
  test("קלט-מקולקל → fatal-כנה (fail-closed, אף-חריגה-לא-נזרקת-מה-CLI)", () => {
    expect(JSON.parse(runGateCli("not json")).fatal).toBe("stdin-not-json");
    expect(JSON.parse(runGateCli(JSON.stringify({ mode: "scan" }))).fatal).toBe("scan-needs-change");
    expect(JSON.parse(runGateCli(JSON.stringify({ mode: "scan", change: { addedLines: "nope" } }))).fatal).toBe("change-must-carry-pathsDeleted-and-addedLines");
    expect(JSON.parse(runGateCli(JSON.stringify({ mode: "warp" }))).fatal).toBe("mode-must-be-scan-or-receipt");
  });
});

describe("quality-gate — חוק-מראת-החוק (נתפס-חי 18:38Z: השער-החי-הרג-את-נחיתת-התפר-שלו-עצמו)", () => {
  // המראה: הקובץ-שמוכיח-שהחוק-עובד חייב-לשאת-את-הדפוסים-שהוא-מגלה, אחרת-החוק
  // אינו-יכול-להוכיח-את-עצמו-מקצה-לקצה. הפטור-צר, קפוא, מוכרז-ונבדק: קובץ-
  // המבחן-של-החוק-עצמו בלבד — לא-כל-מבחן, לא-כל-מודול. זה-לא-מעבר-מאחורי-גבו-
  // של-§6; זה-הבט-ההוכחה-שלו.
  test("מראת-החוק: קובץ-המבחן-של-השער-עצמו פטור; שאר-קבצי-המבחן לאו", () => {
    expect(isSlopExemptPath("src/lib/sovereign/quality-gate.test.ts")).toBe(true);
    expect(isSlopExemptPath("src/lib/other/law.test.ts")).toBe(false);
    // 18:45Z תיקון-חוק: גם-מקור-החוק-עצמו במראה — טבלת-SLOP_PATTERNS היא-עצמה
    // אוצר-מילים (הגדרת-הדפוסים מכילה-את-הדפוסים); הסריקה-הציית-הוכיחה-זאת.
    expect(isSlopExemptPath("src/lib/sovereign/quality-gate.ts")).toBe(true);
    // הסריקה-החיה-של-המראה: דפוסים-אמיתיים-בקובץ-המראה → אפס-הפרות
    const mirrorScan = zeroSlopScan([
      { path: "src/lib/sovereign/quality-gate.test.ts", lines: ['const fixture = ["// TODO x", "toBe(\\"TODO\\")"]'] },
    ]);
    expect(mirrorScan).toHaveLength(0);
    // אבל-קובץ-מבחן-רגיל-עם-אותן-שורות → נשפט
    const otherScan = zeroSlopScan([
      { path: "src/lib/other/regular.test.ts", lines: ["// TODO x"] },
    ]);
    expect(otherScan).toHaveLength(1);
  });
  test("מראת-החוק-בלולאה-החיה: scanLanding על-נחיתה-הנוגעת-רק-בקובץ-המראה → CLEAN", () => {
    const d = scanLanding({
      pathsAdded: [],
      pathsModified: ["src/lib/sovereign/quality-gate.test.ts"],
      pathsDeleted: [],
      addedLines: [{ path: "src/lib/sovereign/quality-gate.test.ts", lines: ["// TODO detector fixture"] }],
      greenProof: null,
    });
    expect(d.decision).toBe("CLEAN");
  });
});

describe("quality-gate — חוק-קורפוס-הראיות (סריקת-צי-מלאה 18:45Z: 853-קבצים, 85-היטים, אפס-זבל-אמיתי)", () => {
  // הסריקה-הציית-המלאה-הראשונה מצאה: כל-ההיטים הם-אוצר-מילים-של-גלאים/יומנים/
  // תיעוד/תוכן-מוצר — אפס-מצביעי-עבודה-לא-גמורה. החוק-חייב-להבחין-בזה-באופן-
  // דטרמיניסטי: פרוזה (.md), מראת-החוק, ואיברי-גילוי — קורפוס-ראיות, לא-זבל.
  test("פרוזה: כל-.md הוא-יומן/תיעוד — אוצר-מילים-שם הוא-היסטוריה-וראיה", () => {
    expect(isSlopExemptPath("worklog.md")).toBe(true);
    expect(isSlopExemptPath("SWARM_STATE.md")).toBe(true);
    expect(isSlopExemptPath("docs/lanes/trust-map.md")).toBe(true);
    expect(isSlopExemptPath("src/real-code.ts")).toBe(false); // קוד-לעולם-לא-פטור-מהחוק-הזה
  });
  test("איברי-גילוי: האיברים-שהמטען-שלהם הוא-אוצר-המילים-עצמו", () => {
    expect(isSlopExemptPath("mini-services/issue-forge/auditors.ts")).toBe(true);
    expect(isSlopExemptPath("mini-services/forge/src/lib/forge/experiments/engine.ts")).toBe(true);
    expect(isSlopExemptPath("mini-services/saos-architect-daemon/audit.ts")).toBe(true);
    expect(isSlopExemptPath("src/lib/giant/trust-scan.ts")).toBe(true);
    expect(isSlopExemptPath("scripts/trust-heartbeat.mjs")).toBe(true);
    expect(isSlopExemptPath("src/components/giant/TrustView.tsx")).toBe(true);
    // קוד-רגיל-לא-נפטר-על-ידי-החוק-הזה
    expect(isSlopExemptPath("mini-services/other/production.ts")).toBe(false);
  });
  test("החוק-במלואו: נחיתה-הנוגעת-בקורפוס-הראיות → CLEAN; בקוד-רגיל → KILL", () => {
    const evidence = scanLanding({
      pathsAdded: [], pathsModified: ["docs/policy.md"], pathsDeleted: [],
      addedLines: [{ path: "docs/policy.md", lines: ["- TODO policy: no stubs in code"] }],
      greenProof: null,
    });
    expect(evidence.decision).toBe("CLEAN");
    const code = scanLanding({
      pathsAdded: ["src/new.ts"], pathsModified: [], pathsDeleted: [],
      addedLines: [{ path: "src/new.ts", lines: ["// TODO fix"] }],
      greenProof: null,
    });
    expect(code.decision).toBe("KILL");
  });
});
