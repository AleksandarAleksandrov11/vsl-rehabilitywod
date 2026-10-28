/**
 * Pruebas de la optimización para leads (se ejecutan con `npm run qa`, junto a tests/qa.spec.ts):
 *  1. Contrato con el Apps Script: claves y tipos exactos del cuerpo que recibe.
 *  2. Fugas: ningún enlace que saque de la landing antes de enviar (390 Instagram y 1440, con y
 *     sin JS, banner abierto y cerrado, FAQ abierto, barra fija y errores de validación).
 *  3. /api/lead-capi: firma, origen, event_id repetido, tipos de cuerpo, token falso y Meta caído.
 *  4. Envío sin JS: Lead de servidor (fbclid del Referer) sin pasar de 4 s con Meta colgado.
 *  5. Lead del Pixel una vez por event_id, con advanced matching (init) antes del Lead.
 *  6. Eventos del embudo sin repeticiones (FormStart, ViewContent, FormStep, FormError).
 *  7. Gracias en la tarjeta y WhatsApp (automático en móvil, botón en escritorio).
 *  8. Error de envío con todos los datos en el enlace de WhatsApp.
 *  9. Variantes del hero: tabla de casos, CTA a la vista con el banner y capturas.
 * Capturas en qa/screenshots/optimizacion-leads/ (390x844 con Instagram de iPhone y 1440x900).
 */
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { AD_VARIANTS } from '../src/data/ad-variants';
import {
  CONSENT_ACCEPTED,
  CONSENT_REJECTED,
  IG_IPHONE,
  captureVercel,
  UA_DESKTOP,
  chip,
  contractProblems,
  fbRequests,
  fillForm,
  openForm,
  readCapi,
  readJsonl,
  readLeads,
  rmSync,
  setConsent,
  startQaServer,
  stubMeta,
  submitBtn,
  trEvents,
  trParams,
} from './helpers';

const SHOTS = 'qa/screenshots/optimizacion-leads';
const DESKTOP = { viewport: { width: 1440, height: 900 }, userAgent: UA_DESKTOP };
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/** Contexto con Meta simulado (fbevents.js real) y WhatsApp simulado. */
async function ctxFor(
  browser: Browser,
  device: Record<string, unknown>,
  consent: object | null,
  extra: Record<string, unknown> = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ locale: 'es-ES', ...device, ...extra });
  await stubMeta(ctx);
  await ctx.route('https://wa.me/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (QA)</title>' }),
  );
  if (consent) await setConsent(ctx, consent);
  return ctx;
}

/** Texto de la gracias y del mensaje de WhatsApp a partir del href. */
const waText = (href: string) => new URL(href).searchParams.get('text') ?? '';

// ---------------------------------------------------------------------------
// 1. Contrato con el Apps Script
// ---------------------------------------------------------------------------

