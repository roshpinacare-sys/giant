#!/usr/bin/env node
/**
 * build.mjs — בניית-החדר המקצועי כ-bundle סטטי (vite → dist-office3d).
 * ---------------------------------------------------------------------------
 * · מריץ vite על tools/office3d-r3f (alias '@' → src) — אותו קוד-מקור של
 *   האפליקציה, אפס-שכפול.
 * · מעתיק את דגמי-האדם (public/models/humans → dist/models/humans) ואת
 *   favicon.svg — ה-bundle עצמאי-לגמרי בכל-מארח (Domain, office-pages, בדיקה).
 * · זהו ה"office3d:build" החדש — חדר-הווקסל ההיסטורי כבר אינו נבנה משום-מקום.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const DIST = join(REPO, 'dist-office3d');

rmSync(DIST, { recursive: true, force: true });
execFileSync('bunx', ['vite', 'build', '--config', join(HERE, 'vite.config.mts')], {
  cwd: REPO,
  stdio: 'inherit',
  timeout: 10 * 60_000,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});

mkdirSync(join(DIST, 'models'), { recursive: true });
const modelsSrc = join(REPO, 'public', 'models', 'humans');
if (!existsSync(modelsSrc)) {
  console.error(`[office3d-build] models missing at ${modelsSrc}`);
  process.exit(1);
}
cpSync(modelsSrc, join(DIST, 'models', 'humans'), { recursive: true });
const fav = join(REPO, 'public', 'favicon.svg');
if (existsSync(fav)) cpSync(fav, join(DIST, 'favicon.svg'));
console.log('[office3d-build] bundle ready →', DIST);
