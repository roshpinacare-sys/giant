/* ═══ fuel-stream.test.ts · SAOS-FUEL-STREAM/1 · TDD ═══════════════════════════
 * חוקי-בדיקה: אפס-רשת · אפס-מפתחות-אמת · broadcaster מזויף בלבד.
 * הכיסוי: שער-חוק-האוצר (minOperatorSp) · dry-run-אף-שידור · שרשרת-קבלות
 * hash-linked · fail-closed על-מדידה-חסרה · שידור-חי-מזויף (txId בקבלה).
 * ═════════════════════════════════════════════════════════════════════════════ */
import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  FUEL_GENESIS,
  computeFuelPlan,
  runFuelCycle,
  FuelReceiptChain,
  type FuelBroadcaster,
  type SoldierInput,
} from "./fuel-stream";

const TMP_ROOT = () => fs.mkdtempSync(path.join(os.tmpdir(), "fuel-stream-test-"));

/* תשומות-המדידה-מהמנדט (2026-10-25/26): אוצר 3660.5 · חוק-מפעיל 17 · 4 חיילים מדודים 1.2SP · headcorner לא-מדוד */
const MEASURED_SOLDIERS: SoldierInput[] = [
  { account: "headcorner", currentSp: null },
  { account: "saos-0001", currentSp: 1.2 },
  { account: "saos-0002", currentSp: 1.2 },
  { account: "saos-0003", currentSp: 1.2 },
  { account: "saos-0004", currentSp: 1.2 },
];

function fakeBroadcaster(txIdPrefix = "fake-tx"): FuelBroadcaster & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  let n = 0;
  return {
    protocol: "fake/1",
    calls,
    async broadcastDelegate(args) {
      calls.push({ ...args });
      n++;
      return { txId: `${txIdPrefix}-${n}` };
    },
  };
}

describe("computeFuelPlan · שער-חוק-האוצר", () => {
  test("מעביר עם-ההקשר-המדוד (3660.5 − 15.2 = 3645.3 ≥ 17)", () => {
    const plan = computeFuelPlan({
      treasuryNetSp: 3660.5,
      minOperatorSp: 17,
      targetSpPerSoldier: 5,
      soldiers: MEASURED_SOLDIERS,
      delegator: "headcorner",
      dryRun: true,
    });
    expect(plan.ok).toBe(true);
    expect(plan.lawPassed).toBe(true);
    expect(plan.totalPlannedSp).toBeCloseTo(15.2, 6);
    expect(plan.treasuryAfterSp).toBeCloseTo(3645.3, 6);
    expect(plan.lawHeadroomSp).toBeCloseTo(3645.3 - 17, 6);
    expect(plan.blockers).toHaveLength(0);
    const topups = plan.lines.filter((l) => l.action === "topup");
    expect(topups).toHaveLength(4);
    for (const l of topups) {
      expect(l.amountSp).toBeCloseTo(3.8, 6);
      expect(l.targetSp).toBe(5);
    }
    // headcorner לא-מדוד → fail-closed (אפס-המצאה)
    const hc = plan.lines.find((l) => l.soldier === "headcorner");
    expect(hc?.action).toBe("unmeasured-fail-closed");
    expect(hc?.amountSp).toBe(0);
  });

  test("חוסם כשההאצלה-המתוכננת-הייתה-שוברת-את-חוק-מפעיל-המינימום", () => {
    // 30 − 15.2 = 14.8 < 17 → חוק-האוצר נשבר → כל-השורות נעוצות בכנות
    const plan = computeFuelPlan({
      treasuryNetSp: 30,
      minOperatorSp: 17,
      targetSpPerSoldier: 5,
      soldiers: MEASURED_SOLDIERS,
      delegator: "headcorner",
      dryRun: true,
    });
    expect(plan.lawPassed).toBe(false);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.length).toBeGreaterThan(0);
    expect(plan.blockers[0]).toContain("17");
    for (const l of plan.lines) {
      expect(l.amountSp).toBe(0); // אפס-תדלוק בפועל — רק-קבלת-חוסם כנה
    }
  });

  test("גבול-החוק הוא בדיוק ≥ minOperatorSp (שוויון עובר, חסר-שקל-אחד נחסם)", () => {
    const base = { minOperatorSp: 17, targetSpPerSoldier: 5, soldiers: MEASURED_SOLDIERS, delegator: "headcorner", dryRun: true };
    const atLaw = computeFuelPlan({ ...base, treasuryNetSp: 32.2 }); // 32.2-15.2=17.0
    expect(atLaw.lawPassed).toBe(true);
    const under = computeFuelPlan({ ...base, treasuryNetSp: 32.1999 });
    expect(under.lawPassed).toBe(false);
  });

  test("חייל-ביעד → at-target אפס-תדלוק", () => {
    const plan = computeFuelPlan({
      treasuryNetSp: 3660.5, minOperatorSp: 17, targetSpPerSoldier: 5,
      soldiers: [{ account: "saos-0001", currentSp: 5 }],
      delegator: "headcorner", dryRun: true,
    });
    expect(plan.lines[0].action).toBe("at-target");
    expect(plan.lines[0].amountSp).toBe(0);
    expect(plan.totalPlannedSp).toBe(0);
  });

  test("הערת-RC כנה: RC-נמוך מתועד בשורה בלי-להמציא פעולת-RC", () => {
    const plan = computeFuelPlan({
      treasuryNetSp: 3660.5, minOperatorSp: 17, targetSpPerSoldier: 5,
      soldiers: [{ account: "saos-0002", currentSp: 1.2, rcPct: 12 }],
      delegator: "headcorner", dryRun: true,
    });
    const l = plan.lines[0];
    expect(l.rcNote).toBeTruthy();
    expect(String(l.rcNote)).toContain("12");
    expect(String(l.rcNote)).toContain("RC");
  });
});