test.describe('Contrato con el Apps Script', () => {
  test('el cuerpo que recibe tiene exactamente sus campos y tipos (con JS, sin JS y por API)', async ({
    browser,
    request,
  }) => {
    const names: string[] = [];
    // Con JS y cookies aceptadas, y con JS y cookies rechazadas.
    for (const [consent, nombre] of [
      [CONSENT_ACCEPTED, 'Contrato Acepta'],
      [CONSENT_REJECTED, 'Contrato Rechaza'],
    ] as const) {
      const ctx = await ctxFor(browser, IG_IPHONE, consent);
      const page = await ctx.newPage();
      await page.goto(
        '/?utm_source=ig&utm_campaign=cierre&utm_content=mofu1.0&fbclid=IwAR0Contrato',
      );
      await openForm(page);
      await fillForm(page, {
        zona: 'Codo',
        detalle: 'Me duele al colgarme',
        nombre,
        telefono: '611000111',
      });
      await submitBtn(page).click();
      await expect(page.locator('[data-form-done]')).toBeVisible();
      names.push(nombre);
      await ctx.close();
    }
    // Sin JS.
    const nojs = await ctxFor(browser, DESKTOP, null, { javaScriptEnabled: false });
    const p2 = await nojs.newPage();
    await p2.goto('/');
    await p2.locator('#lead-form input[value="Hombro"]').check({ force: true });
    await p2.locator('#nombre').fill('Contrato SinJS');
    await p2.locator('#telefono').fill('611000222');
    await p2.locator('#consentimiento_salud').check({ force: true });
    await submitBtn(p2).click();
    await p2.waitForURL('**/gracias');
    names.push('Contrato SinJS');
    await nojs.close();
    // Por API con campos de más y valores raros: el servidor no los deja pasar.
    const res = await request.post('/api/lead', {
      data: {
        zona: 'Rodilla',
        nombre: 'Contrato API',
        telefono: '611000333',
        consentimiento_salud: 'on',
        consentimiento_marketing: 'true',
        started_at: Date.now() - 60_000,
        sig: 'x',
        fbc: 'fb.1.1700000000000.IwAR0Extra',
        ip: '1.2.3.4',
        zona_extra: 'Hombro',
      },
    });
    expect((await res.json()).ok).toBe(true);
    names.push('Contrato API');

    for (const nombre of names) {
      const body = readLeads().find((l) => l.nombre === nombre)!;
      expect(body, nombre).toBeTruthy();
      expect(contractProblems(body), nombre).toEqual([]);
    }
    const api = readLeads().find((l) => l.nombre === 'Contrato API')!;
    expect(api.consentimiento_marketing).toBe(false);
    expect(api.consentimiento_salud).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Fugas
// ---------------------------------------------------------------------------

/** Enlaces, formularios e iframes que salen del dominio (salvo el iframe del vídeo). */
const externalLinks = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const check = (url: string | null, what: string, el: Element) => {
      const u = (url ?? '').trim();
      if (!u || u.startsWith('#')) return;
      let parsed: URL | null = null;
      try {
        parsed = new URL(u, window.location.href);
      } catch {
        parsed = null;
      }
      if (parsed && parsed.origin === window.location.origin) return;
      const where = el.closest('[data-form-error]') ? ' [error de envío]' : '';
      out.push(`${what} ${u}${where}`);
    };
    document
      .querySelectorAll('a[href], area[href]')
      .forEach((a) => check(a.getAttribute('href'), 'enlace', a));
    document
      .querySelectorAll('form[action]')
      .forEach((f) => check(f.getAttribute('action'), 'formulario', f));
    document
      .querySelectorAll('[formaction]')
      .forEach((b) => check(b.getAttribute('formaction'), 'formaction', b));
    document.querySelectorAll('iframe[src]').forEach((f) => {
      const src = f.getAttribute('src') ?? '';
      if (f.closest('[data-vsl]') && src.startsWith('https://www.youtube-nocookie.com/embed/')) {
        return;
      }
      check(src, 'iframe', f);
    });
    return out;
  });

test.describe('Fugas: nada que saque de la landing antes de enviar', () => {
  for (const [name, device] of [
    ['390 Instagram iPhone', IG_IPHONE],
    ['1440 escritorio', DESKTOP],
  ] as const) {
    test(`${name}, con JS: banner abierto y cerrado, FAQ, barra fija, zonas y errores`, async ({
      browser,
    }) => {
      const found: string[] = [];
      const collect = async (page: Page, state: string) => {
        for (const l of await externalLinks(page)) found.push(`[${state}] ${l}`);
      };
      const ctx = await ctxFor(browser, device, null);
      const page = await ctx.newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page.locator('#cookie-banner')).toBeVisible();
      await collect(page, 'banner abierto');
      // FAQ abierto.
      for (const bt of await page.locator('#faq button[aria-expanded]').all()) {
        await bt.scrollIntoViewIfNeeded();
        await bt.click();
      }
      await collect(page, 'FAQ abierto');
      // Barra fija a la vista (móvil).
      await page.locator('#por-que').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await collect(page, 'barra fija');
      // Cierre de "¿Qué te duele?" y errores de validación de cada paso.
      await page.locator('#zonas').scrollIntoViewIfNeeded();
      await page.locator('#zonas a[data-zona="Otro"]').click();
      await expect(page.locator('[data-progress-text]')).toHaveText('Paso 2 de 4');
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.locator('#err-detalle')).toBeVisible();
      await page.locator('#detalle').fill('Una duda sobre el plan');
      await page.getByRole('button', { name: 'Continuar' }).click();
      await page.locator('#nombre').fill('A');
      await page.keyboard.press('Enter');
      await expect(page.locator('#err-nombre')).toBeVisible();
      await page.locator('#nombre').fill('Ana');
      await page.keyboard.press('Enter');
      await page.locator('#telefono').fill('123');
      await submitBtn(page).click();
      await expect(page.locator('#err-telefono')).toBeVisible();
      await expect(page.locator('#err-consentimiento')).toBeVisible();
      await collect(page, 'errores de validación');
      // Banner cerrado (rechazar).
      await page.locator('[data-consent-action="reject"]').click();
      await collect(page, 'banner cerrado');
      // Página 404.
      await page.goto('/no-existe', { waitUntil: 'networkidle' });
      await collect(page, '404');
      expect(found).toEqual([]);
      await ctx.close();
    });

    test(`${name}, sin JS: home, vuelta con error y 404`, async ({ browser }) => {
      const found: string[] = [];
      const ctx = await ctxFor(browser, device, null, { javaScriptEnabled: false });
      const page = await ctx.newPage();
      for (const path of ['/', '/?error=1#valoracion', '/no-existe']) {
        await page.goto(path);
        for (const l of await externalLinks(page)) found.push(`[${path}] ${l}`);
      }
      // El vídeo sin JS: aviso en texto, sin enlace a YouTube.
      await page.goto('/');
      await expect(page.locator('.vsl-noscript')).toHaveText(
        'Para ver el vídeo, activa JavaScript en el navegador.',
      );
      expect(found).toEqual([]);
      await ctx.close();
    });
  }

  test('solo se permiten salidas en el error de envío, en /gracias y en las legales', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await page.route('**/api/lead', (route) => route.abort('internetdisconnected'));
    await openForm(page);
    await fillForm(page, { zona: 'Cadera', nombre: 'Ana', telefono: '612345678' });
    await submitBtn(page).click();
    await expect(page.locator('[data-form-error]')).toBeVisible();
    const links = await externalLinks(page);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/^enlace https:\/\/wa\.me\/34640995494\?text=.+ \[error de envío\]$/);
    // /gracias: solo WhatsApp.
    await page.goto('/gracias');
    expect(
      (await externalLinks(page)).every((l) => l.startsWith('enlace https://wa.me/34640995494?')),
    ).toBe(true);
    // Legales: el teléfono, el email y la AEPD (y nada más).
    for (const path of ['/aviso-legal', '/privacidad', '/cookies']) {
      await page.goto(path);
      const extra = (await externalLinks(page)).filter(
        (l) =>
          ![
            'enlace tel:+34640995494',
            'enlace mailto:info@rehabilitywod.com',
            'enlace https://www.aepd.es',
          ].includes(l),
      );
      expect(extra, path).toEqual([]);
    }
    await ctx.close();
  });

  test('enlaces legales de la home, del formulario y del banner en una pestaña nueva', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, IG_IPHONE, null);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    const legal = await page
      .locator('a[href="/privacidad"], a[href="/cookies"], a[href="/aviso-legal"]')
      .evaluateAll((els) =>
        els.map((a) => ({
          where: a.closest('footer')
            ? 'footer'
            : a.closest('#cookie-banner')
              ? 'banner'
              : a.closest('#lead-form')
                ? 'formulario'
                : 'otro',
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel'),
          notice: a.querySelector('.sr-only')?.textContent?.trim() ?? '',
        })),
      );
    expect(new Set(legal.map((l) => l.where))).toEqual(new Set(['footer', 'banner', 'formulario']));
    for (const l of legal) {
      expect(l.target, l.where).toBe('_blank');
      expect(l.rel, l.where).toContain('noopener');
      expect(l.notice, l.where).toBe('(se abre en una pestaña nueva)');
    }
    // Footer: marca, CTA, legales, "Configurar cookies" y el ©; sin redes ni contacto.
    const footer = page.locator('footer.site-footer');
    await expect(footer.locator('[data-cta="footer"]')).toHaveAttribute('href', '#valoracion');
    await expect(footer.locator('[data-open-cookie-settings]')).toHaveCount(1);
    await expect(footer).toContainText('© ');
    await expect(
      footer.locator('a[href^="mailto:"], a[href^="tel:"], a[target="_blank"][href^="http"]'),
    ).toHaveCount(0);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 3. /api/lead-capi
