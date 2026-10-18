import { NextResponse } from "next/server";
import { execFile } from "node:child_process";

export const dynamic = "force-dynamic";

/**
 * השלמת-התקנה-אחרי-חתימת-דפדפן (T-524 · מגשר-המפתחות-המוכן)
 * ==========================================================
 * מקבל-מהדפדפן: {refBlockNum, refBlockPrefix, expiration, signatureHex (65 בייט, hex 130)}.
 * הסקריפט-הקנוני: בונה-מחדש-את-הפעולה-מהאמת-החיה-בשרשרת (הדפדפן-לא-קובע-תוכן),
 * משחזר-את-החותם-מהחתימה, שופט-מול-הסמכויות-החיות-בשרשרת (active/owner בלבד),
 * משדר, ומאמת-על-השרשרת-אחרי-השידור. fail-closed-בכל-שער.
 * החתימה = חומר-ציבורי. המפתח-הפרטי-מעולם-לא-עזב-את-הדפדפן.
 */

const SCRIPT = "/home/z/audit/repos/steem/mini-services/saos-engine/hive-authority-browser.mjs";
const CWD = "/home/z/audit/repos/steem/mini-services/saos-engine";

function parseLastJson(text: string): Record<string, unknown> | null {
  const lines = text.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  const sig = typeof body.signatureHex === "string" ? body.signatureHex : "";
  if (!/^[0-9a-fA-F]{130}$/.test(sig)) {
    return NextResponse.json({ ok: false, error: "malformed-signature" }, { status: 400 });
  }
  const stdin = JSON.stringify({
    refBlockNum: body.refBlockNum,
    refBlockPrefix: body.refBlockPrefix,
    expiration: body.expiration,
    signatureHex: sig,
  });
  const result = await new Promise<{ stdout: string }>((resolve) => {
    execFile(
      "bun",
      [SCRIPT, "complete"],
      { cwd: CWD, timeout: 45_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env } },
      (err, stdout) => resolve({ stdout: String(stdout ?? (err ? String(err) : "")) })
    ).stdin?.end(stdin);
  });
  const parsed = parseLastJson(result.stdout);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "complete-failed", raw: result.stdout.slice(-400) }, { status: 502 });
  }
  return NextResponse.json(parsed);
}
