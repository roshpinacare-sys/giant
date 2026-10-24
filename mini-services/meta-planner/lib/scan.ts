/**
 * scan.ts — מנוע-הניתוח-הסטטי הדטרמיניסטי של meta-planner (R365).
 *
 * חמישה כללי-חוב על מאגר-קוד (TS/JS):
 *   1. orphan-module    — קובץ-מקור ללא קשתות-נכנסות בגרף-הייבוא (ולא נקודת-כניסה)
 *   2. circular-import  — מעגל בגרף-הייבוא (DFS, זיהוי-מעגל קנוני)
 *   3. placeholder-code — סמני-קוד-שלד (הערות-השהיה, מימוש-חסר)
 *   4. plaintext-secret — טוקנים/מפתחות WIF/PEM/AWS/xprv בטקסט-גלוי
 *   5. silent-catch     — catch ריק או הערות-בלבד
 *   6. type-debt        — דיכוי-טיפוסים מפורש (סמני ts-ignore/expect-error/nocheck בסימן-ה-@) (v2)
 *
 * אפס-תלויות-חוץ (node:fs/path בלבד). כל-הפלטים ממוינים — אותו-קלט ⇒ אותו-פלט.
 * ראיות-סודות מוסתרות לעולם (§7B: אפס-סוד בלוג/פלט).
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep, dirname, posix } from "path";

export const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "state",
  "coverage",
];

/** נקודות-כניסה לגיטימיות — נכנסות-אפס בהן חוקיות */
const ENTRY_PATTERNS = [
  /(^|\/)index\.[cm]?[jt]sx?$/,
  /(^|\/)(main|cli|bin|server)\.[cm]?[jt]sx?$/,
  /\.config\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
];

export interface ScanOptions {
  /** מילות-התעלמות נוספות (שמות-תיקייה או סיומות-נתיב) */
  ignore?: string[];
  /** קבצים שייחשבו נקודות-כניסה גם אם אינם תואמים ENTRY_PATTERNS */
  extraEntries?: string[];
}

export interface RawFinding {
  kind: FindingKind;
  file: string;
  line: number;
  snippet: string;
  /** מזהה-מעגל/פירוט נוסף (למשל שרשרת-המעגל) */
  detail?: string;
}

import type { FindingKind } from "./contracts";

// ─── מדידת-מאגר ───────────────────────────────────────────────────────────────

function isIgnored(relPosix: string, ignore: string[]): boolean {
  const parts = relPosix.split("/");
  return parts.some((p) => ignore.includes(p));
}

