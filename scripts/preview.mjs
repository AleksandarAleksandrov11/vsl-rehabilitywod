/**
 * npm run preview
 * @astrojs/vercel no admite `astro preview`: se compila con @astrojs/node y se sirve dist/
 * aplicando vercel.json (cabeceras, CSP, redirecciones) y con LEAD_MOCK=1.
 */
import { spawnSync, spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '4321';
const env = {
  ...process.env,
  ASTRO_ADAPTER: 'node',
  SITE_URL: process.env.SITE_URL ?? `http://127.0.0.1:${PORT}`,
};
const build = spawnSync('npx', ['astro', 'build'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);
spawn('node', ['scripts/qa-server.mjs'], {
  stdio: 'inherit',
  env: { ...env, PORT, LEAD_MOCK: process.env.LEAD_MOCK ?? '1' },
});
