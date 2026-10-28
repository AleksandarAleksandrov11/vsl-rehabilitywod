/**
 * Utilidades compartidas por las pruebas de Playwright (tests/qa.spec.ts y tests/leads.spec.ts):
 * contextos de navegador, Meta simulado con el fbevents.js real, consentimiento, CSP, peticiones a
 * Meta, archivos del modo QA (leads y API de conversiones), formulario y servidores aparte.
 */
import { test, type Page, type BrowserContext, type Request } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

export const LEADS_FILE = 'qa/.tmp/leads.jsonl';
export const CAPI_FILE = 'qa/.tmp/capi.jsonl';
export const CONSENT_REJECTED = { v: 1, marketing: false, ts: Date.now() };
export const CONSENT_ACCEPTED = { v: 1, marketing: true, ts: Date.now() };

export type Vp = { readonly w: number; readonly h: number; readonly landscape?: boolean };
export const vpName = (vp: Vp) => `${vp.w}x${vp.h}`;
export const isMobile = (vp: Vp) => vp.w < 768 || vp.landscape === true;

// User agent de Chrome normal: fbevents.js descarta los eventos de "HeadlessChrome".
export const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
export const UA_DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function contextOptions(vp: Vp) {
  const mobile = isMobile(vp);
  return {
    viewport: { width: vp.w, height: vp.h },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    userAgent: mobile ? UA_MOBILE : UA_DESKTOP,
  };
}

/**
 * Meta: por defecto se sirve el fbevents.js REAL de Meta desde la caché local (qa/.tmp/fb, la
 * descarga scripts/qa.mjs) y las peticiones a www.facebook.com/tr se responden con un GIF.
 * Así el QA no depende de la red. Con QA_LIVE_META=1 se usa la red real.
 */
export const FB_DIR = 'qa/.tmp/fb';
export const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
export async function stubMeta(ctx: BrowserContext) {
  if (process.env.QA_LIVE_META === '1') return;
  if (!existsSync(`${FB_DIR}/fbevents.js`)) return;
  await ctx.route('https://connect.facebook.net/**', (route) => {
    const url = route.request().url();
    const file = url.includes('/fbevents.js')
      ? 'fbevents.js'
      : url.includes('/signals/config/')
        ? 'config.js'
        : null;
    if (!file || !existsSync(`${FB_DIR}/${file}`)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: readFileSync(`${FB_DIR}/${file}`),
    });
  });
  await ctx.route(/^https:\/\/www\.facebook\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: GIF }),
  );
}

export async function newCtx(
  browser: import('@playwright/test').Browser,
  vp: Vp,
  extra: Record<string, unknown> = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...contextOptions(vp), ...extra });
  await stubMeta(ctx);
  // WhatsApp simulado: tras enviar, la gracias abre wa.me (nunca se sale a internet en el QA).
  await ctx.route('https://wa.me/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (QA)</title>' }),
  );
  return ctx;
}

export async function setConsent(ctx: BrowserContext, consent: object | null) {
  await ctx.addInitScript((value) => {
    try {
      if (value) window.localStorage.setItem('rw_consent', JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, consent);
}

/** Recoge errores/avisos de consola, errores de página y violaciones de CSP. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  const thirdParty: string[] = [];
  const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4321').origin;
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const url = msg.location()?.url ?? '';
    const line = `${msg.type()}: ${msg.text()} (${url})`;
    // Aviso de Chromium sin GPU al iniciar el reproductor de YouTube (no es código de la web).
    if (/Failed to create WebGPU Context Provider/.test(msg.text())) thirdParty.push(line);
    else if (!url || url.startsWith(origin) || url.startsWith('about:')) problems.push(line);
    else thirdParty.push(line);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  return { problems, thirdParty };
}

/**
 * Recoge las violaciones de CSP en window.__csp. Las conexiones que el propio fbevents.js de Meta
 * intenta abrir hacia dominios suyos que cambian (p. ej. *.a.run.app o *.on.aws, según la
 * configuración del Pixel que sirve Meta) y su registro de errores se bloquean a propósito y van a
 * window.__cspMeta: no son un fallo de la web y el Pixel sigue enviando sus eventos a
 * facebook.com/tr.
 */
export async function installCspProbe(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __csp: string[]; __cspMeta: string[] };
    w.__csp = [];
    w.__cspMeta = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      const line = `${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`;
      // También el registro de errores que fbevents.js intenta cargar como imagen desde su propio
      // dominio (connect.facebook.net/log/error), que img-src bloquea a propósito.
      const fromMeta =
        (e.violatedDirective.startsWith('connect-src') &&
          e.sourceFile.startsWith('https://connect.facebook.net/')) ||
        (e.violatedDirective.startsWith('img-src') &&
          e.blockedURI.startsWith('https://connect.facebook.net/'));
      (fromMeta ? w.__cspMeta : w.__csp).push(line);
    });
  });
}

