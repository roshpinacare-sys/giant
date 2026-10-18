"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { hmac } from "@noble/hashes/hmac";
import * as secp from "@noble/secp256k1";
import bs58 from "bs58";
import { KeyRound, ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/* חיווט-hmac-ל-noble-v2 (חתימת-ECDSA) */
const _concat = (...bs: Uint8Array[]) => {
  const t = bs.reduce((n, x) => n + x.length, 0);
  const o = new Uint8Array(t);
  let k = 0;
  for (const x of bs) {
    o.set(x, k);
    k += x.length;
  }
  return o;
};
const _kw = (secp.etc ?? (secp as unknown as { utils: { hmacSha256Sync: unknown } }).utils) as { hmacSha256Sync: (key: Uint8Array, ...msgs: Uint8Array[]) => Uint8Array; hmacSha256Async?: (key: Uint8Array, ...msgs: Uint8Array[]) => Promise<Uint8Array> };
_kw.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, _concat(...msgs));
_kw.hmacSha256Async = async (key, ...msgs) => hmac(sha256, key, _concat(...msgs));

/* ═══ גשר-הרשאת-הפרסום · חתימה-בדפדפן (T-524 השלמת-מסילה) ═══
 * המנוע-מכין (סריאליזציה-בלבד, אפס-סודות) → הדפדפן-שלך-חותם-מקומית
 * (המפתח-הפרטי-לעולם-לא-נשלח-לשום-שרת) → השרת-מאמת-על-ידי-השרשרת-שהחותם
 * הוא-מהסמכות-ה-active/owner-החיה → משדר → מאמת-על-השרשרת.
 * הפעולה תוספתית-בלבד: מפתח-המנוע מצטרף לסמכות-ה-posting; owner/active/memo לא נוגעים. */

interface Prepared {
  ok: boolean;
  already?: boolean;
  chainIdHex?: string;
  serializedHex?: string;
  refBlockNum?: number;
  refBlockPrefix?: number;
  expiration?: number;
  account?: string;
  livePostingPub?: string;
  enginePub?: string;
  threshold?: number;
  error?: string;
  failClosed?: boolean;
}