describe("runFuelCycle · dry-run ורשומות", () => {
  test("dry-run: אפס-שידור, קבלות-dryRun=true בלי-txId, התוכנית-נשמרת", async () => {
    const dir = TMP_ROOT();
    const bc = fakeBroadcaster();
    const r = await runFuelCycle({
      broadcaster: bc,
      receiptsPath: path.join(dir, "fuel-receipts.jsonl"),
      env: { FUEL_INPUTS_JSON: JSON.stringify({ treasuryNetSp: 3660.5, soldiers: MEASURED_SOLDIERS }) },
    });
    expect(r.plan.ok).toBe(true);
    expect(r.plan.dryRun).toBe(true);
    expect(bc.calls).toHaveLength(0); // חוק-יבשה: אפס-שידור
    expect(r.receipts.length).toBeGreaterThanOrEqual(6); // תוכנית + 5 חיילים
    for (const rec of r.receipts) {
      expect(rec.dryRun).toBe(true);
      expect(rec.txId).toBeUndefined();
    }
  });

  test("שידור-חי (broadcaster מזויף): רק-חיילים-מדודים-משודרים, txId בקבלה, dryRun=false", async () => {
    const dir = TMP_ROOT();
    const bc = fakeBroadcaster("live-tx");
    const r = await runFuelCycle({
      broadcaster: bc,
      receiptsPath: path.join(dir, "fuel-receipts.jsonl"),
      env: {
        FUEL_DRY_RUN: "false",
        FUEL_TREASURY_NET_SP: "3660.5",
        FUEL_INPUTS_JSON: JSON.stringify({ soldiers: MEASURED_SOLDIERS }),
      },
    });
    expect(r.plan.dryRun).toBe(false);
    expect(bc.calls).toHaveLength(4); // headcorner לא-מדוד → אינו-נשלח
    expect(bc.calls.every((c) => (c.delegator as string) === "headcorner")).toBe(true);
    expect(bc.calls.map((c) => c.delegatee).sort()).toEqual(["saos-0001", "saos-0002", "saos-0003", "saos-0004"]);
    const topupReceipts = r.receipts.filter((x) => x.action === "fuel-topup");
    expect(topupReceipts).toHaveLength(4);
    for (const rec of topupReceipts) {
      expect(rec.dryRun).toBe(false);
      expect(String(rec.txId)).toStartWith("live-tx-");
    }
  });

  test("חי-בלי-מדידת-אוצר → fail-closed: חוסם, אפס-שידור, קבלת-blocker", async () => {
    const dir = TMP_ROOT();
    const bc = fakeBroadcaster();
    const r = await runFuelCycle({
      broadcaster: bc,
      receiptsPath: path.join(dir, "fuel-receipts.jsonl"),
      env: { FUEL_DRY_RUN: "false", FUEL_INPUTS_JSON: JSON.stringify({ soldiers: MEASURED_SOLDIERS }) },
    });
    expect(r.plan.ok).toBe(false);
    expect(r.plan.treasuryNetSp).toBeNull();
    expect(bc.calls).toHaveLength(0);
    expect(r.receipts.some((x) => x.action === "fuel-blocker")).toBe(true);
  });

  test("חי-עם-חוק-שנשבר → אפס-שידור וקבלת-חוסם (שער-האוצר קודם-לשידור)", async () => {
    const dir = TMP_ROOT();
    const bc = fakeBroadcaster();
    const r = await runFuelCycle({
      broadcaster: bc,
      receiptsPath: path.join(dir, "fuel-receipts.jsonl"),
      env: {
        FUEL_DRY_RUN: "false",
        FUEL_TREASURY_NET_SP: "30", // 30-15.2 < 17
        FUEL_INPUTS_JSON: JSON.stringify({ soldiers: MEASURED_SOLDIERS }),
      },
    });
    expect(r.plan.ok).toBe(false);
    expect(bc.calls).toHaveLength(0);
    expect(r.receipts.some((x) => x.action === "fuel-blocker")).toBe(true);
  });

  test("שידור-חי-שנכשל → קבלת-כשל-כנה, עצירת-סבב fail-closed (לא-ממשיך-עיוור)", async () => {
    const dir = TMP_ROOT();
    const failing: FuelBroadcaster = {
      protocol: "failing/1",
      async broadcastDelegate() {
        throw new Error("rpc-down (honest)");
      },
    };
    const r = await runFuelCycle({
      broadcaster: failing,
      receiptsPath: path.join(dir, "fuel-receipts.jsonl"),
      env: {
        FUEL_DRY_RUN: "false",
        FUEL_TREASURY_NET_SP: "3660.5",
        FUEL_INPUTS_JSON: JSON.stringify({ soldiers: MEASURED_SOLDIERS }),
      },
    });
    const fails = r.receipts.filter((x) => x.action === "fuel-broadcast-failed");
    expect(fails).toHaveLength(1); // עצירה-בראשון
    expect(String(fails[0].reason)).toContain("rpc-down");
  });
});

