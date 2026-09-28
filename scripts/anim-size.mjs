/**
 * Peso del JS de animación (objetivo < 6 KB comprimido): reveals y barra de progreso,
 * parallax y línea de pasos, pausa táctil de los marquees y el script en línea de la intro.
 * Uso: node scripts/anim-size.mjs
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const entries = ['src/scripts/reveal.ts', 'src/scripts/motion.ts', 'src/scripts/marquee.ts'];
const result = await build({
  stdin: {
    contents: entries.map((e) => `import './${e}';`).join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  minify: true,
  format: 'esm',
  write: false,
});
const bundle = result.outputFiles[0].contents;
const intro = readFileSync('src/lib/intro.ts', 'utf8').match(/INTRO_SCRIPT =\s*\n?\s*"([^"]+)"/)[1];
const gz = gzipSync(bundle, { level: 9 }).length;
const introGz = gzipSync(intro, { level: 9 }).length;
const total = gz + introGz;
console.log(
  JSON.stringify({
    bundleBytes: bundle.length,
    bundleGzip: gz,
    introGzip: introGz,
    totalGzip: total,
  }),
);
if (total >= 6 * 1024) process.exit(1);
