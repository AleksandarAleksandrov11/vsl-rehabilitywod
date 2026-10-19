/**
 * Hash sha256 del script en línea de la home (src/lib/ad-script.ts) para la CSP de vercel.json.
 * Uso, después de `npm run build` (o del build del QA):
 *   node scripts/csp-hash.mjs          comprueba que vercel.json lo permite (sale con 1 si no)
 *   node scripts/csp-hash.mjs --write  actualiza el hash en vercel.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/client/index.html', 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(([, attrs]) => !/type="application\/ld\+json"/.test(attrs))
  .map(([, , body]) => body);
if (inline.length !== 1) throw new Error(`Se esperaba 1 script en línea y hay ${inline.length}`);
const hash = `'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`;

const file = 'vercel.json';
const vercel = readFileSync(file, 'utf8');
const policy = vercel.match(/"value": "(default-src[^"]+)"/)?.[1] ?? '';
if (policy.includes(hash)) {
  console.log(`CSP correcta: ${hash}`);
} else if (process.argv.includes('--write')) {
  const next = policy
    .replace(/ 'sha256-[A-Za-z0-9+/=]+'/g, '')
    .replace("script-src 'self'", `script-src 'self' ${hash}`);
  writeFileSync(file, vercel.replace(policy, next));
  console.log(`vercel.json actualizado: ${hash}`);
} else {
  console.error(`Falta ${hash} en script-src de vercel.json (node scripts/csp-hash.mjs --write)`);
  process.exit(1);
}