describe("FuelReceiptChain · שרשרת-hash", () => {
  test("כל-קבלה קושרת prevSha→sha256 ו-verify ירוק", () => {
    const dir = TMP_ROOT();
    const chain = new FuelReceiptChain(path.join(dir, "fuel-receipts.jsonl"));
    const a = chain.append({ at: "t1", action: "fuel-plan", from: "headcorner", to: "fleet-soldiers", amountSp: 15.2, dryRun: true });
    const b = chain.append({ at: "t2", action: "fuel-topup", from: "headcorner", to: "saos-0001", amountSp: 3.8, dryRun: true });
    const c = chain.append({ at: "t3", action: "fuel-topup", from: "headcorner", to: "saos-0002", amountSp: 3.8, dryRun: false, txId: "tx-1" });
    expect(a.prevSha).toBe(FUEL_GENESIS);
    expect(b.prevSha).toBe(a.sha256);
    expect(c.prevSha).toBe(b.sha256);
    expect(c.txId).toBe("tx-1");
    const v = chain.verify();
    expect(v.ok).toBe(true);
    expect(v.checked).toBe(3);
  });

  test("שרשרת-שורדת-הפעלה-מחדש (restart): instance חדש ממשיך מהזנב", () => {
    const dir = TMP_ROOT();
    const p = path.join(dir, "fuel-receipts.jsonl");
    const c1 = new FuelReceiptChain(p);
    const a = c1.append({ at: "t1", action: "fuel-plan", from: "x", to: "y", amountSp: 1, dryRun: true });
    const c2 = new FuelReceiptChain(p); // כאילו-תהליך-חדש
    const b = c2.append({ at: "t2", action: "fuel-topup", from: "x", to: "y", amountSp: 1, dryRun: true });
    expect(b.prevSha).toBe(a.sha256);
    expect(c2.verify().ok).toBe(true);
    expect(c2.verify().checked).toBe(2);
  });

  test("שיבוש-שורה-באמצע מתגלה (verify נשבר במקום-הנכון)", () => {
    const dir = TMP_ROOT();
    const p = path.join(dir, "fuel-receipts.jsonl");
    const chain = new FuelReceiptChain(p);
    chain.append({ at: "t1", action: "a", from: "x", to: "y", amountSp: 1, dryRun: true });
    chain.append({ at: "t2", action: "b", from: "x", to: "y", amountSp: 2, dryRun: true });
    chain.append({ at: "t3", action: "c", from: "x", to: "y", amountSp: 3, dryRun: true });
    // שיבוש-כנה של-השורה-השנייה על-הדיסק
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    const mid = JSON.parse(lines[1]);
    mid.amountSp = 999; // טמפר
    lines[1] = JSON.stringify(mid);
    fs.writeFileSync(p, lines.join("\n") + "\n");
    const checker = new FuelReceiptChain(p);
    const v = checker.verify();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
  });

  test("קובץ-קבלות-עם-שורה-קרועה-בסוף (כתיבה-חלקית) לא-מפיל-append", () => {
    const dir = TMP_ROOT();
    const p = path.join(dir, "fuel-receipts.jsonl");
    const chain = new FuelReceiptChain(p);
    chain.append({ at: "t1", action: "a", from: "x", to: "y", amountSp: 1, dryRun: true });
    fs.appendFileSync(p, '{"at":"t2","action":"trun'); // קרע-כנה
    const chain2 = new FuelReceiptChain(p);
    const next = chain2.append({ at: "t3", action: "b", from: "x", to: "y", amountSp: 1, dryRun: true });
    expect(next.prevSha).not.toBe("FUEL-GENESIS");
    expect(chain2.verify().checked).toBeGreaterThanOrEqual(1);
  });
});
