// force-js-secp.mjs — מהנדס-הריבונות · תיקון-20261021
// native secp256k1.node קורס תחת bun (symbol lookup: node::Buffer::HasInstance).
// dhive מציע fallback JS (elliptic) — מהיר-מספיק-לחתימות-שידור. Idempotent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const targets = [
  path.join(here, "..", "node_modules", "secp256k1", "bindings.js"),
  path.join(here, "..", "node_modules", "@hiveio", "dhive", "node_modules", "secp256k1", "bindings.js"),
];
const patch = "// forced JS fallback (native ABI mismatch under bun) — patched by force-js-secp.mjs\nthrow new Error('forced JS fallback: native secp256k1 ABI mismatch under bun');\n";
let n = 0;
for (const t of targets) {
  try {
    if (fs.existsSync(t) && !fs.readFileSync(t, "utf8").includes("forced JS fallback")) {
      fs.writeFileSync(t, patch); n++;
    }
  } catch { /* כנה: מדלג על נתיב בלתי-קיים */ }
}
console.log(`[force-js-secp] patched=${n}`);