// ---------------------------------------------------------------------------

test.describe('/api/lead-capi', () => {
  async function signedLead(request: import('@playwright/test').APIRequestContext) {
    const eventId = crypto.randomUUID();
    const res = await request.post('/api/lead', {
      data: {
        zona: 'Muñeca',
        nombre: 'Capi Casos',
        telefono: '622000111',
        consentimiento_salud: true,
        event_id: eventId,
        started_at: Date.now() - 60_000,
      },
    });
    const { sig } = await res.json();
    return {
      eventId,
      sig: String(sig),
      body: { event_id: eventId, nombre: 'Capi Casos', telefono: '+34622000111', sig: String(sig) },
    };
  }
  const count = (id: string) => readCapi().filter((b) => b.data[0]?.event_id === id).length;

  test('sin firma, firma falsa, otro origen, event_id repetido o cuerpo raro: nada a Meta', async ({
    request,
  }) => {
    const { eventId, sig, body } = await signedLead(request);
    const post = (data: unknown, headers: Record<string, string> = {}) =>
      request.post('/api/lead-capi', {
        headers: { 'content-type': 'application/json', ...headers },
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
    expect((await post({ ...body, sig: undefined })).status()).toBe(403);
    expect((await post({ ...body, sig: 'a'.repeat(64) })).status()).toBe(403);
    expect((await post({ ...body, sig: sig.slice(0, 63) })).status()).toBe(403);
    // La firma va ligada al teléfono: con otro número no vale.
    expect((await post({ ...body, telefono: '+34622000112' })).status()).toBe(403);
    expect((await post(body, { origin: 'https://otra-web.example' })).status()).toBe(403);
    expect((await post(body, { 'content-type': 'text/html' })).status()).toBe(415);
    expect((await post('{no es json')).status()).toBe(400);
    expect((await post({ ...body, event_id: 'no-uuid' })).status()).toBe(400);
    expect((await post({ ...body, extra: 'x'.repeat(5000) })).status()).toBe(413);
    expect((await request.get('/api/lead-capi')).status()).toBe(405);
    expect(count(eventId)).toBe(0);
    // La buena: 204 y un evento. Repetida: 409 y sigue habiendo uno.
    expect((await post(body)).status()).toBe(204);
    expect((await post(body)).status()).toBe(409);
    expect(count(eventId)).toBe(1);
  });

  test('token falso y Meta respondiendo 500: el lead se guarda y sale la gracias', async ({
    browser,
  }) => {
    const metaCalls: Array<{ url: string; body: string }> = [];
    const meta: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        metaCalls.push({ url: req.url ?? '', body });
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"error":{"message":"QA"}}');
      });
    });
    await new Promise<void>((r) => meta.listen(4481, '127.0.0.1', r));
    const leads = 'qa/.tmp/capi-500-leads.jsonl';
    rmSync(leads, { force: true });
    const server = await startQaServer(4482, {
      META_CAPI_TOKEN: 'token-falso-qa',
      CAPI_GRAPH_URL: 'http://127.0.0.1:4481',
      CAPI_SIGNING_SECRET: 'qa-firma-500',
      LEAD_MOCK_FILE: leads,
    });
    try {
      const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_REJECTED);
      const page = await ctx.newPage();
      await page.goto(`${server.url}/#valoracion`, { waitUntil: 'networkidle' });
      await page.locator('[data-form-root].is-enhanced').waitFor();
      await fillForm(page, { zona: 'Codo', nombre: 'Ana Meta', telefono: '633000111' });
      await submitBtn(page).click();
      await expect(page.locator('[data-form-done]')).toBeVisible();
      await expect(page.locator('[data-done-title]')).toHaveText('Gracias, Ana Meta.');
      expect(readJsonl(leads).some((l) => l.nombre === 'Ana Meta')).toBe(true);
      await expect.poll(() => metaCalls.length).toBe(1);
      expect(metaCalls[0]!.url).toBe('/v24.0/1433154668778788/events?access_token=token-falso-qa');
      const sent = JSON.parse(metaCalls[0]!.body);
      expect(sent.data[0].event_name).toBe('Lead');
      expect(sent.test_event_code).toBeUndefined();
      expect(metaCalls[0]!.body).not.toMatch(/Codo|Ana|633000111/);
      await expect.poll(() => server.log()).toContain('[capi] Meta respondió 500');
      // Los logs de la CAPI no llevan datos personales ni el token.
      const capiLog = server
        .log()
        .split('\n')
        .filter((l) => l.startsWith('[capi]'));
      expect(capiLog.length).toBeGreaterThan(0);
      expect(capiLog.join('\n')).not.toMatch(/633000111|token-falso-qa|Ana|Codo/);
      await ctx.close();
    } finally {
      server.stop();
      meta.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Envío sin JS
// ---------------------------------------------------------------------------

test('sin JS: Lead de servidor con el fbclid del Referer y redirección en ≤ 4 s con Meta colgado', async () => {
  const metaCalls: string[] = [];
  // Meta que no responde nunca.
  const meta: Server = createServer((req) => {
    metaCalls.push(req.url ?? '');
  });
  await new Promise<void>((r) => meta.listen(4483, '127.0.0.1', r));
  const leads = 'qa/.tmp/nojs-capi-leads.jsonl';
  rmSync(leads, { force: true });
  const server = await startQaServer(4484, {
    META_CAPI_TOKEN: 'token-falso-qa',
    CAPI_GRAPH_URL: 'http://127.0.0.1:4483',
    LEAD_MOCK_FILE: leads,
  });
  try {
    const started = Date.now();
    const res = await fetch(`${server.url}/api/lead`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        referer: `${server.url}/?utm_source=ig&fbclid=PRUEBA123`,
      },
      body: new URLSearchParams({
        zona: 'Hombro',
        nombre: 'Sin JS Meta',
        prefijo: '+34',
        telefono: '644000111',
        consentimiento_salud: '1',
        website: '',
      }).toString(),
    });
    const elapsed = Date.now() - started;
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/gracias');
    expect(elapsed).toBeLessThan(5500);
    expect(readJsonl(leads).some((l) => l.nombre === 'Sin JS Meta')).toBe(true);
    expect(metaCalls).toHaveLength(1);
    await expect.poll(() => server.log()).toContain('[capi] Meta no disponible');
  } finally {
    server.stop();
    meta.close();
  }
  // Y en el QA normal (sin token): el evento lleva el fbc del fbclid del Referer.
  const qa = await startQaServer(4485, {
    CAPI_MOCK_FILE: 'qa/.tmp/nojs-capi.jsonl',
    LEAD_MOCK_FILE: 'qa/.tmp/nojs-capi-leads2.jsonl',
  });
  rmSync('qa/.tmp/nojs-capi.jsonl', { force: true });
  try {
    await fetch(`${qa.url}/api/lead`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        referer: `${qa.url}/?fbclid=PRUEBA123`,
      },
      body: 'zona=Rodilla&nombre=Sin+JS+Fbc&prefijo=%2B34&telefono=655000111&consentimiento_salud=1',
    });
    const ev = readJsonl('qa/.tmp/nojs-capi.jsonl').at(-1) as {
      data: Array<{ user_data: Record<string, unknown>; event_source_url: string }>;
    };
    expect(ev.data[0]!.user_data.fbc).toMatch(/^fb\.1\.\d{13}\.PRUEBA123$/);
    expect(ev.data[0]!.user_data.fbp).toBeUndefined();
    expect(ev.data[0]!.event_source_url).toBe(`${qa.url}/`);
  } finally {
    qa.stop();
  }
});

