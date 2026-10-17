/* ═══ fleet-economy-node · mini-service wrapper · פורט 3016 ═══
 * מריץ את מנוע-הכלכלה האמיתי מהריפו הריבוני (git = מקור-האמת):
 *   /home/z/work/fleet-economy (clone של roshpinacare-sys/fleet-economy @ main,
 *   economy-beat CI חי — seq 134,268+, עוגנים 3/3)
 * אפס-fork, אפס-סינתזה. המנוע מרים Bun.serve(:3016) + טיימרים
 * (tick/seal/snapshot/pollDexFills). ה-state הוא ספר-הגיט עצמו
 * (state/ בתוך הריפו) — כתיבה מקומית מנוהלת מול ה-CI דרך writer-lock.
 * סודות: אין. רשת: loopback בלבד ל-ingest. */
import "../../../work/fleet-economy/index.ts";
