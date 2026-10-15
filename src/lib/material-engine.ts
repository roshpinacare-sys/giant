// מנוע-החומר · material-engine — חיבור-כל-החומר-מכל-תיקיות-הגיט לממשק אחד
// הוראת-הבעלים (trace 1a13cb631ce67201): "המון המון חומר אבל כלום לא מחובר —
// אני עוד לא רואה רבע" → המנוע הזה סורק-חי את כל 13-תיקיות-הגיט, מאנדקס את
// כל-המסמכים, ומחזיר אותם קריאים-למסך. אפס-רשימה-מקודדת: הגילוי דינמי.

import { promises as fs } from "fs";
import path from "path";
import { ESTATE_ROOT } from "@/lib/estate-discovery";

/* ------------------- קבועים ------------------- */

export const MATERIAL_SCAN_ROOTS = [
  "t36/Domain",
  "t36/saos-dex",
  "t36/Console",
  "t36/FleetHQ",
  "t36/Sandbox",
  "t36/roshpina",
  "t35/Domain",
  "t35/saos-dex",
  "t35/Console",
  "t35/FleetHQ",
  "t35/Sandbox",
  "t35/roshpina",
];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "upload",
  "boot",
  "download",
  "operator", // פנימי-ורגיש — לא-נחשף-למסך
  "wallet",
  "keys",
  "secrets",
]);

const MAX_DEPTH = 7;
const MAX_DOCS = 4000;
const MAX_READ_BYTES = 400 * 1024;

export interface MaterialDoc {
  id: string; // <gen>/<repo>/<relPath>
  repo: string; // t36/Sandbox
  gen: "live" | "archive"; // t36=live, t35=archive (עדות-הישרדות)
  dir: string; // giant / ops / docs / receipts / "" (שורש)
  category: string; // תווית-עברית
  relPath: string;
  title: string; // מהכותרת הראשונה בקובץ
  bytes: number;
  mtime: string;
}

export interface MaterialIndex {
  docs: MaterialDoc[];
  totals: { docs: number; bytes: number };
  byCategory: { category: string; label: string; count: number; bytes: number }[];
  byRepo: { repo: string; gen: string; count: number; bytes: number }[];
  giantDocs: MaterialDoc[]; // מסמכי-giant — מקור-האמת
  scannedAt: string;
  rootsScanned: string[];
}

/* ------------------- קטגוריות ------------------- */

const CATEGORY_LABELS: Record<string, string> = {
  giant: "giant · מסמכי-האמת",
  docs: "תיעוד",
  ops: "תפעול-והחלטות",
  receipts: "קבלות-וראיות",
  research: "מחקר",
  proof: "הוכחות",
  agents: "סוכנים",
  fleet: "צי",
  engine: "מנועים",
  network: "רשת",
  audit: "ביקורת",
  heal: "ריפוי",
  state: "מצב-חי",
  console: "קונסולה",
  federation: "פדרציה",
  probes: "בדיקות-חישה",
  status: "מדידות-מעמד",
  tools: "כלים",
  retro: "רטרו-ולקחים",
  audit_reports: "דוחות-ביקורת",
};

function categoryOf(dir: string): { key: string; label: string } {
  const key = dir || "root";
  return { key, label: CATEGORY_LABELS[key] ?? (dir ? dir : "שורש-הריפו") };
}

/* ------------------- כותרת-מסמך ------------------- */

async function extractTitle(abs: string): Promise<string> {
  try {
    const fh = await fs.open(abs, "r");
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(2048), 0, 2048, 0);
    await fh.close();
    const head = buffer.slice(0, bytesRead).toString("utf8");
    for (const line of head.split("\n")) {
      const m = line.match(/^#{1,3}\s+(.{2,120})\s*$/);
      if (m) return m[1].replace(/\*/g, "").trim();
    }
  } catch {
    /* כותרת-חסרה — השם-בקובץ-יכפה */
  }
  return "";
}

/* ------------------- סריקה ------------------- */

async function walkMd(
  rootAbs: string,
  repoLabel: string,
  rel: string,
  depth: number,
  out: MaterialDoc[],
): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_DOCS) return;
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(path.join(rootAbs, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_DOCS) return;
    if (e.name.startsWith(".") && e.name !== ".well-known") continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      await walkMd(rootAbs, repoLabel, child, depth + 1, out);
    } else if (e.isFile() && e.name.endsWith(".md")) {
      const abs = path.join(rootAbs, child);
      try {
        const st = await fs.stat(abs);
        const title = (await extractTitle(abs)) || path.basename(e.name, ".md");
        const dir = path.dirname(child);
        const dirKey = dir === "." ? "" : dir.split("/")[0];
        out.push({
          id: `${repoLabel}/${child}`,
          repo: repoLabel,
          gen: repoLabel.startsWith("t36") ? "live" : "archive",
          dir: dirKey,
          category: categoryOf(dirKey).label,
          relPath: child,
          title,
          bytes: st.size,
          mtime: st.mtime.toISOString(),
        });
      } catch {
        /* קובץ-נעלם-בין-הרישום-לקריאה */
      }
    }
  }
}

/* ------------------- cache ------------------- */

