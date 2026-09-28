/**
 * Calcula el hash sha256 del script en línea de la intro (src/lib/intro.ts) y comprueba que
 * está en la CSP de vercel.json. Uso: node scripts/csp-hash.mjs [--write]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/intro.ts', import.meta.url), 'utf8');
const match = src.match(/INTRO_SCRIPT =\s*\n?\s*"([^"]+)"/);
if (!match) throw new Error('No se encuentra INTRO_SCRIPT en src/lib/intro.ts');
const hash = `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`;

const file = new URL('../vercel.json', import.meta.url);
const vercel = readFileSync(file, 'utf8');
if (vercel.includes(hash)) {
  console.log(`OK: la CSP ya incluye ${hash}`);
} else if (process.argv.includes('--write')) {
  const next = vercel
    .replace(/'sha256-[A-Za-z0-9+/=]+' ?/g, '')
    .replace("script-src 'self'", `script-src 'self' ${hash}`);
  writeFileSync(file, next);
  console.log(`vercel.json actualizado con ${hash}`);
} else {
  console.error(`Falta ${hash} en la CSP de vercel.json (ejecuta con --write).`);
  process.exit(1);
}
