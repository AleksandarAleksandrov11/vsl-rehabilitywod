/**
 * npm run qa:browsers
 * Recorre la landing como la verían las visitas de Meta Ads en sus navegadores reales:
 *   - Safari de iOS (motor WebKit, iPhone 15)
 *   - navegador integrado de Instagram en iOS (WebKit con el user agent de Instagram)
 *   - navegador integrado de Instagram en Android (Chromium WebView con el user agent de Instagram)
 * En cada uno: banner compacto sin tapar el CTA del hero, nada de Meta antes de aceptar, PageView
 * al aceptar, formulario completo con error de red (sin perder lo escrito), reenvío, Lead con el
 * mismo event_id que el servidor y la página de gracias.
 *
 * Usa el fbevents.js real de Meta guardado por `npm run qa` en qa/.tmp/fb (si no está, la red) y
 * responde en local las llamadas a facebook.com/tr. Requiere un build con ASTRO_ADAPTER=node.
 * WebKit es opcional: npx playwright install webkit && npx playwright install-deps webkit.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { chromium, devices, webkit } from '@playwright/test';

const PORT = 4393;
const SITE = `http://127.0.0.1:${PORT}`;
const LEADS = 'qa/.tmp/browsers-leads.jsonl';
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
const FB_CACHE = { 'fbevents.js': 'qa/.tmp/fb/fbevents.js', config: 'qa/.tmp/fb/config.js' };

const IG_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.28.81 (iPhone15,3; iOS 18_5; es_ES; es; scale=3.00; 1290x2796; 761254823)';
const IG_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-S921B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36 Instagram 389.0.0.42.81 Android (34/14; 480dpi; 1080x2340; samsung; SM-S921B; e1s; s5e9945; es_ES; 761254823)';

const TARGETS = [
  { name: 'Safari iOS', engine: webkit, device: devices['iPhone 15'] },
  { name: 'Instagram iOS', engine: webkit, device: { ...devices['iPhone 15'], userAgent: IG_IOS } },
  {
    name: 'Instagram Android',
    engine: chromium,
    device: { ...devices['Pixel 7'], userAgent: IG_ANDROID },
  },
];

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

// Solo hace falta salir a internet si no está la copia local de Meta (con proxy, Chromium no
// llega al servidor local).
const cached = Object.values(FB_CACHE).every((f) => existsSync(f));
const proxy =
  !cached && process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }
    : undefined;

try {
  for (const target of TARGETS) {
    let browser;
    try {
      browser = await target.engine.launch({ proxy });
    } catch {
      console.log(`- ${target.name}: navegador no instalado, se omite`);
      continue;
    }
    console.log(`\n${target.name} (${target.engine.name()} ${browser.version()})`);
    const ctx = await browser.newContext({
      ...target.device,
      locale: 'es-ES',
      ignoreHTTPSErrors: Boolean(proxy),
    });
    const events = [];
    const meta = [];
    await ctx.route(/https:\/\/connect\.facebook\.net\//, async (route) => {
      const url = route.request().url();
      meta.push(url);
      const local = url.includes('/fbevents.js')
        ? FB_CACHE['fbevents.js']
        : url.includes('/signals/config/')
          ? FB_CACHE.config
          : '';
      if (local && existsSync(local)) {
        await route.fulfill({ contentType: 'application/javascript', body: readFileSync(local) });
      } else {
        await route.continue();
      }
    });
    await ctx.route(/https:\/\/www\.facebook\.com\/tr\/?/, async (route) => {
      const req = route.request();
      const params = new URLSearchParams(new URL(req.url()).search);
      const body = req.postData();
      if (body && !params.get('ev')) new URLSearchParams(body).forEach((v, k) => params.set(k, v));
      meta.push(req.url());
      events.push(Object.fromEntries(params));
      await route.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    });
    const names = () => events.map((e) => e.ev);
    const waitFor = async (fn, ms = 10000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (fn()) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    };

    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: 'load' });
    await page.locator('#cookie-banner').waitFor();
    await page.waitForTimeout(500);
    const hero = await page.evaluate(() => {
      const banner = document.getElementById('cookie-banner').getBoundingClientRect();
      const cta = document.querySelector('[data-cta="hero"]').getBoundingClientRect();
      const el = document.elementFromPoint(cta.left + cta.width / 2, cta.top + cta.height / 2);
      return {
        bannerH: Math.round(banner.height),
        free: cta.bottom <= banner.top && !!el?.closest('[data-cta="hero"]'),
      };
    });
    check(
      `${target.name}: CTA del hero entero con el banner abierto`,
      hero.free,
      `banner ${hero.bannerH} px`,
    );
    check(`${target.name}: nada de Meta sin consentimiento`, meta.length === 0);
    await page.locator('[data-consent-action="accept"]').click();
    await waitFor(() => names().includes('PageView'));
    check(`${target.name}: PageView al aceptar`, names().includes('PageView'));

    // Formulario con la red caída en el envío.
    let offline = true;
    await page.route('**/api/lead', (route) => (offline ? route.abort() : route.continue()));
    await page.locator('#valoracion').scrollIntoViewIfNeeded();
    await page.locator('#lead-form label.chip').filter({ hasText: 'Rodilla' }).click();
    await page.locator('fieldset[data-step="2"]').waitFor();
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await page.locator('#nombre').fill('Prueba Navegador');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('#telefono').fill('633445566');
    await page.locator('label[for="consentimiento_salud"]').click();
    await page.waitForTimeout(3200);
    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    const errorShown = await page
      .locator('[data-form-error]')
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const kept =
      (await page.locator('#telefono').inputValue()) === '633445566' &&
      (await page.locator('#nombre').inputValue()) === 'Prueba Navegador' &&
      (await page.locator('#consentimiento_salud').isChecked());
    check(`${target.name}: sin red sale el error y no se pierde lo escrito`, errorShown && kept);
    check(`${target.name}: sin Lead si el envío falla`, !names().includes('Lead'));

    offline = false;
    await page.getByRole('button', { name: 'Reintentar el envío' }).click();
    const thanks = await page
      .waitForURL(/\/gracias/, { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check(`${target.name}: reenvío correcto y página de gracias`, thanks);
    await waitFor(() => names().includes('Lead'));
    const lead = events.find((e) => e.ev === 'Lead');
    const saved = existsSync(LEADS)
      ? readFileSync(LEADS, 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l))
          .at(-1)
      : null;
    check(
      `${target.name}: Lead con el mismo event_id que el servidor`,
      !!lead?.eid && lead.eid === saved?.event_id,
    );
    await browser.close();
  }
} finally {
  site.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
if (failed.length) process.exit(1);
