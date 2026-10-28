/**
 * npm run qa:browsers
 * Recorre la landing como la verían las visitas de Meta Ads en sus navegadores reales:
 *   - Safari de iOS (motor WebKit, iPhone 15)
 *   - navegador integrado de Instagram en iOS (WebKit con el user agent de Instagram)
 *   - navegador integrado de Instagram en Android (Chromium WebView con el user agent de Instagram)
 * En cada uno: hero adaptado al anuncio (utm_content mofu3.0 y mofu1.0, y por campaña
 * "descubrir" y "cierre", con capturas en qa/screenshots/anuncios/), banner compacto sin tapar el
 * CTA del hero, nada de Meta antes de aceptar, PageView al aceptar, avance automático del paso 1
 * (250 ms) al tocar una zona, formulario completo con error de red (sin perder lo escrito y con
 * los datos en el enlace de WhatsApp), reenvío, Lead con el mismo event_id que el servidor, la
 * gracias en la tarjeta y WhatsApp abierto en la misma pestaña a los 1,5 s.
 *
 * Usa el fbevents.js real de Meta guardado por `npm run qa` en qa/.tmp/fb (si no está, la red) y
 * responde en local las llamadas a facebook.com/tr. Requiere un build con ASTRO_ADAPTER=node.
 * WebKit es opcional: npx playwright install webkit && npx playwright install-deps webkit.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium, devices, webkit } from '@playwright/test';

const PORT = 4393;
const SITE = `http://127.0.0.1:${PORT}`;
const LEADS = 'qa/.tmp/browsers-leads.jsonl';
const SHOTS = 'qa/screenshots/anuncios';
const ADS = [
  ['', 'Plan a medida, seguimiento diario y ajustes cada semana.'],
  ['utm_content=mofu3.0', 'Vienes del test de hombro'],
  ['utm_content=mofu1.0', 'Vienes del vídeo del sistema'],
  ['utm_campaign=descubrir', 'Fisioterapia online para atletas de CrossFit'],
  ['utm_campaign=cierre', 'Reserva tu valoración'],
];
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
mkdirSync(SHOTS, { recursive: true });
const site = spawn('node', ['scripts/qa-server.mjs'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    LEAD_MOCK: '1',
    LEAD_MOCK_FILE: LEADS,
    CAPI_SIGNING_SECRET: 'navegadores-firma',
  },
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
      // Los eventos largos (el Lead con advanced matching) van como multipart/form-data.
      if (body && !params.get('ev')) {
        if ((req.headers()['content-type'] ?? '').startsWith('multipart/')) {
          for (const m of body.matchAll(/name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g)) {
            params.set(m[1], m[2]);
          }
        } else {
          new URLSearchParams(body).forEach((v, k) => params.set(k, v));
        }
      }
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

    // Hero según el anuncio (cada uno en una pestaña nueva de la misma sesión).
    const slug = target.name.toLowerCase().replace(/\s+/g, '-');
    for (const [ad, expected] of ADS) {
      const tab = await ctx.newPage();
      const qs = ad ? `?utm_source=meta&utm_medium=paid&${ad}` : '';
      await tab.goto(`${SITE}/${qs}`, { waitUntil: 'load' });
      await tab.waitForTimeout(600);
      const shown = await tab.evaluate(() =>
        [...document.querySelectorAll('.hero-eyebrow, .hero-sub')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.textContent.trim()),
      );
      const zona = await tab.evaluate(
        () => document.querySelector('input[name="zona"]:checked')?.value ?? '',
      );
      check(
        `${target.name}: hero ${ad || 'sin utm_content'}`,
        shown.some((t) => t.startsWith(expected)) &&
          (ad.endsWith('mofu3.0') ? zona === 'Hombro' : !zona),
        shown[0]?.slice(0, 40),
      );
      const shot = ad ? ad.split('=')[1] : 'sin-utm';
      await tab.screenshot({ path: `${SHOTS}/${slug}-${shot}.png` });
      await tab.close();
    }
    await ctx.clearCookies();

    const page = await ctx.newPage();
    // Sin utm_content: se borra lo que haya guardado la prueba anterior en esta sesión.
    await page.goto(`${SITE}/?utm_content=`, { waitUntil: 'load' });
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

    // Formulario con la red caída en el envío. WhatsApp (tras enviar) se responde en local.
    let offline = true;
    let waUrl = '';
    await page.route('**/api/lead', (route) => (offline ? route.abort() : route.continue()));
    await page.route('https://wa.me/**', (route) => {
      waUrl ||= route.request().url();
      return route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (QA)</title>' });
    });
    await page.locator('#valoracion').scrollIntoViewIfNeeded();
    // Paso 1: al tocar una zona avanza solo (250 ms), también en el navegador de Instagram.
    const tapAt = Date.now();
    await page.locator('#lead-form label.chip').filter({ hasText: 'Rodilla' }).click();
    await page.locator('fieldset[data-step="2"]').waitFor();
    const advance = Date.now() - tapAt;
    check(
      `${target.name}: el paso 1 avanza solo al tocar una zona`,
      advance < 1500,
      `${advance} ms`,
    );
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await page.locator('#nombre').fill('Prueba Navegador');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('#telefono').fill('633445566');
    await page.locator('#consentimiento_salud').check();
    await page.waitForTimeout(3200);
    const label = (await page.locator('[data-submit-label]').textContent())?.trim();
    check(
      `${target.name}: el botón dice que se abre WhatsApp`,
      label === 'Enviar y abrir WhatsApp',
    );
    const fits = await page
      .locator('[data-submit]')
      .evaluate((el) => el.getBoundingClientRect().height < 70 && el.scrollWidth <= el.clientWidth);
    check(`${target.name}: "Enviar y abrir WhatsApp" en una línea`, fits);
    await page.locator('[data-submit]').click();
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
    const errorWa = new URL(
      (await page.locator('[data-form-error] a').getAttribute('href')) ?? 'https://x/',
    ).searchParams.get('text');
    check(
      `${target.name}: el enlace de WhatsApp del error lleva los datos`,
      errorWa ===
        'Hola Gerard, soy Prueba Navegador. El formulario de la web no se ha enviado. Mi teléfono: +34633445566. Zona: Rodilla.',
    );
    check(`${target.name}: sin Lead si el envío falla`, !names().includes('Lead'));

    offline = false;
    await page.getByRole('button', { name: 'Reintentar el envío' }).click();
    const thanks = await page
      .locator('[data-form-done]')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const title = thanks ? (await page.locator('[data-done-title]').textContent())?.trim() : '';
    check(
      `${target.name}: reenvío correcto y gracias en la tarjeta`,
      thanks && title === 'Gracias, Prueba Navegador.',
    );
    await page.screenshot({ path: `${SHOTS}/${slug}-gracias.png` });
    const opened = await page
      .waitForURL(/^https:\/\/wa\.me\//, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    check(
      `${target.name}: WhatsApp se abre solo en la misma pestaña con el mensaje`,
      opened &&
        new URL(waUrl).searchParams.get('text') ===
          'Hola Gerard, soy Prueba Navegador. Acabo de pedir la valoración en la web. Zona: Rodilla.',
    );
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