// ---------------------------------------------------------------------------
// 5 y 7. Lead, gracias y WhatsApp
// ---------------------------------------------------------------------------

test.describe('Lead, gracias y WhatsApp', () => {
  test('móvil con cookies aceptadas: Lead una vez con advanced matching, CAPI con el mismo event_id y WhatsApp a los 1,5 s', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_ACCEPTED);
    const page = await ctx.newPage();
    // Cualquier otra pestaña o ventana sería un window.open (no debe haber ninguna).
    const popups: string[] = [];
    ctx.on('page', (p) => popups.push(p.url()));
    const va = await captureVercel(page);
    const fb = fbRequests(page);
    const times: Record<string, number> = {};
    let waUrl = '';
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('https://wa.me/')) waUrl ||= url;
      if (/facebook\.com\/tr/.test(url)) {
        const ev = trParams(r).ev;
        if (ev === 'Lead') times.lead ??= Date.now();
      }
    });
    let apiCalls = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/lead') && r.method() === 'POST') apiCalls += 1;
    });
    // El WhatsApp simulado tarda en responder: así se pueden leer los eventos antes de salir.
    await page.route('https://wa.me/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (QA)</title>' });
    });
    await openForm(page);
    await fillForm(page, {
      zona: 'Rodilla',
      detalle: 'Me duele al bajar escaleras',
      nombre: 'Ana López',
      telefono: '612345678',
    });
    await expect(submitBtn(page)).toHaveText('Enviar y abrir WhatsApp');
    // Doble toque: un solo envío y un solo Lead.
    await submitBtn(page).dblclick();
    await expect(page.locator('[data-form-done]')).toBeVisible();
    const shownAt = Date.now();
    await expect(page.locator('[data-form-done]')).toHaveAttribute('role', 'status');
    await expect(page.locator('[data-done-title]')).toHaveText('Gracias, Ana López.');
    await expect(page.locator('[data-done-title]')).toBeFocused();
    await expect(page.locator('[data-done-text]')).toHaveText(
      'Te abro WhatsApp para que me escribas ya.',
    );
    const button = page.locator('[data-done-wa]');
    await expect(button).toHaveText('Abrir WhatsApp');
    expect(await button.getAttribute('target')).toBeNull();
    const expected =
      'Hola Gerard, soy Ana López. Acabo de pedir la valoración en la web. Zona: Rodilla. Me duele al bajar escaleras';
    expect(waText((await button.getAttribute('href'))!)).toBe(expected);
    await expect.poll(() => trEvents(fb, 'Lead').length).toBe(1);
    const eventId = trParams(trEvents(fb, 'Lead')[0]!).eid!;
    expect(await page.evaluate((id) => sessionStorage.getItem(`rw_lead_${id}`), eventId)).toBe('1');

    await page.waitForRequest(/^https:\/\/wa\.me\//, { timeout: 5000 });
    const waAt = Date.now();
    expect(waAt - shownAt).toBeGreaterThanOrEqual(1300);
    expect(waAt - shownAt).toBeLessThan(3000);
    expect(waAt - times.lead!).toBeGreaterThanOrEqual(800);
    expect(waText(waUrl)).toBe(expected);
    // Antes de salir: Contact (gracias-auto) y whatsapp_auto en Vercel.
    expect(trEvents(fb, 'Contact').map((r) => trParams(r)['cd[content_category]'])).toEqual([
      'gracias-auto',
    ]);
    expect(va.join('\n')).toContain('"name":"whatsapp_auto"');
    await page.waitForURL(/^https:\/\/wa\.me\//);
    expect(popups).toEqual([]); // nunca window.open
    expect(apiCalls).toBe(1);

    // Lead del Pixel: uno, con el mismo event_id que el lead y la CAPI, y con advanced matching
    // (init con los datos cifrados antes del Lead; el PageView del principio no los lleva).
    expect(trEvents(fb, 'Lead')).toHaveLength(1);
    const lead = trParams(trEvents(fb, 'Lead')[0]!);
    expect(lead['ud[ph]']).toBe(sha('34612345678'));
    expect(lead['ud[fn]']).toBe(sha('ana'));
    expect(lead['ud[country]']).toBe(sha('es'));
    expect(trParams(trEvents(fb, 'PageView')[0]!)['ud[ph]']).toBeUndefined();
    const saved = readLeads().find((l) => l.event_id === eventId);
    expect(saved?.nombre).toBe('Ana López');
    const capi = readCapi().filter((b) => b.data[0]?.event_id === eventId);
    expect(capi).toHaveLength(1);
    const ud = capi[0]!.data[0]!.user_data as Record<string, unknown>;
    expect(ud.ph).toEqual([lead['ud[ph]']]);
    expect(ud.fbp).toMatch(/^fb\./);
    await ctx.close();
  });

  for (const [label, consent] of [
    ['sin tocar el banner', null],
    ['con el banner rechazado', 'reject'],
  ] as const) {
    test(`${label} y con ?fbclid=PRUEBA123: un solo Lead de servidor completo y nada de Meta en el navegador`, async ({
      browser,
    }) => {
      const ctx = await ctxFor(browser, IG_IPHONE, null);
      const page = await ctx.newPage();
      const fb = fbRequests(page);
      await page.goto('/?fbclid=PRUEBA123', { waitUntil: 'networkidle' });
      if (consent === 'reject') await page.locator('[data-consent-action="reject"]').click();
      await openForm(page);
      await fillForm(page, { zona: 'Hombro', nombre: 'Ana Sin Cookies', telefono: '611222333' });
      let eventId = '';
      page.on('request', (r) => {
        if (r.url().endsWith('/api/lead')) eventId = JSON.parse(r.postData() ?? '{}').event_id;
      });
      await submitBtn(page).click();
      await expect(page.locator('[data-form-done]')).toBeVisible();
      await expect
        .poll(() => readCapi().filter((b) => b.data[0]?.event_id === eventId).length)
        .toBe(1);
      const ud = readCapi().find((b) => b.data[0]?.event_id === eventId)!.data[0]!
        .user_data as Record<string, unknown>;
      expect(Object.keys(ud).sort()).toEqual(
        [
          'client_ip_address',
          'client_user_agent',
          'country',
          'external_id',
          'fbc',
          'fn',
          'ln',
          'ph',
        ]
          .filter((k) => k !== 'ln' || ud.ln)
          .sort(),
      );
      expect(ud.fbc).toMatch(/^fb\.1\.\d{13}\.PRUEBA123$/);
      expect(ud.client_user_agent).toBe(IG_IPHONE.userAgent);
      expect(ud.client_ip_address).toBe('127.0.0.1');
      await page.waitForTimeout(2000);
      expect(fb.map((r) => r.url())).toEqual([]);
      await ctx.close();
    });
  }

  test('escritorio: solo el botón (sin abrir WhatsApp solo), en la misma pestaña, con Contact gracias-boton', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, DESKTOP, CONSENT_ACCEPTED);
    const page = await ctx.newPage();
    const va = await captureVercel(page);
    const fb = fbRequests(page);
    await page.route('https://wa.me/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (QA)</title>' });
    });
    await openForm(page);
    await fillForm(page, { zona: 'Tobillo / pie', nombre: 'Marta', telefono: '699112233' });
    await expect(submitBtn(page)).toHaveText('Enviar y valorar mi caso');
    await submitBtn(page).click();
    await expect(page.locator('[data-done-title]')).toHaveText('Gracias, Marta.');
    await expect(page.locator('[data-done-text]')).toHaveText(
      'Te escribo por WhatsApp para agendar la videollamada de valoración. Si prefieres adelantarte, escríbeme tú.',
    );
    await page.waitForTimeout(2500);
    expect(page.url()).not.toContain('wa.me');
    const button = page.locator('[data-done-wa]');
    expect(await button.getAttribute('target')).toBeNull();
    expect(waText((await button.getAttribute('href'))!)).toBe(
      'Hola Gerard, soy Marta. Acabo de pedir la valoración en la web. Zona: Tobillo / pie.',
    );
    const wa = page.waitForRequest(/^https:\/\/wa\.me\//);
    await button.click();
    await wa;
    await expect
      .poll(() => trEvents(fb, 'Contact').map((r) => trParams(r)['cd[content_category]']))
      .toEqual(['gracias-boton']);
    expect(va.join('\n')).toContain('"name":"whatsapp_button"');
    await page.waitForURL(/^https:\/\/wa\.me\//);
    await ctx.close();
  });

  test('el mensaje de WhatsApp no pasa de 600 caracteres', async ({ browser }) => {
    const ctx = await ctxFor(browser, DESKTOP, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await openForm(page);
    await fillForm(page, {
      zona: 'Espalda / lumbar',
      detalle: 'Dolor lumbar al hacer peso muerto. '.repeat(14).slice(0, 500),
      nombre: 'Nombre Bastante Largo De Prueba',
      telefono: '688112233',
    });
    await submitBtn(page).click();
    await expect(page.locator('[data-form-done]')).toBeVisible();
    const text = waText((await page.locator('[data-done-wa]').getAttribute('href'))!);
    expect(text.length).toBeLessThanOrEqual(600);
    expect(text.startsWith('Hola Gerard, soy Nombre Bastante Largo De Prueba.')).toBe(true);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 6. Embudo sin repeticiones
// ---------------------------------------------------------------------------

test('embudo: FormStart, ViewContent y cada FormStep una vez por sesión; FormError con paso y campo', async ({
  browser,
}) => {
  const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_ACCEPTED);
  const page = await ctx.newPage();
  const fb = fbRequests(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  // Primer toque: una tarjeta de zona.
  await page.locator('#zonas').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Rodilla: empezar la valoración' }).tap();
  await expect(page.locator('[data-progress-text]')).toHaveText('Paso 2 de 4');
  // Atrás y otra zona: el paso 1 no se vuelve a contar.
  await page.getByRole('button', { name: 'Atrás' }).click();
  await chip(page, 'Codo').click();
  await expect(page.locator('[data-progress-text]')).toHaveText('Paso 2 de 4');
  await page.getByRole('button', { name: 'Saltar este paso' }).click();
  await page.locator('#nombre').fill('A');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#err-nombre')).toBeVisible();
  await page.locator('#nombre').fill('Ana');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-progress-text]')).toHaveText('Paso 4 de 4');
  await page.getByRole('button', { name: 'Atrás' }).click();
  await page.keyboard.press('Enter');
  // Recarga en la misma sesión y otro toque del formulario: nada se repite.
  await page.reload({ waitUntil: 'networkidle' });
  await openForm(page);
  await chip(page, 'Hombro').click();
  await expect(page.locator('[data-progress-text]')).toHaveText('Paso 2 de 4');
  await page.waitForTimeout(1500);

  const steps = trEvents(fb, 'FormStep').map((r) => trParams(r)['cd[step]']);
  expect(trEvents(fb, 'FormStart')).toHaveLength(1);
  expect(trEvents(fb, 'ViewContent')).toHaveLength(1);
  expect(steps.sort()).toEqual(['1', '2', '3']);
  const errors = trEvents(fb, 'FormError').map((r) => trParams(r));
  expect(errors.map((e) => [e['cd[step]'], e['cd[field]']])).toEqual([['3', 'nombre']]);
  // Ningún dato de salud ni personal en los eventos.
  for (const r of fb) expect(JSON.stringify(trParams(r))).not.toMatch(/Rodilla|Codo|Hombro|Ana/);
  // En Vercel, form_error con paso y campo (página nueva: la anterior quedó en el paso 2).
  await page.goto('/?otra=1#valoracion', { waitUntil: 'networkidle' });
  await page.locator('[data-form-root].is-enhanced').waitFor();
  await chip(page, 'Cadera').click();
  await page.getByRole('button', { name: 'Saltar este paso' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  const vaq = await page.evaluate(() => JSON.stringify(window.vaq ?? []));
  expect(vaq).toContain('"name":"form_error","data":{"step":3,"field":"nombre"}');
  await ctx.close();
});

// ---------------------------------------------------------------------------
// 8. Error con los datos en WhatsApp
// ---------------------------------------------------------------------------

test('error de envío: el enlace de WhatsApp lleva nombre, teléfono, zona y detalle', async ({
  browser,
}) => {
  const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_REJECTED);
  const page = await ctx.newPage();
  await page.route('**/api/lead', (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' }),
  );
  await openForm(page);
  await fillForm(page, {
    zona: 'Muñeca',
    detalle: 'Dolor en los front squat',
    nombre: 'Nora',
    telefono: '677 88 99 00',
  });
  await submitBtn(page).click();
  const link = page.locator('[data-form-error] a');
  await expect(link).toBeVisible();
  expect(waText((await link.getAttribute('href'))!)).toBe(
    'Hola Gerard, soy Nora. El formulario de la web no se ha enviado. Mi teléfono: +34677889900. Zona: Muñeca. Dolor en los front squat',
  );
  await expect(page.locator('[data-form-error]')).toHaveAttribute('role', 'alert');
  await expect(submitBtn(page)).toHaveText('Reintentar el envío');
  await ctx.close();
});

// ---------------------------------------------------------------------------
// 9. Variantes del hero
// ---------------------------------------------------------------------------

test.describe('Variantes del hero', () => {
  const CASES: Array<[string, string | null]> = [
    ['utm_content=mofu3.0', 'mofu3'],
    ['utm_content=MOFU3.0%20', 'mofu3'],
    ['utm_content=%20mofu3', 'mofu3'],
    ['utm_content=mofu%203.0', 'mofu3'],
    ['utm_content=mofu1.0', 'mofu1'],
    ['utm_content=mofu1', 'mofu1'],
    ['utm_content=mofu10', null],
    ['utm_content=mofu10.0', null],
    ['utm_content=mofu10&utm_campaign=mofu_retargeting', 'cierre'],
    ['utm_content=mofu2.0', 'mofu2'],
    ['utm_content=bofu1.0', 'bofu1'],
    ['utm_content=bofu2.0_carrusel', 'bofu2'],
    ['utm_content=bofu2.5', null],
    ['utm_content=tofu1.0', null],
    ['utm_campaign=Descubrir%20octubre', 'descubrir'],
    ['utm_campaign=TOFU_frio', 'descubrir'],
    ['utm_campaign=MOFU', 'cierre'],
    ['utm_campaign=bofu-caliente', 'cierre'],
    ['utm_campaign=Cierre', 'cierre'],
    ['utm_campaign=cerrar', null],
    ['utm_content=xyz&utm_campaign=cierre', 'cierre'],
    ['utm_content=mofu3.0&utm_campaign=descubrir', 'mofu3'],
    ['utm_content=tofu1.0&utm_campaign=descubrir', 'descubrir'],
    ['utm_source=ig', null],
    ['', null],
  ];

  test('tabla de casos: utm_content normalizado > utm_campaign > sesión > hero de siempre', async ({
    browser,
  }) => {
    const wrong: string[] = [];
    for (const [qs, expected] of CASES) {
      const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_REJECTED);
      const page = await ctx.newPage();
      await page.goto(`/?${qs}`, { waitUntil: 'domcontentloaded' });
      const ad = await page.evaluate(() => document.documentElement.dataset.ad ?? null);
      if (ad !== expected) wrong.push(`?${qs} → ${ad} (esperado ${expected})`);
      await ctx.close();
    }
    expect(wrong).toEqual([]);

    // Sesión: se recuerda sin parámetros; una campaña nueva la sustituye; parámetros
    // desconocidos la borran.
    const ctx = await ctxFor(browser, IG_IPHONE, CONSENT_REJECTED);
    const page = await ctx.newPage();
    const ad = () => page.evaluate(() => document.documentElement.dataset.ad ?? null);
    await page.goto('/?utm_content=bofu1.0');
    await page.goto('/');
    expect(await ad()).toBe('bofu1');
    await page.goto('/?utm_campaign=descubrir');
    await page.goto('/');
    expect(await ad()).toBe('descubrir');
    await page.goto('/?utm_content=xyz');
    expect(await ad()).toBeNull();
    await page.goto('/');
    expect(await ad()).toBeNull();
    // Un valor guardado que no es una variante no marca nada.
    await page.evaluate(() => sessionStorage.setItem('rw_ad', 'mofu9'));
    await page.goto('/');
    expect(await ad()).toBeNull();
    await ctx.close();
  });

  for (const [name, device] of [
    ['390', IG_IPHONE],
    ['1440', DESKTOP],
  ] as const) {
    test(`${name}: con el banner abierto, el CTA del hero se ve entero en todas las variantes (capturas)`, async ({
      browser,
    }) => {
      mkdirSync(SHOTS, { recursive: true });
      const keys: Array<[string, string]> = [['generico', '']];
      for (const v of AD_VARIANTS) {
        keys.push([
          v.key,
          v.utm ? `utm_content=${v.utm}` : `utm_campaign=${encodeURIComponent(v.campaign![0]!)}`,
        ]);
      }
      for (const [key, qs] of keys) {
        const ctx = await ctxFor(browser, device, null, { deviceScaleFactor: 1 });
        // CLS de la carga (sin parpadeo del antetítulo ni del subtítulo).
        await ctx.addInitScript(() => {
          const w = window as unknown as { __cls: number };
          w.__cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as Array<{
              value: number;
              hadRecentInput: boolean;
            }>) {
              if (!e.hadRecentInput) w.__cls += e.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const page = await ctx.newPage();
        await page.goto(`/?${qs}`, { waitUntil: 'networkidle' });
        await expect(page.locator('#cookie-banner')).toBeVisible();
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => {
          const banner = document.getElementById('cookie-banner')!.getBoundingClientRect();
          const cta = document.querySelector('[data-hero-cta]')!.getBoundingClientRect();
          const hit = document.elementFromPoint(cta.left + cta.width / 2, cta.top + cta.height / 2);
          return {
            free: cta.bottom <= banner.top && !!hit?.closest('[data-hero-cta]'),
            shift: (window as unknown as { __cls: number }).__cls,
          };
        });
        expect(m.free, key).toBe(true);
        expect(m.shift, key).toBeLessThan(0.01);
        await page.screenshot({ path: `${SHOTS}/${name}-hero-${key}.jpg`, quality: 80 });
        await ctx.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Capturas del resto de cambios
// ---------------------------------------------------------------------------

test('capturas: zonas, formulario, errores, gracias, footer, barra fija y /gracias', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  for (const [name, device] of [
    ['390', IG_IPHONE],
    ['1440', DESKTOP],
  ] as const) {
    const shot = (page: Page, file: string, sel?: string) =>
      sel
        ? page.locator(sel).screenshot({ path: `${SHOTS}/${name}-${file}.jpg`, quality: 80 })
        : page.screenshot({ path: `${SHOTS}/${name}-${file}.jpg`, quality: 80 });
    const ctx = await ctxFor(browser, device, CONSENT_REJECTED, {
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.route('https://wa.me/**', () => undefined); // la gracias no sale de la página
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('#zonas .zonas-alt').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, 'zonas-cierre', '#zonas');
    if (name === '390') {
      await page.locator('#por-que').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await shot(page, 'barra-fija');
    }
    await page.locator('footer.site-footer').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, 'footer', 'footer.site-footer');
    await openForm(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await shot(page, 'form-error-paso1', '[data-form-root]');
    await chip(page, 'Rodilla').click();
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await page.locator('#nombre').fill('Ana');
    await page.keyboard.press('Enter');
    await page.locator('#telefono').fill('12345');
    await submitBtn(page).click();
    await expect(page.locator('#err-consentimiento')).toBeVisible();
    await shot(page, 'form-paso4-errores', '[data-form-root]');
    await page.locator('#telefono').fill('612345678');
    await page.locator('label[for="consentimiento_salud"]').click();
    await page.waitForTimeout(3200);
    let fail = true;
    await page.route('**/api/lead', (route) =>
      fail ? route.abort('internetdisconnected') : route.continue(),
    );
    await submitBtn(page).click();
    await expect(page.locator('[data-form-error]')).toBeVisible();
    await shot(page, 'form-error-envio', '[data-form-root]');
    fail = false;
    await submitBtn(page).click();
    await expect(page.locator('[data-form-done]')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'gracias-tarjeta', '[data-form-root]');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.goto('/gracias', { waitUntil: 'networkidle' });
    await shot(page, 'pagina-gracias');
    await ctx.close();
    // Banner de cookies en la primera visita.
    const first = await ctxFor(browser, device, null, { deviceScaleFactor: 1 });
    const fp = await first.newPage();
    await fp.goto('/', { waitUntil: 'networkidle' });
    await fp.waitForTimeout(600);
    await shot(fp, 'banner');
    await first.close();
  }
});
