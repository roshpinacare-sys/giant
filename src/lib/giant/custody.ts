/**
 * פנקס-הקאסטודיה-הפנימי (T75 · הצי-הוא-הלקוח-הראשון — המשך-המסע)
 *
 * המאזנים-של-הצי-כלקוח, בכנות-מלאה:
 *  · cashMu   = מזומן-חופשי ב-mu (1mu = 1/1000 $)   · assetSat = ביטקוין-חופשי בסאטושי (1e8 sat = 1 BTC).
 *  · הצבת-פקודה נועלת-מראש את-מלוא-מה-שהיא-דורשת (LOCK) — מילוי משלם-מהנעול-בלבד, אף-מאזן-לא-יורד-מתחת-אפס.
 *  · ביטול משחרר-את-הנותר (UNLOCK) · מילוי משלם-במחיר-המנוחה ומחזיר-עודף-מחיר (UNLOCK).
 *  · כל-תנועה נרשמת-בפנקס (LedgerEntry) — GENESIS | LOCK | TRADE | UNLOCK.
 *  · "מאזן-אימון-פנימי" (paper) — כנות: אפס-כסף-אמיתי עד-M4; זו-מסגרת-האימון-של-הצי-כלקוח.
 */
import { Prisma } from "@prisma/client";

export const SAT = 100_000_000; /* סאטושי-לביטקוין */
export const GENESIS_CASH_MU = 10_000_000; /* 10,000 $ מאזן-פתיחה */
export const GENESIS_ASSET_SAT = 5_000_000; /* 0.05 BTC מאזן-פתיחה */
export const MAX_MU = 2_000_000_000; /* שמירה-מפני-גלישת-Int (כנה) */
export const MAX_SAT = 2_000_000_000;

export const qtyToSat = (qty: number) => Math.round(qty * SAT);
export const satToBtc = (sat: number) => sat / SAT;

/* שגיאת-קאסטודיה → 400 כנה ללקוח (יתרה-לא-מספקת · גלישת-מאזן) */
export class CustodyError extends Error {
  needed: number;
  have: number;
  constructor(message: string, needed: number, have: number) {
    super(message);
    this.needed = needed;
    this.have = have;
  }
}

type Tx = Prisma.TransactionClient;

/* ═══ מאזן-פתיחה-עצל: כל-חשבון-אמת שאין-לו-פנקס מקבל-מאזן-אימון פעם-אחת ═══ */
export async function ensureGenesis(tx: Tx, userId: string): Promise<{ cashMu: number; assetSat: number }> {
  const hasGenesis = await tx.ledgerEntry.count({ where: { userId, kind: "GENESIS" } });
  if (hasGenesis === 0) {
    await tx.user.update({
      where: { id: userId },
      data: { cashMu: { increment: GENESIS_CASH_MU }, assetSat: { increment: GENESIS_ASSET_SAT } },
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        kind: "GENESIS",
        deltaCashMu: GENESIS_CASH_MU,
        deltaAssetSat: GENESIS_ASSET_SAT,
        note: "מאזן-אימון-פנימי (paper · לפני-M4) — 10,000$ + 0.05 BTC",
      },
    });
  }
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { cashMu: true, assetSat: true } });
  return { cashMu: u.cashMu, assetSat: u.assetSat };
}

/* ═══ נעילה-בהצבה: בדיקת-יתרה + הוצאה-מהחופשי-אל-הפקודה ═══ */
export async function lockForOrder(
  tx: Tx,
  userId: string,
  side: "buy" | "sell",
  qtyRounded: number,
  priceMu: number,
): Promise<{ reservedCashMu: number; reservedAssetSat: number }> {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { cashMu: true, assetSat: true } });

  if (side === "buy") {
    const needMu = Math.ceil(qtyRounded * priceMu);
    if (u.cashMu < needMu) {
      throw new CustodyError(
        `יתרה-לא-מספקת — הקנייה דורשת ${(needMu / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}$ ויש-לך-חופשי ${(u.cashMu / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}$`,
        needMu,
        u.cashMu,
      );
    }
    await tx.user.update({ where: { id: userId }, data: { cashMu: { decrement: needMu } } });
    return { reservedCashMu: needMu, reservedAssetSat: 0 };
  }

  const needSat = qtyToSat(qtyRounded);
  if (needSat <= 0) throw new CustodyError("כמות-קטנה-מדי-לנעילה", 1, u.assetSat);
  if (u.assetSat < needSat) {
    throw new CustodyError(
      `יתרת-ביטקוין-לא-מספקת — המכירה דורשת ${qtyRounded} BTC ויש-לך-חופשי ${satToBtc(u.assetSat)} BTC`,
      needSat,
      u.assetSat,
    );
  }
  await tx.user.update({ where: { id: userId }, data: { assetSat: { decrement: needSat } } });
  return { reservedCashMu: 0, reservedAssetSat: needSat };
}

/* ═══ רישום-פנקס ═══ */
export async function ledger(
  tx: Tx,
  userId: string,
  kind: "GENESIS" | "LOCK" | "TRADE" | "UNLOCK",
  deltaCashMu: number,
  deltaAssetSat: number,
  opts: { orderId?: string; counterpartyUserId?: string; note?: string } = {},
): Promise<void> {
  await tx.ledgerEntry.create({
    data: { userId, kind, deltaCashMu, deltaAssetSat, orderId: opts.orderId ?? null, counterpartyUserId: opts.counterpartyUserId ?? null, note: opts.note ?? null },
  });
}

/* שחרור-שארית-נעולה-על-פקודה-שהסתיימה (FILLED/CANCELLED) — עם-סכום-מהודק */
export async function releaseResidual(
  tx: Tx,
  userId: string,
  side: "buy" | "sell",
  orderId: string,
  residualCashMu: number,
  residualAssetSat: number,
  reason: string,
): Promise<void> {
  if (residualCashMu > 0) {
    await tx.user.update({ where: { id: userId }, data: { cashMu: { increment: residualCashMu } } });
    await ledger(tx, userId, "UNLOCK", residualCashMu, 0, { orderId, note: `${reason} · שחרור-מזומן ${(residualCashMu / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}$` });
  }
  if (residualAssetSat > 0) {
    await tx.user.update({ where: { id: userId }, data: { assetSat: { increment: residualAssetSat } } });
    await ledger(tx, userId, "UNLOCK", 0, residualAssetSat, { orderId, note: `${reason} · שחרור-ביטקוין ${satToBtc(residualAssetSat)} BTC` });
  }
}
