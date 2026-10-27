/**
 * restore-secrets.ts — שחזור-חוקי של /home/z/.secrets/.env.local מהכספת-בגיט
 * (repo-vault sovereign-01-r2 · EXEC-CD-24 recovery doctrine · מחזור-37)
 * חוקי-אפס-חשיפה: ערכים לעולם לא נדפסים; WIF נשפט-שרשרת לפני-כתיבה; 0600; נמחק-בהצלחה.
 */
import { openRepoVault, fp } from "/home/z/my-project/repos/saos-control-center/src/lib/repo-vault";
import { wifDecode } from "/home/z/my-project/mini-services/wallet-hsm/src/vault";
import { derivePublicKey, pubFingerprint } from "/home/z/my-project/mini-services/wallet-hsm/src/secp256k1";
import fs from "node:fs";

const LIVE_FPS: Record<string, string> = {
  owner: "82aa2e317999c1df",
  active: "3f90c9f86ca7a5ba",
  posting: "5eefa73515d719c2",
  memo: "b497dc6f6cf15055",
};

const ABSORBED_TO_ENV: Record<string, string> = {
  "hc-steem-owner-wif-a": "STEEM_OWNER_WIF_A",
  "hc-steem-active-wif-a": "STEEM_ACTIVE_WIF_A",
  "hc-steem-active-wif-b": "STEEM_ACTIVE_WIF_B",
  "hc-steem-posting-wif-a": "STEEM_POSTING_WIF_A",
  "hc-steem-posting-wif-b": "STEEM_POSTING_WIF_B",
  "hc-steem-memo-wif-a": "STEEM_MEMO_WIF_A",
  "hc-steem-memo-wif-b": "STEEM_MEMO_WIF_B",
  "hc-hive-posting-wif-c": "HIVE_POSTING_WIF_C",
};

const authorityOf: Record<string, string> = {
  STEEM_OWNER_WIF_A: "owner",
  STEEM_ACTIVE_WIF_A: "active",
  STEEM_ACTIVE_WIF_B: "active",
  STEEM_POSTING_WIF_A: "posting",
  STEEM_POSTING_WIF_B: "posting",
  STEEM_MEMO_WIF_A: "memo",
  STEEM_MEMO_WIF_B: "memo",
};

const { bundle } = openRepoVault();
const absorbed = bundle.absorbed ?? {};
console.log(`[restore] vault opened (label=${bundle.label}) · absorbed slots: ${Object.keys(absorbed).length}`);

const out: Record<string, string> = {};

for (const [slot, envName] of Object.entries(ABSORBED_TO_ENV)) {
  const val = absorbed[slot];
  if (!val || val.length < 40) {
    console.log(`[restore] ${slot} → ${envName}: ABSENT (honest)`);
    continue;
  }
  let material: string;
  try {
    const dec = wifDecode(val);
    material = derivePublicKey(dec.secret).toString("hex");
  } catch (e) {
    console.log(`[restore] ${slot}: WIF-DECODE-REFUSED (${(e as Error).message.slice(0, 40)}) — NOT WRITTEN`);
    continue;
  }
  const f = pubFingerprint(Buffer.from(material, "hex"));
  const auth = authorityOf[envName];
  if (auth && LIVE_FPS[auth]) {
    const isA = envName.endsWith("_A");
    const match = f === LIVE_FPS[auth];
    console.log(`[restore] ${slot} → ${envName}: fp=${f} authority=${auth} ${match ? "CHAIN-MATCH" : "no-match(A/B rotation — A=live)"}`);
    if (isA && !match) {
      console.error(`[restore] FAIL-CLOSED: ${envName} (A-set) אינו תואם את הרשות החיה — עצירה`);
      process.exit(2);
    }
  }
  out[envName] = val;
}

for (const slot of ["hc-corner-key-b64", "HEAD_CORNER_MASTER", "GEN3_SHARD_B64"]) {
  const val = absorbed[slot];
  if (val) {
    const envName = slot === "hc-corner-key-b64" ? "HEAD_CORNER_KEY_B64" : slot;
    out[envName] = val;
    console.log(`[restore] ${slot} → ${envName}: SEALED-INTO-ENV fp=${fp(val)}`);
  } else {
    console.log(`[restore] ${slot}: ABSENT (honest)`);
  }
}

fs.mkdirSync("/home/z/.secrets", { recursive: true, mode: 0o700 });
const file = "/home/z/.secrets/.env.local";
const body = Object.entries(out).map(([k, v]) => `${k}=${v}`).join("\n");
fs.writeFileSync(file, body + "\n", { mode: 0o600 });
fs.chmodSync(file, 0o600);
console.log(`[restore] WROTE ${file} · ${Object.keys(out).length} slots · mode=0600 · values never logged`);

const mk = absorbed["HEAD_CORNER_MASTER"];
const mkPath = "/home/z/my-project/repos/saos-dex/.secrets/master-key.txt";
if (mk && !fs.existsSync(mkPath)) {
  fs.mkdirSync("/home/z/my-project/repos/saos-dex/.secrets", { recursive: true, mode: 0o700 });
  fs.writeFileSync(mkPath, mk, { mode: 0o600 });
  fs.chmodSync(mkPath, 0o600);
  console.log(`[restore] WROTE ${mkPath} (dex operator gate, 0600)`);
}
console.log("[restore] DONE");