interface CompleteVerdict {
  ok?: boolean;
  txid?: string | null;
  installed?: boolean;
  liveKeys?: number;
  enginePubFp?: string;
  error?: string;
  failClosed?: boolean;
  note?: string;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256d(b: Uint8Array): Uint8Array {
  return sha256(sha256(b));
}

function wifToPriv(wifRaw: string): { priv: Uint8Array; pubStm: string } | null {
  const wif = wifRaw.trim();
  if (!/^[5KLP][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(wif)) return null;
  let body: Uint8Array;
  try {
    const dec = bs58.decode(wif.startsWith("P") ? wif.slice(1) : wif);
    const chk = dec.slice(-4);
    const payload = dec.slice(0, -4);
    // שתי-חוקי-הסכום-הקיימים-בשטח: sha256d-סטנדרטי (ארנקי-בעלים) · ripemd160-ישיר (חוק-R10, מפתחות-כספת-היסטוריים)
    const std = Buffer.from(sha256d(payload));
    const alt = Buffer.from(ripemd160(payload));
    const chkB = Buffer.from(chk);
    if (!(std.subarray(0, 4).equals(chkB) || alt.subarray(0, 4).equals(chkB))) return null;
    body = payload;
  } catch {
    return null;
  }
  if ((body.length !== 33 && body.length !== 34) || body[0] !== 0x80) return null;
  const priv = body.slice(1, 33);
  const pub33 = secp.getPublicKey(priv, true);
  const chk2 = ripemd160(pub33).slice(0, 4);
  let n = 0n;
  for (const byte of new Uint8Array([...pub33, ...chk2])) n = n * 256n + BigInt(byte);
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const byte of new Uint8Array([...pub33, ...chk2])) {
    if (byte === 0) s = "1" + s;
    else break;
  }
  return { priv, pubStm: "STM" + s };
}

export function HiveAuthorityBridge() {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [prepErr, setPrepErr] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<CompleteVerdict | null>(null);

  /* זיהוי-המפתח-שהוקלד — נגזר-ומוצג-מקומית-בלבד (לעולם-לא-נשלח) */
  const keyFp = useMemo(() => {
    const k = keyInput.trim();
    if (k.length < 51) return null;
    const dec = wifToPriv(k);
    return dec ? dec.pubStm.slice(0, 14) + "…" : "מפתח-לא-תקין";
  }, [keyInput]);

  const loadPrepare = useCallback(async () => {
    setPrepErr(null);
    setPrepared(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/hive-authority/prepare", { method: "POST", cache: "no-store" });
      const d = (await res.json()) as Prepared;
      if (d.ok) setPrepared(d);
      else setPrepErr(d.error ?? "prepare-unknown");
    } catch {
      setPrepErr("prepare-unreachable");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/hive-authority/prepare", { method: "POST", cache: "no-store" });
        const d = (await res.json()) as Prepared;
        if (!alive) return;
        if (d.ok) setPrepared(d);
        else setPrepErr(d.error ?? "prepare-unknown");
      } catch {
        if (alive) setPrepErr("prepare-unreachable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadPrepare]);

  const signAndBroadcast = useCallback(async () => {
    const p = prepared;
    if (!p?.chainIdHex || !p?.serializedHex || !p.refBlockNum === undefined) return;
    const dec = wifToPriv(keyInput);
    if (!dec) {
      setVerdict({ ok: false, error: "מפתח-לא-תקין — בדוק-העתקה" });
      return;
    }
    setBusy(true);
    setVerdict(null);
    try {
      const chainId = new Uint8Array(Buffer.from(p.chainIdHex, "hex"));
      const tx = new Uint8Array(Buffer.from(p.serializedHex, "hex"));
      const digest = sha256(new Uint8Array([...chainId, ...tx]));
      const sig = await secp.sign(digest, dec.priv, { prehash: false });
      const rec = sig.recovery ?? 0;
      const r = sig.r.toString(16).padStart(64, "0");
      const s = sig.s.toString(16).padStart(64, "0");
      const signatureHex = Buffer.from([31 + rec, ...Buffer.from(r + s, "hex")]).toString("hex");
      const res = await fetch("/api/hive-authority/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ refBlockNum: p.refBlockNum, refBlockPrefix: p.refBlockPrefix, expiration: p.expiration, signatureHex }),
      });
      const v = (await res.json()) as CompleteVerdict;
      setVerdict(v);
    } catch {
      setVerdict({ ok: false, error: "חתימה/שידור-נכשלו" });
    } finally {
      setBusy(false);
    }
  }, [prepared, keyInput]);

  const fp = (s?: string) => (s ? s.slice(0, 14) + "…" : "—");

  return (
    <section aria-label="גשר-הרשאת-פרסום-HIVE" className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-amber-500" aria-hidden />
        <h2 className="text-lg font-semibold text-zinc-100">הפעלת-סמכות-הפרסום ב-Hive · חתימה בדפדפן-שלך</h2>
      </div>
      <p className="mb-3 text-sm text-zinc-400">
        הפעולה האחרונה-שנותרה: הוספת-מפתח-המנוע <span className="font-mono text-amber-500">STM6y7Dtk…K7Wn</span> לסמכות-הפרסום של{" "}
        <span className="font-mono">headcorner</span> — <b>תוספתית-בלבד</b>, המפתחות-שלך-נשארים. המפתח-הפרטי-מוקלד-כאן, בדפדפן-שלך,{" "}
        <b>ולעולם-לא-נשלח-לשרת</b> — רק-החתימה-הציבורית-חוזרת-ומשודרת-אחרי-שיפוט-השרשרת.
      </p>

      {!prepared && !prepErr && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> מכין-עסקה-מהשרשרת…
        </div>
      )}
      {prepErr && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            הכנת-העסקה-נכשלה ({prepErr}). הסיבה-השכיחה: סלוט-מפתח-המנוע-לא-מקומי-אחרי-איפוס-סנדבוקס — מריצים-מחדש-את-שחזור-הכספת.
            <button onClick={loadPrepare} className="mr-2 underline underline-offset-2 hover:text-red-200">
              נסה-שוב
            </button>
          </div>
        </div>
      )}

      {prepared?.already && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> מפתח-המנוע-כבר-חי-בסמכות-הפרסום — אין-צורך-בפעולה.
        </div>
      )}

      {prepared && !prepared.already && (
        <div className="space-y-3">
          <dl className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs text-zinc-400 sm:grid-cols-2">
            <div>
              <dt className="inline text-zinc-500">חשבון: </dt>
              <dd className="inline text-zinc-300">{prepared.account}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">פרסום-חי כעת: </dt>
              <dd className="inline text-zinc-300">{fp(prepared.livePostingPub)}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">מפתח-המנוע-המצטרף: </dt>
              <dd className="inline text-amber-500">{fp(prepared.enginePub)}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">תוקף-העסקה: </dt>
              <dd className="inline text-zinc-300">{prepared.expiration ? new Date(prepared.expiration * 1000).toISOString().slice(11, 19) + "Z" : "—"}</dd>
            </div>
          </dl>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">המפתח-ה-active-שלך (לעולם-לא-עוזב-את-הדפדפן):</span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => {
              setKeyInput(e.target.value);
              setVerdict(null);
            }}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder="P… / K… / L… / 5…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/40"
            />
            {keyFp && <span className="mt-1 block font-mono text-xs text-zinc-500">זיהוי-המפתח-שהוקלד: {keyFp}</span>}
          </label>

          <button
            onClick={signAndBroadcast}
            disabled={busy || keyInput.trim().length < 51 || !!keyFp?.includes("לא-תקין")}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {busy ? "חותם-ומשדר…" : "חתום-בדפדפן-ושדר-לשרשרת"}
          </button>

          {verdict && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                verdict.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
              role="status"
            >
              {verdict.ok ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    <b>הפעלה-מוצלחת — מפתח-המנוע-חי-בסמכות-הפרסום</b>
                  </div>
                  <div className="font-mono text-xs">
                    txid: {verdict.txid ?? "—"} · מפתחות-פרסום-חיים: {verdict.liveKeys ?? "—"} · {verdict.enginePubFp ?? ""}
                  </div>
                  {verdict.note && <div className="text-xs opacity-80">{verdict.note}</div>}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    <b>נדחה-בכבוד (fail-closed)</b>
                  </div>
                  <div className="text-xs">
                    {verdict.error === "ACTIVE-AUTHORITY-MISMATCH" || verdict.error === "G2-active-mismatch"
                      ? "המפתח-שהוקלד-אינו-בסמכות-ה-active/owner-החיה-של-headcorner. ודא-שהעתקת-את-המפתח-הנכון-מארנק-הדפדפן."
                      : verdict.error ?? "כשל-לא-מזוהה"}
                  </div>
                  {verdict.note && <div className="text-xs opacity-80">{verdict.note}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