let cache: { at: number; index: MaterialIndex } | null = null;
const CACHE_MS = 90_000;

export async function materialIndex(): Promise<MaterialIndex> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.index;

  const docs: MaterialDoc[] = [];
  const rootsScanned: string[] = [];
  for (const root of MATERIAL_SCAN_ROOTS) {
    const abs = path.join(ESTATE_ROOT, root);
    try {
      await fs.access(abs);
      rootsScanned.push(root);
      await walkMd(abs, root, "", 0, docs);
    } catch {
      /* שורש-נעדר — נדיר */
    }
  }
  // מסמכי-giant בראש האינדקס תמיד
  docs.sort(
    (a, b) =>
      (a.dir === "giant" ? 0 : 1) - (b.dir === "giant" ? 0 : 1) ||
      b.bytes - a.bytes,
  );

  const totalBytes = docs.reduce((s, d) => s + d.bytes, 0);
  const catMap = new Map<string, { count: number; bytes: number; label: string }>();
  for (const d of docs) {
    const key = d.dir || "root";
    const e = catMap.get(key) ?? { count: 0, bytes: 0, label: d.category };
    e.count += 1;
    e.bytes += d.bytes;
    catMap.set(key, e);
  }
  const byCategory = [...catMap.entries()]
    .map(([key, e]) => ({
      category: key,
      label: e.label,
      count: e.count,
      bytes: e.bytes,
    }))
    .sort((a, b) => b.count - a.count);

  const repoMap = new Map<string, { count: number; bytes: number }>();
  for (const d of docs) {
    const e = repoMap.get(d.repo) ?? { count: 0, bytes: 0 };
    e.count += 1;
    e.bytes += d.bytes;
    repoMap.set(d.repo, e);
  }
  const byRepo = [...repoMap.entries()]
    .map(([repo, e]) => ({ repo, gen: repo.startsWith("t36") ? "live" : "archive", ...e }))
    .sort((a, b) => b.count - a.count);

  const index: MaterialIndex = {
    docs,
    totals: { docs: docs.length, bytes: totalBytes },
    byCategory,
    byRepo,
    giantDocs: docs.filter((d) => d.dir === "giant" && d.repo.startsWith("t36")),
    scannedAt: new Date().toISOString(),
    rootsScanned,
  };
  cache = { at: Date.now(), index };
  return index;
}

/* ------------------- קריאת-מסמך-בטוחה ------------------- */

const REDACT_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{10,}/g,
  /github_pat_[A-Za-z0-9_]{10,}/g,
  /x-access-token:[^"'\s]+/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/g,
  /\b(?:sk|pk)-[A-Za-z0-9]{20,}\b/g,
  /\b[A-Fa-f0-9]{45,}\b/g, // מפתחות/חתימות-ארוכות
  /headcorner\s*[:=]\s*\S+/gi, // רק-השמות-של-הסוד — לא-המילה-בפרוזה (חוקי-הבית-מותרים-להיקרא)
];

export function redactContent(text: string): string {
  let out = text;
  for (const re of REDACT_PATTERNS) out = out.replace(re, "[הוצא-מהמסך]");
  return out;
}

export interface ReadResult {
  ok: boolean;
  error?: string;
  doc?: MaterialDoc;
  content?: string;
}

export async function readMaterialDoc(repo: string, relPath: string): Promise<ReadResult> {
  if (!MATERIAL_SCAN_ROOTS.includes(repo)) {
    return { ok: false, error: "repo-לא-ברשימת-הסריקה" };
  }
  const clean = path.normalize(relPath);
  if (clean.startsWith("..") || path.isAbsolute(clean)) {
    return { ok: false, error: "נתיב-פורח" };
  }
  if (!clean.endsWith(".md")) {
    return { ok: false, error: "רק-מסמכי-md-נחשפים" };
  }
  const segs = clean.split("/");
  if (segs.some((s) => SKIP_DIRS.has(s))) {
    return { ok: false, error: "נתיב-חסום" };
  }
  const abs = path.join(ESTATE_ROOT, repo, clean);
  const rootAbs = path.join(ESTATE_ROOT, repo);
  if (!abs.startsWith(rootAbs + path.sep)) {
    return { ok: false, error: "נתיב-מחוץ-לריפו" };
  }
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return { ok: false, error: "לא-קובץ" };
    if (st.size > MAX_READ_BYTES) return { ok: false, error: "קובץ-גדול-מכפי-המוצהר" };
    const raw = await fs.readFile(abs, "utf8");
    const dirKey = path.dirname(clean) === "." ? "" : path.dirname(clean).split("/")[0];
    return {
      ok: true,
      doc: {
        id: `${repo}/${clean}`,
        repo,
        gen: repo.startsWith("t36") ? "live" : "archive",
        dir: dirKey,
        category: categoryOf(dirKey).label,
        relPath: clean,
        title: (await extractTitle(abs)) || path.basename(clean, ".md"),
        bytes: st.size,
        mtime: st.mtime.toISOString(),
      },
      content: redactContent(raw),
    };
  } catch {
    return { ok: false, error: "קובץ-לא-נמצא" };
  }
}
