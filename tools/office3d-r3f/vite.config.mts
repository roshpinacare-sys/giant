import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../../src');

/** vite.config.mts — בניית החדר המקצועי כ-bundle סטטי (אותו קוד-מקור כמו האפליקציה).
 * base './' — ה-bundle חי תחת נתיבים משתנים (/Domain/office3d/, /office3d/). */
export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  // office.css מגיע מקומפל מראש (tailwind-cli) — ה-PostCSS של האפליקציה לא רץ כאן
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: { '@': srcRoot },
  },
  build: {
    outDir: path.resolve(here, '../../dist-office3d'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2400,
  },
});
