/**
 * npm run qa:lighthouse
 * Lighthouse (móvil y escritorio) sobre la home servida por scripts/qa-server.mjs.
 * Requiere un build previo con ASTRO_ADAPTER=node (lo hace `npm run qa`).
 * Guarda los informes HTML y JSON en qa/lighthouse/ y un resumen en qa/lighthouse/summary.json.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from '@playwright/test';

const PORT = process.env.QA_PORT ?? '4321';
const URL = process.env.LH_URL ?? `http://127.0.0.1:${PORT}/`;
const OUT = 'qa/lighthouse';
const RUNS = Number(process.env.LH_RUNS ?? 3);
mkdirSync(OUT, { recursive: true });

async function up() {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}

let server;
if (!(await up())) {
  server = spawn('node', ['scripts/qa-server.mjs'], {
    env: { ...process.env, PORT, LEAD_MOCK: '1' },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50 && !(await up()); i += 1) await new Promise((r) => setTimeout(r, 200));
}

const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

const summary = {};
try {
  for (const [name, config] of [
    ['mobile', undefined],
    ['desktop', desktopConfig],
  ]) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) {
      const result = await lighthouse(
        URL,
        { port: chrome.port, output: ['html', 'json'], logLevel: 'error' },
        config,
      );
      if (!result) throw new Error('Lighthouse no devolvió resultado');
      const { lhr, report } = result;
      const scores = Object.fromEntries(
        Object.entries(lhr.categories).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]),
      );
      const metrics = {
        FCP: lhr.audits['first-contentful-paint'].numericValue,
        LCP: lhr.audits['largest-contentful-paint'].numericValue,
        TBT: lhr.audits['total-blocking-time'].numericValue,
        CLS: lhr.audits['cumulative-layout-shift'].numericValue,
        SI: lhr.audits['speed-index'].numericValue,
        bytes: lhr.audits['total-byte-weight'].numericValue,
      };
      runs.push({ scores, metrics, report });
      console.log(name, `run ${i + 1}`, JSON.stringify(scores), JSON.stringify(metrics));
    }
    // Informe guardado: la ejecución mediana por Performance.
    runs.sort((a, b) => a.scores.performance - b.scores.performance);
    const median = runs[Math.floor(runs.length / 2)];
    writeFileSync(`${OUT}/home-${name}.html`, median.report[0]);
    writeFileSync(`${OUT}/home-${name}.json`, median.report[1]);
    summary[name] = {
      median: { scores: median.scores, metrics: median.metrics },
      runs: runs.map((r) => ({ scores: r.scores, metrics: r.metrics })),
    };
  }
} finally {
  chrome.kill();
  server?.kill();
}

writeFileSync(`${OUT}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.median])),
    null,
    2,
  ),
);
