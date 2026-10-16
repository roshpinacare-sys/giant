// trim-to-valid-prefix.mjs · חיתוך-הספר-לקידומת-התקפה-הארוכה-ביותר + הסגר-הזנב-השבור
import { createHash } from "crypto";
import fs from "fs";

const DIR = "/home/z/my-project/mini-services/fleet-economy/state";
const LEDGER = DIR + "/ledger.jsonl";
const lines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);

let prev = "GENESIS", good = 0;
for (const line of lines) {
  let t; try { t = JSON.parse(line); } catch { break; }
  const { h, ...rest } = t;
  if (createHash("sha256").update(JSON.stringify({ ...rest, prev })).digest("hex").slice(0, 32) !== h) break;
  prev = h; good++;
}
console.log("valid-prefix=" + good + " total=" + lines.length + " broken-tail=" + (lines.length - good));

if (good < lines.length) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const q = DIR + "/quarantine";
  fs.mkdirSync(q, { recursive: true });
  const tail = lines.slice(good);
  fs.writeFileSync(`${q}/${ts}·broken-duplicate-tail·ledger.jsonl`, tail.join("\n") + "\n");
  fs.writeFileSync(`${q}/${ts}·broken-duplicate-tail·REASON.txt`,
    `זנב-כפול-שבור (${tail.length} שורות, seq חוזר ${JSON.parse(tail[0]).seq}..) — שרידי-התנגשות-שני-בוטים. הקידומת-התקפה (${good}) נשארת-חיה. אפס-מחיקה.\n`);
  fs.writeFileSync(LEDGER, lines.slice(0, good).join("\n") + "\n");
  console.log("trimmed to " + good + " lines; tail quarantined");
} else {
  console.log("file already fully valid — no change");
}
// החזרת-מידע-לשחזור-סנאפשוט
console.log("TAIL_SEQ=" + JSON.parse(lines[good - 1]).seq + " TAIL_H=" + prev);
