/**
 * scripts/join-golden.ts — מסלול-זהב של-ההצטרפות-העצמית (גל-76 · רגרסיה-מחויבת)
 * ═══════════════════════════════════════════════════════════════════════════
 * למה: על-תיבת-4GB לא-ניתן-להרים-שרת-next-שני-לצד-המשרד (OOM-נמדד — חוק-RAM).
 * אז-מאמתים-את-מסלול-החוץ-ישירות-על-ה-handlers — אותו-קוד, אותו-דג'ר-חי, אפס-שרת.
 * הרצה: DATABASE_URL=file:../db/custom.db bun scripts/join-golden.ts
 *   (ה-DATABASE_URL-המפורש-מנצח-את-משתנה-הסביבה-המיובא-של-הסנדבוקס — שיעור-גל-76)
 * חוקים-שנמדדים-כאן:
 *  1. GET ציבורי → תפוסה-אמת (בלי-מפתח)
 *  2. POST עצמי → 201 + גולמי-פעם-אחת + חשבון-נולד-אפס
 *  3. GET עצמי → המפתח-רואה-רק-את-עצמו · יתרות-אפס-כנות
 *  4. מסחר-בלי-כסף → נחסם (אפס-טביעה, אפס-אשראי)
 *  5. DELETE עצמי → המפתח-מת-מיד
 *  6. מפתח-מת → 401 מידי
 * המפתח-שנולד-כאן-מושמד-בסוף — הרצה-נקייה-על-הדג'ר.
 */
import { POST as keysPOST, GET as keysGET, DELETE as keysDELETE } from "../src/app/api/public/v1/keys/route";
import { db } from "../src/lib/db";
import { placeLimitOrder } from "../src/lib/dex-orders";
import type { NextRequest } from "next/server";

const BASE = "http://join-golden/api/public/v1/keys";
const results: Array<{ step: string; ok: boolean; detail: string }> = [];
function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${step} — ${detail}`);
}

function req(init: { method?: string; body?: unknown; key?: string } = {}): NextRequest {
  const headers = new Headers(init.key ? { authorization: `Bearer ${init.key}` } : {});
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  }) as unknown as NextRequest;
}

async function main() {
  // 1. תפוסה-ציבורית
  const infoRes = await keysGET(req());
  const info = await infoRes.json() as { ok?: boolean; activeKeys?: number; capacity?: number; open?: boolean };
  record("1.public-info", info.ok === true && typeof info.activeKeys === "number",
    `activeKeys=${info.activeKeys}/${info.capacity} open=${info.open}`);

  // 2. הנפקה-עצמית
  const postRes = await keysPOST(req({ method: "POST", body: { label: "golden-76" } }));
  const issued = await postRes.json() as { ok?: boolean; plaintext?: string; key?: { account: string; ratePerMin: number } };
  const raw = issued.plaintext ?? "";
  record("2.self-issue", postRes.status === 201 && issued.ok === true && raw.startsWith("sk-saos-") && !!issued.key,
    `status=${postRes.status} account=${issued.key?.account} rate=${issued.key?.ratePerMin}/min`);

  if (!raw || !issued.key) throw new Error("ההנפקה-נכשלה — המסלול-לא-ניתן-להמשך");

  try {
    // 3. מצב-עצמי
    const selfRes = await keysGET(req({ key: raw }));
    const self = await selfRes.json() as { ok?: boolean; key?: { account: string; requestCount: number }; balances?: Array<{ token: string; balance: number }> };
    const balances = self.balances ?? [];
    record("3.self-status", self.ok === true && self.key?.account === issued.key.account && balances.every((b) => Math.abs(b.balance) < 1e-9),
      `account=${self.key?.account} balances=${balances.length === 0 ? "ריק-אפס" : JSON.stringify(balances)}`);

    // 4. מסחר-בלי-כסף → חסימה-כנה
    const pair = await db.dexPair.findFirst({ where: { isNative: true } });
    if (!pair) throw new Error("אין-זוג-נייטיב");
    const res4 = await placeLimitOrder({ pairId: pair.id, side: "BUY", limitPrice: 0.5, amountIn: 2, account: issued.key.account, source: "API" });
    const blocked = "error" in res4 && res4.status === 400;
    const blockNote = "error" in res4 ? `status=${res4.status} ${res4.error}` : "הפקודה-עברה — הפרה-חמורה";
    record("4.zero-balance-blocked", blocked, blockNote);
  } finally {
    // 5. ביטול-עצמי
    const delRes = await keysDELETE(req({ method: "DELETE", key: raw }));
    const del = await delRes.json() as { ok?: boolean; revoked?: string };
    record("5.self-revoke", del.ok === true && del.revoked === raw.slice(0, 14), `revoked=${del.revoked}`);
  }

  // 6. מפתח-מת → 401
  const deadRes = await keysGET(req({ key: raw }));
  record("6.dead-key-401", deadRes.status === 401, `status=${deadRes.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== GOLDEN PATH: ${passed}/${results.length} ===`);
  await db.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
