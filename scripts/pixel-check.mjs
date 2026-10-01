/**
 * node scripts/pixel-check.mjs
 * Comprueba el Meta Pixel con el fbevents.js real de Meta y la configuración real del Pixel
 * (se descargan de connect.facebook.net). Las llamadas de eventos a facebook.com/tr se capturan y
 * se responden en local: así se comprueba qué se enviaría sin meter leads de prueba en las
 * estadísticas del Pixel.
 *
 * Comprueba: nada de Meta sin consentimiento o al rechazar; al aceptar, carga del Pixel y
 * PageView; ViewContent al dar al play del vídeo (reproductor real de YouTube); FormStart al
 * pasar el paso 1; Lead con el mismo eventID que el lead que recibe el servidor (para
 * deduplicar con la API de conversiones), y que al retirar el consentimiento no sale nada más.
 * Requiere red y un build previo: ASTRO_ADAPTER=node npx astro build
 */
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4392;
const SITE = `http://127.0.0.1:${PORT}`;
const PIXEL_ID = process.env.PUBLIC_META_PIXEL_ID ?? '1433154668778788';
const LEADS = 'qa/.tmp/pixel-check-leads.jsonl';
// Un navegador normal (el Pixel ignora los navegadores automatizados).
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
};

rmSync(LEADS, { force: true });
const site = spawn('node', ['scripts/qa-server.mjs'], {
  env: { ...process.env, PORT: String(PORT), LEAD_MOCK: '1', LEAD_MOCK_FILE: LEADS },
  stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(SITE)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch();

async function newContext() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: UA,
    locale: 'es-ES',
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(() => sessionStorage.setItem('rw_intro', '1'));
  const meta = { scripts: [], events: [] };
  ctx.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'connect.facebook.net') meta.scripts.push(u.pathname);
  });
  await ctx.route(/https:\/\/www\.facebook\.com\/tr\/?/, async (route) => {
    const req = route.request();
    const params = new URLSearchParams(new URL(req.url()).search);
    const body = req.postData();
    if (body && !params.get('ev')) new URLSearchParams(body).forEach((v, k) => params.set(k, v));
    meta.events.push(Object.fromEntries(params));
    await route.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
  });
  return { ctx, meta };
}
const names = (meta) => meta.events.map((e) => e.ev);
const waitFor = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

try {
  // 1) Rechazar: nada de Meta.
  {
    const { ctx, meta } = await newContext();
    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: 'networkidle' });
    check(
      'Sin elegir cookies no se carga nada de Meta',
      meta.scripts.length === 0 && meta.events.length === 0,
    );
    await page.locator('[data-consent-action="reject"]').click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    check(
      'Al rechazar sigue sin cargarse nada de Meta',
      meta.scripts.length === 0 && meta.events.length === 0,
    );
    await ctx.close();
  }

  // 2) Aceptar y recorrer el embudo.
  const { ctx, meta } = await newContext();
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.locator('[data-consent-action="accept"]').click();
  await waitFor(() => names(meta).includes('PageView'));
  check(
    'Al aceptar se carga fbevents.js real de Meta',
    meta.scripts.some((p) => p.endsWith('/fbevents.js')),
  );
  check(
    `Se carga la configuración real del Pixel ${PIXEL_ID}`,
    meta.scripts.some((p) => p.includes(`/signals/config/${PIXEL_ID}`)),
  );
  const pv = meta.events.find((e) => e.ev === 'PageView');
  check('PageView con el ID del Pixel', pv?.id === PIXEL_ID, pv ? `id=${pv.id}` : 'no enviado');
  const fbp = (await ctx.cookies()).find((c) => c.name === '_fbp');
  check('Cookie _fbp creada tras aceptar', !!fbp, fbp?.value);

  // Vídeo: reproductor real de YouTube.
  await page.locator('#video').scrollIntoViewIfNeeded();
  const ready = await page
    .waitForFunction(() => document.querySelector('[data-vsl] iframe.is-ready'), null, {
      timeout: 20000,
    })
    .then(() => true)
    .catch(() => false);
  if (ready) {
    await page.waitForTimeout(1500);
    const box = await page.locator('[data-vsl] iframe').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await waitFor(() => names(meta).includes('ViewContent'), 12000);
    const vc = meta.events.find((e) => e.ev === 'ViewContent');
    check(
      'ViewContent al dar al play del vídeo',
      !!vc,
      vc ? `content_name=${vc['cd[content_name]']}` : 'no enviado',
    );
  } else {
    check('ViewContent al dar al play del vídeo', false, 'el reproductor de YouTube no cargó');
  }

  // Formulario.
  await page.locator('#valoracion').scrollIntoViewIfNeeded();
  await page
    .locator('#lead-form label.chip')
    .filter({ has: page.locator('input[value="Codo"]') })
    .click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await waitFor(() => names(meta).includes('FormStart'));
  check('FormStart al completar el paso 1', names(meta).includes('FormStart'));
  await page.getByRole('button', { name: 'Saltar este paso' }).click();
  await page.locator('#nombre').fill('Prueba Pixel');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#telefono').fill('600 000 000');
  await page.locator('label[for="consentimiento_salud"]').click();
  await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
  await page.waitForURL(/\/gracias/, { timeout: 15000 });
  await waitFor(() => names(meta).includes('Lead'));
  const lead = meta.events.find((e) => e.ev === 'Lead');
  const saved = readFileSync(LEADS, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .at(-1);
  check('Lead enviado al completar el formulario', !!lead);
  check(
    'El Lead lleva el mismo eventID que el lead del servidor (deduplicación con CAPI)',
    !!lead?.eid && lead.eid === saved?.event_id,
    `eid=${lead?.eid}`,
  );
  check(
    'El servidor recibe el consentimiento de marketing',
    saved?.consentimiento_marketing === true,
  );

  // Retirar el consentimiento desde el footer.
  await page.goto(SITE, { waitUntil: 'networkidle' });
  const before = meta.events.length;
  await page.locator('footer [data-open-cookie-settings]').click();
  const toggle = page.locator('#cb-marketing');
  if (await toggle.count()) {
    if (await toggle.isChecked()) await toggle.uncheck({ force: true });
    await page.locator('[data-consent-action="save"]').click();
    await page.waitForTimeout(500);
    const after = meta.events.length;
    await page.locator('#valoracion').scrollIntoViewIfNeeded();
    await page
      .locator('#lead-form label.chip')
      .filter({ has: page.locator('input[value="Hombro"]') })
      .click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.waitForTimeout(1500);
    const fbpAfter = (await ctx.cookies()).find((c) => c.name === '_fbp');
    check(
      'Al retirar el consentimiento no se envían más eventos',
      meta.events.length === after,
      `${after - before} antes de retirar, ${meta.events.length - after} después`,
    );
    check('Y se borra la cookie _fbp', !fbpAfter);
  } else {
    check('Panel de cookies con opción de marketing', false, 'no se encontró el interruptor');
  }
  console.log('\nEventos que se habrían enviado a Meta:', names(meta).join(', '));
  await ctx.close();
} finally {
  await browser.close();
  site.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
if (failed.length) process.exit(1);
