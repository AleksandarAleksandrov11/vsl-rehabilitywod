/**
 * Peso del JS de animación (objetivo < 6 KB comprimido): reveals y barra de progreso,
 * parallax y línea de pasos, y pausa táctil de los marquees.
 * Uso: node scripts/anim-size.mjs
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

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
const gz = gzipSync(bundle, { level: 9 }).length;
console.log(JSON.stringify({ bundleBytes: bundle.length, bundleGzip: gz }));
if (gz >= 6 * 1024) process.exit(1);