export async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.6));
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y <= H; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 70));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(900);
}

export function fbRequests(page: Page) {
  const list: Request[] = [];
  page.on('request', (req) => {
    if (/facebook\.(com|net)/.test(new URL(req.url()).hostname)) list.push(req);
  });
  return list;
}

/**
 * Parámetros de una petición a facebook.com/tr: los de la URL y los del cuerpo (urlencoded o
 * multipart/form-data, que es como fbevents.js manda los eventos largos, p. ej. el Lead con
 * advanced matching).
 */
export function trParams(r: Request): Record<string, string> {
  const params = new URLSearchParams(new URL(r.url()).search);
  const body = r.postData() ?? '';
  const type = r.headers()['content-type'] ?? '';
  if (body && type.startsWith('multipart/')) {
    for (const m of body.matchAll(/name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g)) {
      params.set(m[1]!, m[2]!);
    }
  } else if (body) {
    new URLSearchParams(body).forEach((v, k) => params.set(k, v));
  }
  return Object.fromEntries(params);
}

export const trEvents = (reqs: Request[], ev: string) =>
  reqs.filter((r) => /\/tr\/?$/.test(new URL(r.url()).pathname) && trParams(r).ev === ev);

/** Eventos que se habrían enviado a la API de conversiones (modo QA, sin token). */
export const readCapi = (): Array<{ data: Array<Record<string, unknown>> }> =>
  existsSync(CAPI_FILE)
    ? readFileSync(CAPI_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

export const readLeads = (): Array<Record<string, unknown>> =>
  existsSync(LEADS_FILE)
    ? readFileSync(LEADS_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

// User agent del navegador de Instagram en iPhone (los anuncios de Meta se abren aquí).
export const UA_IG_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.28.81 (iPhone15,3; iOS 18_5; es_ES; es; scale=3.00; 1290x2796; 761254823)';

/** Instagram en iPhone 390x844 (en Chromium: mismo tamaño, táctil y user agent). */
export const IG_IPHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: UA_IG_IOS,
};

export const chip = (page: Page, zona: string) =>
  page.locator('#lead-form label.chip').filter({ has: page.locator(`input[value="${zona}"]`) });

/** Botón de envío (su texto cambia: "Enviar y abrir WhatsApp" en móvil). */
export const submitBtn = (page: Page) => page.locator('[data-submit]');

export async function openForm(page: Page) {
  await page.goto('/#valoracion', { waitUntil: 'networkidle' });
  await page.locator('[data-form-root].is-enhanced').waitFor();
}

/** Rellena los 4 pasos (sin enviar) y espera el tiempo mínimo del antispam. */
export async function fillForm(
  page: Page,
  data: { zona: string; detalle?: string; nombre: string; telefono: string },
) {
  await chip(page, data.zona).click();
  await page.locator('fieldset[data-step="2"]').waitFor();
  if (data.detalle) {
    await page.locator('#detalle').fill(data.detalle);
    await page.getByRole('button', { name: 'Continuar' }).click();
  } else {
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
  }
  await page.locator('#nombre').fill(data.nombre);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#telefono').fill(data.telefono);
  await page.locator('#consentimiento_salud').check();
  await page.waitForTimeout(3200); // tiempo humano (> 3 s desde el inicio)
}

/**
 * Contrato con el Apps Script: el cuerpo que recibe es exactamente el Lead más `secret`, con estos
 * tipos. Si alguien añade o quita un campo, las pruebas fallan (no se puede cambiar la hoja).
 */
export const ZONAS_QA = [
  'Hombro',
  'Codo',
  'Muñeca',
  'Espalda / lumbar',
  'Cadera',
  'Rodilla',
  'Tobillo / pie',
  'Otro',
];
export const CONTRACT_KEYS = [
  'zona',
  'detalle',
  'nombre',
  'telefono',
  'consentimiento_salud',
  'consentimiento_marketing',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'landing_url',
  'referrer',
  'device',
  'event_id',
  'started_at',
  'secret',
];
export function contractProblems(body: Record<string, unknown>): string[] {
  const out: string[] = [];
  const keys = Object.keys(body);
  const extra = keys.filter((k) => !CONTRACT_KEYS.includes(k));
  const missing = CONTRACT_KEYS.filter((k) => !keys.includes(k));
  if (extra.length) out.push(`campos de más: ${extra.join(', ')}`);
  if (missing.length) out.push(`faltan campos: ${missing.join(', ')}`);
  const str = (k: string) => typeof body[k] === 'string' || out.push(`${k} no es texto`);
  for (const k of CONTRACT_KEYS) {
    if (!['consentimiento_salud', 'consentimiento_marketing', 'started_at'].includes(k)) str(k);
  }
  if (!ZONAS_QA.includes(String(body.zona))) out.push(`zona fuera de las 8: ${body.zona}`);
  if (body.consentimiento_salud !== true) out.push('consentimiento_salud no es true');
  if (typeof body.consentimiento_marketing !== 'boolean')
    out.push('consentimiento_marketing no es booleano');
  if (body.started_at !== null && typeof body.started_at !== 'number')
    out.push('started_at no es número ni null');
  if (!['mobile', 'tablet', 'desktop', ''].includes(String(body.device)))
    out.push(`device inesperado: ${body.device}`);
  if (!/^[0-9a-f-]{36}$/.test(String(body.event_id))) out.push('event_id no es un UUID');
  if (!/^\+\d{8,15}$/.test(String(body.telefono))) out.push('telefono no es E.164');
  return out;
}

/** Servidor de QA aparte (otro puerto y otras variables), para pruebas con otra configuración. */
export async function startQaServer(port: number, env: Record<string, string>) {
  const server: ChildProcess = spawn('node', ['scripts/qa-server.mjs'], {
    env: { ...process.env, PORT: String(port), LEAD_MOCK: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout?.on('data', (d) => (log += d));
  server.stderr?.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 75; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  // Sin los códigos de color de la consola.
  // eslint-disable-next-line no-control-regex
  const plain = () => log.replace(/\x1b\[[0-9;]*m/g, '');
  return { url, log: plain, stop: () => server.kill() };
}

/**
 * Eventos de Vercel Analytics de una página, aunque la página navegue (p. ej. a WhatsApp): se
 * reenvían a Node antes de que cargue la web.
 */
export async function captureVercel(page: Page): Promise<string[]> {
  const events: string[] = [];
  await page.exposeFunction('__qaVa', (entry: string) => events.push(entry));
  await page.addInitScript(() => {
    const w = window as unknown as { va: unknown; __qaVa: (s: string) => void };
    w.va = (event: string, props: unknown) => w.__qaVa(JSON.stringify([event, props]));
  });
  return events;
}

export const readJsonl = (file: string): Array<Record<string, unknown>> =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

export { rmSync };
