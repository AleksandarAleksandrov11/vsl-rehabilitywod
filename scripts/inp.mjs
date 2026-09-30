/**
 * Mide la latencia de interacción (base del INP) de las interacciones clave de la home con la
 * CPU ralentizada 4x (móvil medio), usando la Event Timing API. Requiere el servidor de QA.
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.env.LH_URL ?? 'http://127.0.0.1:4321/';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await ctx.addInitScript(() => {
  window.__inp = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (e.interactionId) window.__inp.push({ name: e.name, d: e.duration });
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(URL, { waitUntil: 'networkidle' });
const steps = [];
const step = async (label, fn) => {
  const before = await page.evaluate(() => window.__inp.length);
  await fn();
  await page.waitForTimeout(600);
  const entries = await page.evaluate((n) => window.__inp.slice(n), before);
  const max = entries.reduce((m, e) => Math.max(m, e.d), 0);
  steps.push({ label, maxMs: Math.round(max) });
};
await step('Rechazar cookies (banner)', () => page.locator('[data-consent-action="reject"]').tap());
await step('CTA hero → #valoracion', () => page.locator('[data-cta="hero"]').tap());
await step('Chip "Rodilla"', () =>
  page
    .locator('#lead-form label.chip')
    .filter({ has: page.locator('input[value="Rodilla"]') })
    .tap(),
);
await step('Saltar paso', () => page.getByRole('button', { name: 'Saltar este paso' }).tap());
await step('Escribir nombre', () => page.locator('#nombre').pressSequentially('Ana'));
await step('Continuar', () => page.getByRole('button', { name: 'Continuar' }).tap());
await step('Abrir FAQ', () => page.locator('.faq-q').first().tap());
await step('Hover/tap tarjeta', () => page.locator('.suena-card').first().tap());
// El vídeo es el reproductor de YouTube (iframe de otro origen): sus clics no son de esta web.
const worst = Math.max(...steps.map((s) => s.maxMs));
console.table(steps);
console.log('Peor interacción (ms):', worst);
const OUT = process.env.LH_OUT ?? 'qa/lighthouse-v2';
mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/inp.json`,
  `${JSON.stringify({ cpuThrottling: 4, steps, worstMs: worst }, null, 2)}\n`,
);
await browser.close();
