/**
 * gate-bootstrap — הרמת-שער-הבעלים בסביבה-חדשה (פקודה-אחת, אפס-חשיפה).
 * ═══════════════════════════════════════════════════════════════════════════
 * מנדט-הבעלים (14.10, גל-9): "תראה שאתה פותח לי את השער שיהיה מסודר —
 * זה עדיין מפתח לא מאומת; המפתח שלי באחרים הוא פעיל".
 *
 * השורש-הנמדד: /home/z/.operator/config.json לא-נוסע-עם-הסנדבוקס (חוץ-ריפו
 * בכוונה — תורת-האבטחה) → בסביבה-חדשה השער fail-closed ("לא מאומת").
 *
 * התיקון: קורא את קובץ-המפתח-החי (upload/headcorner.txt), יוצר מלח-אקראי
 * ודיגסטים-מומלחים של כל-הצורות (מלא · שורה-לשורה · חיבור), כותב קונפיג 600.
 * המפתח עצמו לעולם לא נדפס, לא נשמר, לא נוסע — דיגסטים-בלבד.
 *
 * ריצה: node scripts/gate-bootstrap.mjs
 * אימות: POST /api/sovereign/gate {"key":"<המפתח שלך>"} → {"ok":true}
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

const KEY_FILE = path.join(process.cwd(), "upload", "headcorner.txt");
const CONFIG = "/home/z/.operator/config.json";

try {
  const raw = await readFile(KEY_FILE, "utf8");
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const forms = new Set();
  const full = raw.trim();
  if (full) forms.add(full);
  for (const l of lines) forms.add(l);
  if (lines.length >= 2) forms.add(lines.join(""));

  if (forms.size === 0) {
    console.error("gate-bootstrap: קובץ-המפתח ריק — מבטל, אפס-כתיבה");
    process.exit(1);
  }

  const salt = randomBytes(16).toString("hex");
  const hashes = [...forms].map((f) => createHash("sha256").update(salt + f).digest("hex"));

  await mkdir(path.dirname(CONFIG), { recursive: true });
  await writeFile(
    CONFIG,
    JSON.stringify(
      { salt, hashes, note: "owner-gate digests only — the key lives nowhere", created: new Date().toISOString() },
      null,
      1,
    ),
    { mode: 0o600 },
  );

  console.log(`gate-bootstrap: config written (${hashes.length} digests, values never printed) → ${CONFIG}`);
  console.log("gate-bootstrap: השער-מוכן — הדבק-את-המפתח-שלך-בשער (POST /api/sovereign/gate) ופתח");
} catch (err) {
  console.error("gate-bootstrap: כשל-כנה —", err.code ?? err.message);
  process.exit(1);
}
