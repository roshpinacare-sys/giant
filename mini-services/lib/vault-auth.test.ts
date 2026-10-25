/* vault-auth · דגמי-אדום-לירוק (TDD) — הסף-הריבוני deny-by-default */
import { describe, test, expect, beforeAll } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vault-auth-test-"));
const TOKEN_FILE = path.join(TMP, "vault", "operator-token");
process.env.VAULT_TOKEN_FILE = TOKEN_FILE;
delete process.env.SOVEREIGN_VAULT_TOKEN; // מבטיחים-נתיב-קובץ

let M: typeof import("./vault-auth.ts");
beforeAll(async () => { M = await import("./vault-auth.ts"); });

const gw = (method: string, token?: string): Request => {
  const h: Record<string, string> = { "x-real-ip": "203.0.113.9" };
  if (token) h["x-vault-token"] = token;
  return new Request("http://127.0.0.1:3016/tx/ingest", { method, headers: h });
};
const lo = (method: string): Request => new Request("http://127.0.0.1:3016/cycle", { method });

describe("vault-auth · חוק-הסף-הריבוני", () => {
  test("T1 המצאה-עצמית: אין-קובץ → טוקן-חדש 0600 נטבע", () => {
    const t = M.vaultToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    const st = fs.statSync(TOKEN_FILE);
    expect(st.mode & 0o777).toBe(0o600);
    expect(M.vaultFingerprint()).toMatch(/^[0-9a-f]{16}$/);
  });

  test("T2 אותו-טוקן נקרא שוב מהקובץ (יציבות)", () => {
    expect(M.vaultToken()).toBe(M.vaultToken());
  });

  test("T3 classify: שער-ציבורי זוהה לפי-כותרות; לופבק לא", () => {
    expect(M.isGatewayBorne(gw("POST"))).toBe(true);
    expect(M.isGatewayBorne(lo("POST"))).toBe(false);
    expect(M.isMutation(gw("POST"))).toBe(true);
    expect(M.isMutation(gw("GET"))).toBe(false);
  });

  test("T4 דחייה fail-closed: מוטציה-ציבורית בלי-טוקן → 403 מפורש", () => {
    const deny = M.denyIfPublic(gw("POST"), "test-organ")!;
    expect(deny.status).toBe(403);
  });

  test("T5 אישור: אותה-מוטציה עם-טוקן-תקף עוברת (null)", () => {
    expect(M.denyIfPublic(gw("POST", M.vaultToken()), "test-organ")).toBe(null);
    expect(M.denyIfPublic(gw("POST", undefined), "test-organ")!.status).toBe(403); // שליטה
    const bearerReq = new Request("http://x/tx/ingest", { method: "POST", headers: { "x-real-ip": "1.2.3.4", authorization: `Bearer ${M.vaultToken()}` } });
    expect(M.denyIfPublic(bearerReq, "test-organ")).toBe(null);
  });

  test("T6 מישור-האמון-הפנימי: לופבק-ישיר בלי-טוקן עובר (הלולאות-חיות)", () => {
    expect(M.denyIfPublic(lo("POST"), "test-organ")).toBe(null);
    expect(M.denyIfPublic(lo("GET"), "test-organ")).toBe(null);
  });

  test("T7 GET-ציבורי (קריאה) לא נחסם — רק-מוטציות", () => {
    expect(M.denyIfPublic(gw("GET"), "test-organ")).toBe(null);
  });

  test("T8 טוקן-שגוי → דחייה; רוטציה: env-לא-ריק דורס את-הקובץ (החלפת-טוקן-בעלים)", () => {
    expect(M.denyIfPublic(gw("POST", "deadbeef".repeat(8)), "test-organ")!.status).toBe(403);
    const rotated = "f".repeat(64);
    process.env.SOVEREIGN_VAULT_TOKEN = rotated;
    expect(M.verifyVaultToken(gw("POST", rotated))).toBe(true);            // הטוקן-החדש עובד
    expect(M.verifyVaultToken(gw("POST", fs.readFileSync(TOKEN_FILE, "utf8").trim()))).toBe(false); // הישן נדחה
    delete process.env.SOVEREIGN_VAULT_TOKEN;
    expect(M.verifyVaultToken(gw("POST", M.vaultToken()))).toBe(true);     // חזרה לקובץ
  });
});
