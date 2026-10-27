/**
 * vault.ts — כספת-מעטפת-מקומית (SAOS-HSM-VAULT/1)
 * =================================================
 * תיקון-שורש (מחזור-37, trace 1a17d806eb807211): התלות `@saos/vault`
 * (file:/home/z/work/Saosmartwallet/packages/vault) מתה-עם-הסנדבוקס-הקודם —
 * הריפו לא-קיים-בענן. תורת-ה-HSM עצמה: הכספת כאן = סקראץ'-פר-בוט
 * (נמחקת-ונחתמת-מחדש-בכל-עלייה מה-env החי) — לכן מימוש-מקומי-נאמן חוקי
 * ואינו-מאבד-משמורת: חומר-המפתחות בא מה-env הבעלים-בלבד, אף-פעם-מהכספת.
 *
 * חוקי-העטיפה (זהים-לתורת repo-vault של saos-control-center):
 *  · AES-256-GCM, מפתח = sha256(master-hex-bytes), iv 12 בתים, tag 16 בתים.
 *  · כתיבה-אטומית (tmp+rename, 0600), כשל-פתיחה = fail-closed (boot abort).
 *  · withKey מאפס-את-חומר-המפתח מיד-אחרי-ה-callback (zeroize law).
 *  · wifDecode: base58check גרפני (0x80 ‖ 32-בתים [‖ 0x01 אם-דחוס] + checksum4).
 */
import { createDecipheriv, createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface VaultError extends Error {
  code: string;
}

function verr(code: string, msg: string): VaultError {
  const e = new Error(msg) as VaultError;
  e.code = code;
  return e;
}

function b58decode(s: string): Buffer {
  let num = 0n;
  for (const ch of s) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw verr("WIF-BAD-CHAR", "base58 char out of alphabet");
    num = num * 58n + BigInt(idx);
  }
  let hex = num.toString(16).padStart(2, "0");
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex");
  // leading '1's = leading zero bytes
  let lead = 0;
  for (const ch of s) {
    if (ch === "1") lead++;
    else break;
  }
  if (lead) buf = Buffer.concat([Buffer.alloc(lead), buf]);
  return buf;
}

export interface WifDecoded {
  secret: Buffer;
  compressed: boolean;
}

/** פענוח-WIF עם-בדיקת-checksum מלאה (sha256(sha256(payload))[:4] — החוק-החי-בקודה-הזאת, vector-pinned). */
export function wifDecode(wif: string): WifDecoded {
  const raw = b58decode(wif.trim());
  if (raw.length < 6) throw verr("WIF-TOO-SHORT", "decoded payload too short");
  const payload = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const sha = createHash("sha256").update(payload).digest();
  const expect = createHash("sha256").update(sha).digest().subarray(0, 4);
  if (!checksum.equals(expect)) throw verr("WIF-CHECKSUM", "base58check checksum mismatch");
  if (payload[0] !== 0x80) throw verr("WIF-VERSION", `expected version 0x80, got 0x${payload[0].toString(16)}`);
  const rest = payload.subarray(1);
  if (rest.length === 33 && rest[32] === 0x01) return { secret: rest.subarray(0, 32), compressed: true };
  if (rest.length === 32) return { secret: rest, compressed: false };
  throw verr("WIF-LENGTH", `unexpected secret length ${rest.length}`);
}

// ── העטיפה ────────────────────────────────────────────────────────────────
interface Envelope {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  ct: string;
  tag: string;
  sealedAt: string;
}

interface VaultEntry {
  type: string;
  material: string;
  meta: Record<string, unknown>;
}

function masterKey(): Buffer {
  const hex = (process.env.SAOS_VAULT_MASTER_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw verr("MASTER-ABSENT", "SAOS_VAULT_MASTER_KEY (hex64) absent — fail-closed, no self-mint");
  }
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest();
}

export interface Vault {
  sealKey(o: { id: string; type: string; material: string; meta?: Record<string, unknown> }): Promise<void>;
  withKey<T>(id: string, cb: (k: { material: string }) => T | Promise<T>): Promise<T>;
  listIds(): string[];
}

function encryptStore(map: Map<string, VaultEntry>, key: Buffer): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(Object.fromEntries(map)), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return {
    v: 1,
    alg: "AES-256-GCM",
    iv: iv.toString("hex"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("hex"),
    sealedAt: new Date().toISOString(),
  };
}

function decryptStore(env: Envelope, key: Buffer): Map<string, VaultEntry> {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "hex"));
  decipher.setAuthTag(Buffer.from(env.tag, "hex"));
  let pt: Buffer;
  try {
    pt = Buffer.concat([decipher.update(Buffer.from(env.ct, "base64")), decipher.final()]);
  } catch {
    throw verr("VAULT-DECRYPT-FAIL", "auth-tag verification failed — wrong master or tampered store (fail-closed)");
  }
  const obj = JSON.parse(pt.toString("utf8")) as Record<string, VaultEntry>;
  return new Map(Object.entries(obj));
}

/** פתיחת-הכספת: fail-closed על-מפתח-רע/חסר או-חנות-פגומה. */
export async function openVault(opts: { dir: string }): Promise<Vault> {
  const dir = opts.dir;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "keys.enc");
  const key = masterKey();
  let map = new Map<string, VaultEntry>();
  if (fs.existsSync(file)) {
    let env: Envelope;
    try {
      env = JSON.parse(fs.readFileSync(file, "utf8")) as Envelope;
    } catch {
      throw verr("VAULT-STORE-READ", "keys.enc unreadable — fail-closed");
    }
    map = decryptStore(env, key);
  }
  const persist = (): void => {
    const env = encryptStore(map, key);
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(env), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  return {
    async sealKey(o): Promise<void> {
      if (typeof o.id !== "string" || o.id.length === 0) throw verr("BAD-ID", "vault id required");
      // נרמול-בחתימה: חומר מסוג secp256k1-wif נפתח לסקלר 32-בתים בעת-החתימה-בכספת;
      // withKey מחזיר תמיד Buffer של 32 בתים (החוזה שקובעים signDigest/derivePublicKey).
      if (o.type === "secp256k1-wif") {
        const dec = wifDecode(o.material);
        map.set(o.id, {
          type: o.type,
          material: dec.secret.toString("hex"),
          meta: { ...(o.meta ?? {}), compressed: dec.compressed },
        });
      } else {
        map.set(o.id, { type: o.type, material: o.material, meta: o.meta ?? {} });
      }
      persist();
    },
    async withKey<T>(id: string, cb: (k: { material: Buffer }) => T | Promise<T>): Promise<T> {
      const entry = map.get(id);
      if (!entry) throw verr("KEY-ABSENT", `no key sealed under ${id}`);
      const buf = Buffer.from(entry.material, "hex"); // secp256k1-wif: 32-byte scalar
      try {
        return await cb({ material: buf }); // Buffer: the zeroize law applies to THIS object
      } finally {
        buf.fill(0); // zeroize law — same buffer the callback saw
      }
    },
    listIds: () => [...map.keys()],
  };
}
