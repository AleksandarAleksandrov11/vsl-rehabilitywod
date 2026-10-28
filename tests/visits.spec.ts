/**
 * Visitas por la API de conversiones (/api/event-capi), para que Meta vea las visitas aunque no se
 * acepten las cookies. Se ejecutan con `npm run qa`, junto a tests/qa.spec.ts y tests/leads.spec.ts.
 *  1. El endpoint: lista cerrada de eventos, solo el propio origen, bots ignorados, un envío por
 *     event_id, sin datos personales (modo QA: CAPI_MOCK_FILE).
 *  2. Con el simulador de Meta: con token llega a Meta (también si Meta responde 500), sin token no
 *     se envía nada y responde 204.
 *  3. En el navegador: PageView al cargar la landing y ViewContent una vez por sesión, con el fbc
 *     guardado al aterrizar (también en el Lead); al aceptar las cookies no hay doble PageView (el
 *     del Pixel sale con el event_id ya enviado) y el ViewContent del Pixel comparte event_id.
 * El contrato con el Apps Script sigue en tests/leads.spec.ts y no cambia.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import {
  CONSENT_ACCEPTED,
  IG_IPHONE,
  UA_MOBILE,
  fbRequests,
  fillForm,
  openForm,
  readCapi,
  setConsent,
  startQaServer,
  stubMeta,
  submitBtn,
  trEvents,
  trParams,
} from './helpers';

type Ev = {
  event_name: string;
  event_id: string;
  event_source_url: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};
/** Eventos de visita (PageView y ViewContent) guardados por el servidor de QA. */
const visits = (): Ev[] =>
  readCapi()
    .map((b) => b.data[0] as unknown as Ev)
    .filter((e) => e && ['PageView', 'ViewContent'].includes(e.event_name));
const byId = (id: string) => visits().filter((e) => e.event_id === id);

async function ctxFor(browser: Browser, consent: object | null) {
  const ctx = await browser.newContext({ locale: 'es-ES', ...IG_IPHONE });
  await stubMeta(ctx);
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ body: 'WhatsApp (QA)' }));
  if (consent) await setConsent(ctx, consent);
  return ctx;
}

/** Cuerpos que la página manda a /api/event-capi. */
function beacons(page: Page) {
  const list: Array<Record<string, string>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/event-capi')) list.push(JSON.parse(r.postData() ?? '{}'));
  });
  return list;
}

// ---------------------------------------------------------------------------
// 1. El endpoint
// ---------------------------------------------------------------------------