export function listSourceFiles(root: string, opts: ScanOptions = {}): string[] {
  const ignore = [...DEFAULT_IGNORES, ...(opts.ignore ?? [])];
  const out: string[] = [];
  const walk = (abs: string): void => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const absChild = join(abs, e.name);
      const rel = relative(root, absChild).split(sep).join("/");
      if (e.isDirectory()) {
        if (!isIgnored(rel, ignore)) walk(absChild);
      } else if (e.isFile()) {
        const ext = e.name.slice(e.name.lastIndexOf(".")) || "";
        if (SOURCE_EXTS.has(ext) && !isIgnored(rel, ignore)) out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

// ─── גרף-ייבוא ────────────────────────────────────────────────────────────────

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

const RESOLVE_CANDIDATES = (base: string): string[] => [
  base,
  `${base}.ts`,
  `${base}.tsx`,
  `${base}.js`,
  `${base}.jsx`,
  `${base}.mjs`,
  `${base}.cjs`,
  posix.join(base, "index.ts"),
  posix.join(base, "index.tsx"),
  posix.join(base, "index.js"),
  posix.join(base, "index.mjs"),
];

/** פותח import יחסי "./x" "../y" לנתיב-מאגר מנורמל; חוזר null לחבילה-חיצונית */
export function resolveImport(fromFile: string, spec: string, allFiles: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const dir = posix.dirname(fromFile);
  const joined = posix.normalize(posix.join(dir, spec));
  for (const cand of RESOLVE_CANDIDATES(joined)) if (allFiles.has(cand)) return cand;
  return null;
}

export function buildImportGraph(
  root: string,
  files: string[],
): { edges: Map<string, Set<string>>; imports: Map<string, string[]> } {
  const all = new Set(files);
  const edges = new Map<string, Set<string>>();
  const imports = new Map<string, string[]>();
  for (const f of files) {
    edges.set(f, new Set());
    let text = "";
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    const resolved: string[] = [];
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(f, m[1], all);
      if (target && target !== f) {
        edges.get(f)!.add(target);
        resolved.push(target);
      }
    }
    imports.set(f, resolved.sort());
  }
  return { edges, imports };
}

// ─── כלל 1: מודול-יתום ────────────────────────────────────────────────────────

export function isEntryPoint(file: string, extraEntries: string[] = []): boolean {
  if (extraEntries.includes(file)) return true;
  return ENTRY_PATTERNS.some((re) => re.test(file));
}

export function findOrphans(
  root: string,
  opts: ScanOptions = {},
): { files: string[]; edges: Map<string, Set<string>>; all: string[] } {
  const files = listSourceFiles(root, opts);
  const { edges } = buildImportGraph(root, files);
  const inbound = new Map<string, number>();
  for (const f of files) inbound.set(f, 0);
  for (const [, targets] of edges) for (const t of targets) inbound.set(t, (inbound.get(t) ?? 0) + 1);
  const extra = opts.extraEntries ?? [];
  const orphans = files.filter(
    (f) => (inbound.get(f) ?? 0) === 0 && !isEntryPoint(f, extra),
  );
  return { files: orphans, edges, all: files };
}

// ─── כלל 2: ייבוא-מעגלי ───────────────────────────────────────────────────────

/** מוצא מעגלים אטומיים (strongly-connected בגודל ≥2) — Tarjan, פלט ממוין */
export function findCycles(edges: Map<string, Set<string>>): string[][] {
  const nodes = [...edges.keys()].sort();
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  const strong = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(edges.get(v) ?? [])].sort()) {
      if (!edges.has(w)) continue;
      if (!index.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length >= 2) sccs.push(comp.sort());
      // מעגל-עצמי (קובץ מייבא את עצמו) — נדיר אך חוקי-לדווח
      else if (comp.length === 1 && (edges.get(v) ?? new Set()).has(v)) sccs.push(comp);
    }
  };

  for (const n of nodes) if (!index.has(n)) strong(n);
  return sccs.sort((a, b) => (a.join("<") < b.join("<") ? -1 : 1));
}

// ─── כללים 3-5: סריקת-תוכן ───────────────────────────────────────────────────

// נבנה-מחרוזות-משורשרות בכוונה: שורת-ההגדרה לא תפגע בעצמה בסריקה-העצמית.
// סמני-קונבנציה — אותיות-גדולות בלבד (case-sensitive) כדי ששמות-קבצים/מזהים
// באנגלית-קטנה (למשל פיקסצ'ת מבחן) לא ידליקו ממצא-שווא; ניסוח-משפט — לא-רגיש-רישיות.
const MARKERS = ["TO" + "DO", "FIX" + "ME", "XX" + "X", "HA" + "CK"];
export const MARKERS_RE = new RegExp(
  "\\b(?:" + MARKERS.join("|") + ")\\b|\\bstu" + "b(?:bed)?\\b",
);
export const PROSE_RE = new RegExp(
  "\\bnot\\s+implemented\\b|\\bunimple" + "mented\\b",
  "i",
);
export const PLACEHOLDER_RE = new RegExp(
  [MARKERS_RE.source, PROSE_RE.source].join("|"),
);

export const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g },
  { name: "github-finegrained", re: /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g },
  { name: "wif-key", re: /\b[5KL][1-9A-HJ-NP-Za-km-z]{49,52}\b/g },
  { name: "pem-private-key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/g },
  { name: "xprv", re: /\bxprv[1-9A-HJ-NP-Za-km-z]{50,}\b/g },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "private-key-literal", re: /\bprivate[_-]?key\s*[:=]\s*["'][^"']{24,}["']/gi },
];

const CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{/g;

// כלל 6 (v2): דיכוי-טיפוסים מפורש — הסמנים היחידים שמכבים את האמת-הסטטית.
// נבנה-מרסקר כדי שהסריקה-העצמית של המודול עצמו לא תפגע בעצמה.
export const TYPE_SUPPRESS_RE = new RegExp(
  "@ts-(?:ig" + "nore|exp" + "ect-error|no" + "check)\\b",
);

/** סורק קובץ-יחיד: מחזיר ממצאי placeholder/silent-catch/plaintext-secret */
export function scanContent(file: string, text: string): RawFinding[] {
  const out: RawFinding[] = [];
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    // כלל 3: placeholder (הערות ומחרוזות כאחד — שניהם חוב-אפס בקנון)
    if (MARKERS_RE.test(line) || PROSE_RE.test(line)) {
      out.push({
        kind: "placeholder-code",
        file,
        line: i + 1,
        snippet: trimSnippet(line),
      });
    }
    // כלל 6 (v2): דיכוי-טיפוסים — הראיה מוסתרת-צורה (השורה עשויה לשאת קוד)
    if (TYPE_SUPPRESS_RE.test(line)) {
      out.push({
        kind: "type-debt",
        file,
        line: i + 1,
        snippet: trimSnippet(line),
        detail: (TYPE_SUPPRESS_RE.exec(line)?.[0] ?? "type-suppression").replace(/^@/, ""),
      });
    }
    // כלל 4: סודות בטקסט-גלוי — הראיה מוסתרת תמיד
    for (const { name, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        out.push({
          kind: "plaintext-secret",
          file,
          line: i + 1,
          snippet: redactSnippet(line),
          detail: name,
        });
      }
    }
  });

  // כלל 5: catch שותק — התאמת-סוגריים ממוספרת-שורות
  for (const m of text.matchAll(CATCH_RE)) {
    const start = m.index ?? 0;
    const openBrace = text.indexOf("{", start);
    if (openBrace === -1) continue;
    const close = matchBrace(text, openBrace);
    if (close === -1) continue;
    const body = text.slice(openBrace + 1, close);
    const stripped = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .trim();
    if (stripped.length === 0) {
      const line = text.slice(0, start).split("\n").length;
      out.push({ kind: "silent-catch", file, line, snippet: trimSnippet(m[0]) });
    }
  }

  return out;
}

function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function trimSnippet(line: string, max = 120): string {
  const t = line.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** מסתיר תוכן-סודי: אפס-בייט-סוד בשום-פלט (§7B) */
export function redactSnippet(line: string, max = 120): string {
  let redacted = line.trim();
  for (const { re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    redacted = redacted.replace(re, (m) => `${m.slice(0, 6)}…REDACTED(len=${m.length})`);
  }
  return redacted.length > max ? redacted.slice(0, max - 1) + "…" : redacted;
}

// ─── מנוע-מלא ─────────────────────────────────────────────────────────────────

export interface ScanResult {
  root: string;
  files: string[];
  findings: RawFinding[];
  importEdges: Map<string, Set<string>>;
}

/** סריקה מלאה ודטרמיניסטית של מאגר: כל חמשת הכללים, פלט ממוין-יציב */
export function scanTarget(root: string, opts: ScanOptions = {}): ScanResult {
  const files = listSourceFiles(root, opts);
  const { edges, imports } = buildImportGraph(root, files);
  const findings: RawFinding[] = [];
  const extra = opts.extraEntries ?? [];

  // 1. יתומים
  const inbound = new Map<string, number>();
  for (const f of files) inbound.set(f, 0);
  for (const [, targets] of edges) for (const t of targets) inbound.set(t, (inbound.get(t) ?? 0) + 1);
  for (const f of files) {
    if ((inbound.get(f) ?? 0) === 0 && !isEntryPoint(f, extra)) {
      findings.push({ kind: "orphan-module", file: f, line: 1, snippet: "(zero inbound import edges)" });
    }
  }

  // 2. מעגלים — ראיה אחת לכל SCC, על-קשת-הפתיחה הממוינת
  for (const scc of findCycles(edges)) {
    const chain = [...scc, scc[0]].join(" -> ");
    const first = scc[0];
    let line = 1;
    try {
      const text = readFileSync(join(root, first), "utf8");
      const allSet = new Set(files);
      for (const mm of text.matchAll(IMPORT_RE)) {
        if (resolveImport(first, mm[1], allSet) === scc[1]) {
          line = text.slice(0, mm.index ?? 0).split("\n").length;
          break;
        }
      }
    } catch {
      line = 1;
    }
    findings.push({
      kind: "circular-import",
      file: first,
      line,
      snippet: trimSnippet(chain),
      detail: chain,
    });
  }

  // 3-5. תוכן
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    findings.push(...scanContent(f, text));
  }
  void imports;

  findings.sort((a, b) =>
    a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line,
  );
  return { root, files, findings, importEdges: edges };
}
