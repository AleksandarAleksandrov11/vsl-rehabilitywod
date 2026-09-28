/**
 * npm run qa
 * 1. Compila con @astrojs/node (ASTRO_ADAPTER=node) y SITE_URL local.
 * 2. Lanza Playwright (tests/qa.spec.ts), que arranca scripts/qa-server.mjs con LEAD_MOCK=1.
 * Argumentos extra se pasan a Playwright (p. ej. `npm run qa -- -g "Formulario"`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';

const PORT = process.env.QA_PORT ?? '4321';
const env = {
  ...process.env,
  ASTRO_ADAPTER: 'node',
  SITE_URL: `http://127.0.0.1:${PORT}`,
  ASTRO_TELEMETRY_DISABLED: '1',
};

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

mkdirSync('qa/.tmp/fb', { recursive: true });
rmSync('qa/.tmp/leads.jsonl', { force: true });

// Copia local del fbevents.js real de Meta (y su config) para que los tests del Pixel no
// dependan de la red. Si no se puede descargar, los tests usan la red real.
const PIXEL = process.env.PUBLIC_META_PIXEL_ID ?? '1433154668778788';
const META_FILES = {
  'fbevents.js': 'https://connect.facebook.net/en_US/fbevents.js',
  'config.js': `https://connect.facebook.net/signals/config/${PIXEL}?v=2.9.408&r=stable`,
};
for (const [name, url] of Object.entries(META_FILES)) {
  const file = `qa/.tmp/fb/${name}`;
  const fresh = existsSync(file) && Date.now() - statSync(file).mtimeMs < 24 * 3600 * 1000;
  if (fresh) continue;
  let ok = false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      ok = true;
    }
  } catch {
    // fetch de Node no usa HTTPS_PROXY: se prueba con curl.
  }
  if (!ok) {
    const r = spawnSync('curl', ['-sSfL', '--max-time', '20', '-o', file, url], {
      stdio: 'inherit',
    });
    ok = r.status === 0;
  }
  console.log(`Meta ${name}: ${ok ? 'en caché' : 'no disponible (se usará la red)'}`);
}

if (!process.argv.includes('--no-build')) run('npx', ['astro', 'build']);
const testsStart = Date.now();
const tests = spawnSync(
  'npx',
  ['playwright', 'test', ...process.argv.slice(2).filter((a) => a !== '--no-build')],
  { stdio: 'inherit', env, shell: process.platform === 'win32' },
);

// Capturas más ligeras para el repositorio (PNG con paleta, visualmente equivalente).
const { default: sharp } = await import('sharp');
const { readdirSync, readFileSync } = await import('node:fs');
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory()
          ? walk(`${dir}/${d.name}`)
          : d.name.endsWith('.png')
            ? [`${dir}/${d.name}`]
            : [],
      )
    : [];
let saved = 0;
for (const file of walk('qa/screenshots')) {
  if (statSync(file).mtimeMs < testsStart) continue; // solo las capturas de esta ejecución
  const input = readFileSync(file);
  const out = await sharp(input)
    .png({ palette: true, quality: 90, effort: 7, compressionLevel: 9 })
    .toBuffer();
  if (out.length < input.length) {
    writeFileSync(file, out);
    saved += input.length - out.length;
  }
}
if (saved) console.log(`Capturas optimizadas: ${(saved / 1024 / 1024).toFixed(1)} MB menos`);
process.exit(tests.status ?? 1);
