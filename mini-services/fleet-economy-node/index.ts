/* ═══ fleet-economy-node · mini-service wrapper · פורט 3016 ═══
 * מריץ את מנוע-הכלכלה האמיתי מה-lane המתוקן (ops/a1-economy-ledger-conservation
 * @ f66b356, selftest 29/29) ע"י יבוא-מודול ישיר — אפס-fork, אפס-סינתזה.
 * המנוע עצמו מרים Bun.serve(:3016) + טיימרים (tick/seal/snapshot/pollDexFills).
 * מצב: /home/z/work/fleet-economy/state (הספר האמיתי + הסגרים נשמרים שם).
 * סודות: אין. רשת: loopback בלבד ל-ingest. */
import "../../../work/fleet-economy/index.ts";