test.describe('/api/event-capi', () => {
  const base = () => test.info().project.use.baseURL!;
  const headers = (extra: Record<string, string> = {}) => ({
    'content-type': 'text/plain;charset=UTF-8',
    origin: base(),
    'user-agent': UA_MOBILE,
    'x-forwarded-for': '198.51.100.23, 10.0.0.1',
    ...extra,
  });
  const body = (extra: Record<string, unknown> = {}) => ({
    event_name: 'PageView',
    event_id: crypto.randomUUID(),
    event_source_url: `${base()}/?utm_source=ig&fbclid=x`,
    fbc: 'fb.1.1790000000123.PRUEBA123',
    fbp: 'fb.1.1700000000000.1234567890',
    ...extra,
  });

  test('PageView y ViewContent: solo user agent, IP, fbc y fbp; nada personal', async ({
    request,
  }) => {
    const pv = body();
    expect(
      (
        await request.post('/api/event-capi', { headers: headers(), data: JSON.stringify(pv) })
      ).status(),
    ).toBe(204);
    const [ev] = byId(pv.event_id);
    expect(Object.keys(ev!).sort()).toEqual(
      [
        'action_source',
        'event_id',
        'event_name',
        'event_source_url',
        'event_time',
        'user_data',
      ].sort(),
    );
    expect(ev!.event_name).toBe('PageView');
    expect(ev!.event_source_url).toBe(`${base()}/`);
    expect(ev!.user_data).toEqual({
      client_user_agent: UA_MOBILE,
      client_ip_address: '198.51.100.23',
      fbc: 'fb.1.1790000000123.PRUEBA123',
      fbp: 'fb.1.1700000000000.1234567890',
    });
    // ViewContent: lo mismo, con el content_name del Pixel. fbc o fbp no válidos se ignoran.
    const vc = body({ event_name: 'ViewContent', fbc: 'cualquier-cosa', fbp: '' });
    await request.post('/api/event-capi', {
      headers: headers({ 'content-type': 'application/json' }),
      data: vc,
    });
    const [ev2] = byId(vc.event_id);
    expect(ev2!.custom_data).toEqual({ content_name: 'Formulario' });
    expect(ev2!.user_data).toEqual({
      client_user_agent: UA_MOBILE,
      client_ip_address: '198.51.100.23',
    });
  });

  test('lista cerrada, solo el propio origen, un envío por event_id y bots ignorados', async ({
    request,
  }) => {
    const post = (data: unknown, h: Record<string, string> = {}) =>
      request.post('/api/event-capi', {
        headers: headers(h),
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
    const ids: string[] = [];
    const tryEvent = async (extra: Record<string, unknown>, h: Record<string, string> = {}) => {
      const b = body(extra);
      ids.push(b.event_id);
      return (await post(b, h)).status();
    };
    for (const name of ['Lead', 'Purchase', 'Contact', 'pageview', '']) {
      expect(await tryEvent({ event_name: name }), name).toBe(400);
    }
    expect(await tryEvent({ event_id: 'no-uuid' })).toBe(400);
    expect((await post('{no es json')).status()).toBe(400);
    expect(await tryEvent({ extra: 'x'.repeat(3000) })).toBe(413);
    expect(await tryEvent({}, { 'content-type': 'text/html' })).toBe(415);
    expect(await tryEvent({}, { origin: 'https://otra-web.example' })).toBe(403);
    expect(await tryEvent({}, { origin: '' })).toBe(403); // ni Origin ni Referer
    expect(await tryEvent({}, { origin: '', referer: 'https://otra-web.example/' })).toBe(403);
    expect((await request.get('/api/event-capi')).status()).toBe(405);
    // Bots evidentes: 204 sin mandar nada.
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
      'curl/8.5.0',
    ]) {
      expect(await tryEvent({}, { 'user-agent': ua }), ua).toBe(204);
    }
    expect(ids.flatMap(byId)).toEqual([]);
    // Sin Origin pero con Referer de la propia web: vale. Repetido: 409 y sigue habiendo uno.
    const ok = body();
    expect((await post(ok, { origin: '', referer: `${base()}/` })).status()).toBe(204);
    expect((await post(ok)).status()).toBe(409);
    expect(byId(ok.event_id)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Con el simulador de Meta
// ---------------------------------------------------------------------------

test.describe('/api/event-capi con el simulador de Meta', () => {
  async function fakeMeta(port: number, status: number) {
    const calls: Array<{ url: string; body: string }> = [];
    const server: Server = createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        calls.push({ url: req.url ?? '', body: b });
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(status === 200 ? '{"events_received":1}' : '{"error":{"message":"QA"}}');
      });
    });
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
    return { calls, close: () => server.close() };
  }
  const send = (url: string, data: Record<string, unknown>) =>
    fetch(`${url}/api/event-capi`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8', origin: url, 'user-agent': UA_MOBILE },
      body: JSON.stringify({
        event_id: crypto.randomUUID(),
        event_source_url: `${url}/`,
        fbc: 'fb.1.1790000000123.PRUEBA123',
        ...data,
      }),
    });

  test('con token: PageView y ViewContent llegan a Meta (y si Meta falla, 204 igual)', async () => {
    const meta = await fakeMeta(4491, 200);
    const server = await startQaServer(4492, {
      META_CAPI_TOKEN: 'token-falso-qa',
      CAPI_GRAPH_URL: 'http://127.0.0.1:4491',
    });
    try {
      expect((await send(server.url, { event_name: 'PageView' })).status).toBe(204);
      expect((await send(server.url, { event_name: 'ViewContent' })).status).toBe(204);
      await expect.poll(() => meta.calls.length).toBe(2);
      for (const call of meta.calls) {
        expect(call.url).toBe('/v24.0/1433154668778788/events?access_token=token-falso-qa');
        const sent = JSON.parse(call.body);
        expect(sent.test_event_code).toBeUndefined();
        expect(sent.data[0].action_source).toBe('website');
        expect(sent.data[0].user_data).toEqual({
          client_user_agent: UA_MOBILE,
          client_ip_address: '127.0.0.1',
          fbc: 'fb.1.1790000000123.PRUEBA123',
        });
      }
      expect(meta.calls.map((c) => JSON.parse(c.body).data[0].event_name)).toEqual([
        'PageView',
        'ViewContent',
      ]);
    } finally {
      server.stop();
      meta.close();
    }
    // Meta respondiendo 500: la respuesta sigue siendo 204 y el log no lleva datos ni el token.
    const meta500 = await fakeMeta(4493, 500);
    const server500 = await startQaServer(4494, {
      META_CAPI_TOKEN: 'token-falso-qa',
      CAPI_GRAPH_URL: 'http://127.0.0.1:4493',
    });
    try {
      expect((await send(server500.url, { event_name: 'PageView' })).status).toBe(204);
      await expect.poll(() => server500.log()).toContain('[capi] Meta respondió 500');
      const capiLog = server500
        .log()
        .split('\n')
        .filter((l) => l.startsWith('[capi]'))
        .join('\n');
      expect(capiLog).not.toMatch(/token-falso-qa|PRUEBA123|127\.0\.0\.1/);
    } finally {
      server500.stop();
      meta500.close();
    }
  });

  test('sin token: no envía nada y responde 204', async () => {
    const meta = await fakeMeta(4495, 200);
    const server = await startQaServer(4496, { CAPI_GRAPH_URL: 'http://127.0.0.1:4495' });
    try {
      expect((await send(server.url, { event_name: 'PageView' })).status).toBe(204);
      expect((await send(server.url, { event_name: 'ViewContent' })).status).toBe(204);
      await new Promise((r) => setTimeout(r, 800));
      expect(meta.calls).toHaveLength(0);
    } finally {
      server.stop();
      meta.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. En el navegador
// ---------------------------------------------------------------------------

test.describe('Visitas desde el navegador', () => {
  test('sin cookies: PageView al cargar y ViewContent una vez al llegar al formulario, con el fbc del fbclid; nada de Meta en el navegador', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, null);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    const sent = beacons(page);
    await page.goto('/?fbclid=PRUEBA123', { waitUntil: 'networkidle' });
    await expect.poll(() => sent.length).toBe(1);
    const pv = sent[0]!;
    expect(pv.event_name).toBe('PageView');
    const stored = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('rw_attribution') ?? '{}').fbc as string,
    );
    expect(stored).toMatch(/^fb\.1\.\d{13}\.PRUEBA123$/);
    await expect.poll(() => byId(pv.event_id!).length).toBe(1);
    const ev = byId(pv.event_id!)[0]!;
    expect(ev.user_data.fbc).toBe(stored);
    expect(ev.user_data.fbp).toBeUndefined();
    expect(ev.user_data.client_ip_address).toBe('127.0.0.1');
    expect(ev.event_source_url).toMatch(/\/$/);
    // Aún no ha llegado al formulario: sin ViewContent.
    await page.waitForTimeout(500);
    expect(sent.filter((b) => b.event_name === 'ViewContent')).toHaveLength(0);
    await page.locator('#valoracion [data-form-root]').scrollIntoViewIfNeeded();
    await expect.poll(() => sent.filter((b) => b.event_name === 'ViewContent').length).toBe(1);
    // Volver a pasar por el formulario o recargar: el ViewContent no se repite en la sesión.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#valoracion [data-form-root]').scrollIntoViewIfNeeded();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#valoracion [data-form-root]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(sent.map((b) => b.event_name)).toEqual(['PageView', 'ViewContent', 'PageView']);
    expect(new Set(sent.map((b) => b.event_id)).size).toBe(3);
    // Las demás páginas no mandan PageView de servidor.
    await page.goto('/privacidad', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    expect(sent).toHaveLength(3);
    expect(fb.map((r) => r.url())).toEqual([]);
    await ctx.close();
  });

  test('al aceptar las cookies no hay doble PageView: el del Pixel sale con el event_id ya enviado; el ViewContent también se comparte', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, null);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    const sent = beacons(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect.poll(() => sent.length).toBe(1);
    const pvId = sent[0]!.event_id!;
    // Llega al formulario sin cookies (ViewContent de servidor) y después acepta.
    await page.locator('#valoracion [data-form-root]').scrollIntoViewIfNeeded();
    await expect.poll(() => sent.filter((b) => b.event_name === 'ViewContent').length).toBe(1);
    const vcId = sent.find((b) => b.event_name === 'ViewContent')!.event_id!;
    await page.locator('[data-consent-action="accept"]').click();
    await expect.poll(() => trEvents(fb, 'PageView').length, { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(1500);
    expect(trEvents(fb, 'PageView')).toHaveLength(1);
    expect(trParams(trEvents(fb, 'PageView')[0]!).eid).toBe(pvId);
    // Ni un PageView más por el servidor al aceptar.
    expect(sent.filter((b) => b.event_name === 'PageView')).toHaveLength(1);
    expect(byId(pvId)).toHaveLength(1);
    // Paso 1: ViewContent del Pixel con el event_id del ViewContent de servidor (que no se repite).
    await page
      .locator('#lead-form label.chip')
      .filter({ has: page.locator('input[value="Codo"]') })
      .click();
    await expect.poll(() => trEvents(fb, 'ViewContent').length, { timeout: 15_000 }).toBe(1);
    expect(trParams(trEvents(fb, 'ViewContent')[0]!).eid).toBe(vcId);
    await page.waitForTimeout(800);
    expect(sent.filter((b) => b.event_name === 'ViewContent')).toHaveLength(1);
    expect(byId(vcId)).toHaveLength(1);
    await ctx.close();
  });

  test('con las cookies ya aceptadas: mismo event_id en el PageView del Pixel y del servidor, ViewContent a la vez que el del Pixel y fbp en la siguiente visita', async ({
    browser,
  }) => {
    const ctx = await ctxFor(browser, CONSENT_ACCEPTED);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    const sent = beacons(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect.poll(() => trEvents(fb, 'PageView').length, { timeout: 15_000 }).toBe(1);
    expect(trParams(trEvents(fb, 'PageView')[0]!).eid).toBe(sent[0]!.event_id);
    // Con el Pixel cargado, llegar al formulario no basta: el ViewContent sale en el paso 1.
    await page.locator('#valoracion [data-form-root]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(sent.filter((b) => b.event_name === 'ViewContent')).toHaveLength(0);
    await page
      .locator('#lead-form label.chip')
      .filter({ has: page.locator('input[value="Hombro"]') })
      .click();
    await expect.poll(() => trEvents(fb, 'ViewContent').length, { timeout: 15_000 }).toBe(1);
    await expect.poll(() => sent.filter((b) => b.event_name === 'ViewContent').length).toBe(1);
    expect(sent.find((b) => b.event_name === 'ViewContent')!.event_id).toBe(
      trParams(trEvents(fb, 'ViewContent')[0]!).eid,
    );
    // En la siguiente carga ya existe la cookie _fbp: va también en el PageView de servidor.
    await page.goto('/?otra=1', { waitUntil: 'networkidle' });
    await expect.poll(() => sent.filter((b) => b.event_name === 'PageView').length).toBe(2);
    const second = sent.filter((b) => b.event_name === 'PageView')[1]!;
    expect(second.fbp).toMatch(/^fb\.\d\.\d{13}\.\d+$/);
    await expect.poll(() => byId(second.event_id!).length).toBe(1);
    expect(byId(second.event_id!)[0]!.user_data.fbp).toBe(second.fbp);
    await ctx.close();
  });

  test('el Lead usa el mismo fbc guardado al aterrizar', async ({ browser }) => {
    const ctx = await ctxFor(browser, null);
    const page = await ctx.newPage();
    let leadBody: Record<string, unknown> | null = null;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/lead-capi')) leadBody = JSON.parse(r.postData() ?? '{}');
    });
    await page.goto('/?fbclid=PRUEBA123', { waitUntil: 'networkidle' });
    const stored = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('rw_attribution') ?? '{}').fbc as string,
    );
    await openForm(page);
    await fillForm(page, { zona: 'Cadera', nombre: 'Ana Fbc', telefono: '612000444' });
    await submitBtn(page).click();
    await expect(page.locator('[data-form-done]')).toBeVisible();
    await expect.poll(() => leadBody).not.toBeNull();
    const body = leadBody as unknown as Record<string, unknown>;
    expect(body.fbc).toBe(stored);
    const lead = readCapi().find((b) => b.data[0]?.event_id === body.event_id);
    expect((lead?.data[0]?.user_data as Record<string, unknown>).fbc).toBe(stored);
    await ctx.close();
  });
});
