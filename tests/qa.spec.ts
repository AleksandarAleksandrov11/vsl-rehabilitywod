/**
 * QA de la landing (sección 15 del encargo).
 * Se ejecuta con `npm run qa` (compila con el adaptador de Node y sirve dist/ aplicando vercel.json).
 */
import { test, expect, type Page, type BrowserContext, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 360, h: 740 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 414, h: 896 },
  { w: 430, h: 932 },
  { w: 844, h: 390, landscape: true },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
] as const;

const PAGES = ['/', '/aviso-legal', '/privacidad', '/cookies', '/gracias'] as const;
const SECTIONS = [
  ['01-hero', '#inicio'],
  ['02-video', '#video'],
  ['03-por-que', '#por-que'],
  ['04-como-funciona', '#como-funciona'],
  ['05-opiniones', '#opiniones'],
  ['06-valoracion', '#valoracion'],
  ['07-footer', 'footer.site-footer'],
] as const;

const LEADS_FILE = 'qa/.tmp/leads.jsonl';
const SHOTS = 'qa/screenshots';
const CONSENT_REJECTED = { v: 1, marketing: false, ts: Date.now() };
const CONSENT_ACCEPTED = { v: 1, marketing: true, ts: Date.now() };

type Vp = (typeof VIEWPORTS)[number];
const vpName = (vp: Vp) => `${vp.w}x${vp.h}`;
const isMobile = (vp: Vp) => vp.w < 768 || ('landscape' in vp && vp.landscape);

// User agent de Chrome normal: fbevents.js descarta los eventos de "HeadlessChrome".
const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function contextOptions(vp: Vp) {
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
const FB_DIR = 'qa/.tmp/fb';
const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
async function stubMeta(ctx: BrowserContext) {
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

async function newCtx(
  browser: import('@playwright/test').Browser,
  vp: Vp,
  extra: Record<string, unknown> = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...contextOptions(vp), ...extra });
  await stubMeta(ctx);
  return ctx;
}

async function setConsent(ctx: BrowserContext, consent: object | null) {
  await ctx.addInitScript((value) => {
    try {
      if (value) window.localStorage.setItem('rw_consent', JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, consent);
}

/** Recoge errores/avisos de consola, errores de página y violaciones de CSP. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  const thirdParty: string[] = [];
  const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4321').origin;
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const url = msg.location()?.url ?? '';
    const line = `${msg.type()}: ${msg.text()} (${url})`;
    if (!url || url.startsWith(origin) || url.startsWith('about:')) problems.push(line);
    else thirdParty.push(line);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  return { problems, thirdParty };
}

async function installCspProbe(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`,
      );
    });
  });
}

async function scrollThrough(page: Page) {
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

function fbRequests(page: Page) {
  const list: Request[] = [];
  page.on('request', (req) => {
    if (/facebook\.(com|net)/.test(new URL(req.url()).hostname)) list.push(req);
  });
  return list;
}

const trEvents = (reqs: Request[], ev: string) =>
  reqs.filter((r) => {
    const u = new URL(r.url());
    if (!/\/tr\/?$/.test(u.pathname)) return false;
    const body = r.postData() ?? '';
    return u.searchParams.get('ev') === ev || new URLSearchParams(body).get('ev') === ev;
  });

const readLeads = (): Array<Record<string, unknown>> =>
  existsSync(LEADS_FILE)
    ? readFileSync(LEADS_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

/** Botones y enlaces visibles de menos de 44 px (un checkbox cuenta con su <label>). */
const smallTargets = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        Number(cs.opacity) > 0.05 &&
        r.width > 2 &&
        r.height > 2 &&
        !el.closest('[inert],[hidden],dialog:not([open]),.sr-only')
      );
    };
    const sel =
      'a[href], button, summary, [role="button"], input[type="checkbox"], input[type="radio"]';
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      let left = r.left,
        top = r.top,
        right = r.right,
        bottom = r.bottom;
      // Un checkbox/radio cuenta con su <label> (toda la etiqueta es pulsable).
      if (el instanceof HTMLInputElement) {
        for (const label of el.labels ?? []) {
          const lr = label.getBoundingClientRect();
          left = Math.min(left, lr.left);
          top = Math.min(top, lr.top);
          right = Math.max(right, lr.right);
          bottom = Math.max(bottom, lr.bottom);
        }
      }
      const w = right - left,
        h = bottom - top;
      const inline = getComputedStyle(el).display === 'inline';
      if (h < 43.5 || (!inline && w < 43.5)) {
        const txt = (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${txt}" ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    return out;
  });

/** Comprobaciones automáticas de una página (sección 15.2). */
async function pageChecks(page: Page, vp: Vp, path: string) {
  const issues: string[] = [];

  // Sin scroll horizontal
  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  if (overflow.sw > overflow.iw) issues.push(`scroll horizontal: ${overflow.sw} > ${overflow.iw}`);

  // Un solo H1
  const h1 = await page.locator('h1').count();
  if (h1 !== 1) issues.push(`h1 = ${h1}`);

  // Imágenes cargadas y con alt
  const imgs = await page.evaluate(() =>
    [...document.images].map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.getAttribute('alt'),
      ok: img.complete && img.naturalWidth > 0,
    })),
  );
  for (const img of imgs) {
    if (img.alt === null) issues.push(`img sin alt: ${img.src}`);
    if (!img.ok) issues.push(`img no carga: ${img.src}`);
  }

  // Enlaces y anclajes internos
  const links = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map(
      (a) => a.getAttribute('href') ?? '',
    ),
  );
  for (const href of new Set(links)) {
    if (href.startsWith('#')) {
      if (href.length > 1 && !(await page.locator(href).count()))
        issues.push(`ancla rota: ${href}`);
    } else if (href.startsWith('/')) {
      const [p, hash] = href.split('#');
      const res = await page.request.get(p || '/', { maxRedirects: 0 });
      if (![200, 301, 308].includes(res.status()))
        issues.push(`enlace roto: ${href} (${res.status()})`);
      if (hash && res.status() === 200 && !(await res.text()).includes(`id="${hash}"`)) {
        issues.push(`ancla rota: ${href}`);
      }
    }
  }

  // Áreas táctiles ≥ 44 px en móvil
  if (isMobile(vp)) {
    for (const s of await smallTargets(page)) issues.push(`área táctil < 44: ${s}`);
  }

  // Viudas de una palabra en H1 y H2
  const widows = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('h1, h2')) {
      const r0 = el.getBoundingClientRect();
      if (!r0.width || el.closest('[hidden],dialog:not([open])')) continue;
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const words: { t: string; top: number }[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.parentElement?.closest('.sr-only')) continue;
        const re = /[^\s]+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(node.data))) {
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const rect = range.getClientRects()[0];
          if (rect) words.push({ t: m[0], top: Math.round(rect.top + rect.height / 2) });
        }
      }
      const lines: string[][] = [];
      let lastTop: number | null = null;
      for (const w of words) {
        if (lastTop === null || Math.abs(w.top - lastTop) > 6) lines.push([]);
        lines[lines.length - 1]!.push(w.t);
        lastTop = w.top;
      }
      if (lines.length > 1 && lines[lines.length - 1]!.length === 1) {
        out.push(
          `${el.tagName} "${el.textContent?.trim().replace(/\s+/g, ' ')}" → última línea: ${lines[lines.length - 1]![0]}`,
        );
      }
    }
    return out;
  });
  for (const w of widows) issues.push(`viuda: ${w}`);

  // axe-core: sin violaciones serias ni críticas
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  for (const v of axe.violations) {
    if (v.impact === 'serious' || v.impact === 'critical') {
      issues.push(
        `axe ${v.impact} ${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
      );
    }
  }

  // CSP
  const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  for (const c of csp) issues.push(`CSP: ${c}`);

  return issues.map((i) => `[${vpName(vp)} ${path}] ${i}`);
}

// ---------------------------------------------------------------------------
// 15.1 + 15.2: todas las páginas en todos los viewports
// ---------------------------------------------------------------------------

test.describe('Viewports', () => {
  for (const vp of VIEWPORTS) {
    test(`checks y capturas ${vpName(vp)}`, async ({ browser }) => {
      const dir = `${SHOTS}/${vpName(vp)}`;
      mkdirSync(dir, { recursive: true });
      const all: string[] = [];
      const third: string[] = [];

      // (a) Comprobaciones con la CSP real y consentimiento ya decidido.
      const ctx = await newCtx(browser, vp);
      await setConsent(ctx, CONSENT_REJECTED);
      await installCspProbe(ctx);
      for (const path of PAGES) {
        const page = await ctx.newPage();
        const con = watchConsole(page);
        await page.goto(path, { waitUntil: 'networkidle' });
        await scrollThrough(page);
        all.push(...(await pageChecks(page, vp, path)));
        all.push(...con.problems.map((p) => `[${vpName(vp)} ${path}] consola: ${p}`));
        third.push(...con.thirdParty);
        await page.close();
      }
      await ctx.close();

      // (b) Capturas (contexto aparte para poder ocultar overlays fijos en las de sección).
      // bypassCSP solo aquí: permite a Playwright inyectar el estilo que oculta los fijos en las
      // capturas de sección. Las comprobaciones de CSP se hacen en el contexto (a).
      const shotCtx = await newCtx(browser, vp, { deviceScaleFactor: 1, bypassCSP: true });
      await setConsent(shotCtx, CONSENT_REJECTED);
      const page = await shotCtx.newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      await scrollThrough(page);
      await page.screenshot({ path: `${dir}/home-fold.png` });
      const hideFixed = '.sticky-cta, .cookie-banner, .skip-link { display: none !important; }';
      await page.screenshot({
        path: `${dir}/home-full.png`,
        fullPage: true,
        animations: 'disabled',
        style: hideFixed,
      });
      for (const [name, sel] of SECTIONS) {
        await page
          .locator(sel)
          .first()
          .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page
          .locator(sel)
          .first()
          .screenshot({
            path: `${dir}/home-${name}.png`,
            animations: 'disabled',
            style: `${hideFixed} .site-header { display: none !important; }`,
          });
      }
      // Barra CTA fija visible (móvil) a mitad de página.
      if (vp.w < 768) {
        await page.locator('#por-que').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'instant' }));
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${dir}/home-sticky.png` });
      }
      // Formulario en cada paso.
      await page
        .locator('[data-form-root]')
        .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page
        .locator('[data-form-root]')
        .screenshot({ path: `${dir}/form-step1.png`, animations: 'disabled' });
      for (const p of ['/aviso-legal', '/privacidad', '/cookies', '/gracias']) {
        await page.goto(p, { waitUntil: 'networkidle' });
        await page.screenshot({
          path: `${dir}/page-${p.slice(1)}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
      await shotCtx.close();

      // (c) Primera visita: banner de cookies.
      const firstCtx = await newCtx(browser, vp, { deviceScaleFactor: 1 });
      const fp = await firstCtx.newPage();
      await fp.goto('/', { waitUntil: 'networkidle' });
      await fp.waitForTimeout(600);
      await fp.screenshot({ path: `${dir}/first-visit-banner.png` });
      // El banner no tapa el formulario: con el banner abierto, el botón del paso 1 se puede
      // llevar por encima del banner con scroll.
      await fp.locator('[data-form-root]').scrollIntoViewIfNeeded();
      const bannerTop = await fp
        .locator('#cookie-banner')
        .evaluate((el) => el.getBoundingClientRect().top);
      await fp.locator('[data-next]').evaluate((el, top) => {
        const r = el.getBoundingClientRect();
        window.scrollBy({ top: r.bottom - top + 16, behavior: 'instant' });
      }, bannerTop);
      await fp.waitForTimeout(300);
      const nextBox = await fp.locator('[data-next]').boundingBox();
      if (nextBox && nextBox.y + nextBox.height > bannerTop + 1) {
        all.push(`[${vpName(vp)}] el banner tapa el botón Continuar`);
      }
      await fp.screenshot({ path: `${dir}/first-visit-form.png` });

      // Áreas táctiles también con el banner abierto, con el panel Configurar y en el paso 4.
      if (isMobile(vp)) {
        for (const t of await smallTargets(fp))
          all.push(`[${vpName(vp)} banner] área táctil < 44: ${t}`);
        await fp.locator('[data-consent-action="configure"]').click();
        await fp.screenshot({ path: `${dir}/cookie-prefs.png` });
        for (const t of await smallTargets(fp))
          all.push(`[${vpName(vp)} panel cookies] área táctil < 44: ${t}`);
        await fp.locator('[data-consent-action="save"]').click();
        await chip(fp, 'Rodilla').click();
        await fp.locator('fieldset[data-step="2"]').waitFor();
        await fp.getByRole('button', { name: 'Saltar este paso' }).click();
        await fp.locator('#nombre').fill('Test');
        await fp.getByRole('button', { name: 'Continuar' }).click();
        await fp.locator('fieldset[data-step="4"]').waitFor();
        await fp
          .locator('[data-form-root]')
          .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await fp.waitForTimeout(400);
        await fp
          .locator('[data-form-root]')
          .screenshot({ path: `${dir}/form-step4.png`, animations: 'disabled' });
        for (const t of await smallTargets(fp))
          all.push(`[${vpName(vp)} paso 4] área táctil < 44: ${t}`);
      }
      await firstCtx.close();

      test.info().annotations.push({ type: 'third-party-console', description: third.join('\n') });
      expect(all, all.join('\n')).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 15.3 Flujos: consentimiento y Pixel
// ---------------------------------------------------------------------------

test.describe('Consentimiento y Pixel', () => {
  const vp = VIEWPORTS[3]; // 390x844

  test('sin decidir: ninguna petición a Meta ni cookie _fbp', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('#cookie-banner')).toBeVisible();
    await expect(page.locator('#cookie-banner')).toBeFocused();
    await scrollThrough(page);
    expect(fb.map((r) => r.url())).toEqual([]);
    const cookies = await ctx.cookies();
    expect(cookies.find((c) => c.name === '_fbp' || c.name === '_fbc')).toBeUndefined();
    await ctx.close();
  });

  test('Esc cierra sin decidir y el banner vuelve en la siguiente página', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape');
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await page.goto('/privacidad', { waitUntil: 'networkidle' });
    await expect(page.locator('#cookie-banner')).toBeVisible();
    await ctx.close();
  });

  test('Aceptar y Rechazar tienen el mismo tamaño y peso visual', async ({ browser }) => {
    for (const v of [VIEWPORTS[3], VIEWPORTS[10]]) {
      const ctx = await newCtx(browser, v);
      const page = await ctx.newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      const style = async (action: string) =>
        page.locator(`[data-consent-action="${action}"]`).evaluate((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            bg: cs.backgroundColor,
            color: cs.color,
            fw: cs.fontWeight,
            fs: cs.fontSize,
          };
        });
      const accept = await style('accept');
      const reject = await style('reject');
      expect(reject).toEqual(accept);
      expect(accept.h).toBeGreaterThanOrEqual(44);
      const configure = await style('configure');
      expect(configure.h).toBeGreaterThanOrEqual(44);
      await ctx.close();
    }
  });

  test('Rechazar: sigue sin peticiones tras recargar', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('[data-consent-action="reject"]').click();
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await scrollThrough(page);
    expect(fb.length).toBe(0);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('rw_consent') ?? 'null'),
    );
    expect(stored).toMatchObject({ v: 1, marketing: false });
    await ctx.close();
  });

  test('Aceptar: fbevents.js y PageView en la misma visita', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    await installCspProbe(ctx);
    const page = await ctx.newPage();
    const con = watchConsole(page);
    const fb = fbRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(fb.length).toBe(0);
    await page.locator('[data-consent-action="accept"]').click();
    await expect.poll(() => fb.some((r) => r.url().includes('/en_US/fbevents.js'))).toBe(true);
    await expect
      .poll(() => trEvents(fb, 'PageView').length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    // Sin datos de salud ni personales en ninguna petición a Meta.
    for (const r of fb) {
      const blob = decodeURIComponent(`${r.url()} ${r.postData() ?? ''}`);
      expect(blob).not.toMatch(/Hombro|Rodilla|lumbar|detalle|zona=|\+34\d{9}/);
    }
    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(csp).toEqual([]);
    expect(con.problems).toEqual([]);
    await ctx.close();
  });

  test('Configurar → marketing → Guardar: igual que Aceptar', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('[data-consent-action="configure"]').click();
    await expect(page.locator('#cookie-prefs')).toBeVisible();
    await expect(page.locator('#cb-tecnicas')).toBeChecked();
    await expect(page.locator('#cb-tecnicas')).toBeDisabled();
    await expect(page.locator('#cb-marketing')).not.toBeChecked();
    await page.locator('#cb-marketing').check();
    await page.locator('[data-consent-action="save"]').click();
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await expect
      .poll(() => trEvents(fb, 'PageView').length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await ctx.close();
  });

  test('Visita siguiente con consentimiento: Pixel al inicio', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_ACCEPTED);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await expect
      .poll(() => trEvents(fb, 'PageView').length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await ctx.close();
  });

  test('Retirar desde el footer: borra _fbp y _fbc y no salen más eventos', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    const fb = fbRequests(page);
    await page.goto('/?fbclid=QA_TEST_CLICK', { waitUntil: 'networkidle' });
    await page.locator('[data-consent-action="accept"]').click();
    await expect
      .poll(() => trEvents(fb, 'PageView').length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          (await ctx.cookies())
            .map((c) => c.name)
            .sort()
            .join(','),
        { timeout: 15_000 },
      )
      .toContain('_fbp');
    expect((await ctx.cookies()).map((c) => c.name)).toContain('_fbc');

    await page.locator('footer [data-open-cookie-settings]').click();
    await expect(page.locator('#cookie-banner')).toBeVisible();
    await expect(page.locator('#cb-marketing')).toBeChecked();
    await page.locator('#cb-marketing').uncheck();
    await page.locator('[data-consent-action="save"]').click();
    const names = (await ctx.cookies()).map((c) => c.name);
    expect(names).not.toContain('_fbp');
    expect(names).not.toContain('_fbc');

    const before = fb.length;
    await page.locator('[data-vsl-play]').click();
    await page.waitForTimeout(2500);
    expect(trEvents(fb.slice(before), 'ViewContent')).toHaveLength(0);
    expect(fb.slice(before).filter((r) => r.url().includes('/tr'))).toHaveLength(0);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// VSL
// ---------------------------------------------------------------------------

test.describe('VSL', () => {
  test('fachada: nada de YouTube antes del clic; iframe nocookie con autoplay después', async ({
    browser,
  }) => {
    const ctx = await newCtx(browser, VIEWPORTS[10]);
    await setConsent(ctx, CONSENT_ACCEPTED);
    await installCspProbe(ctx);
    const page = await ctx.newPage();
    const con = watchConsole(page);
    const yt: string[] = [];
    page.on('request', (r) => {
      if (/youtube|ytimg|googlevideo|ggpht/.test(new URL(r.url()).hostname)) yt.push(r.url());
    });
    const fb = fbRequests(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await scrollThrough(page);
    await page.locator('#video').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(yt).toEqual([]);
    expect(await page.locator('#video iframe').count()).toBe(0);

    await page.locator('[data-vsl-play]').click();
    const iframe = page.locator('#video iframe');
    await expect(iframe).toHaveCount(1);
    const src = (await iframe.getAttribute('src')) ?? '';
    expect(src).toContain('https://www.youtube-nocookie.com/embed/V3AgSalCNJs');
    expect(src).toContain('autoplay=1');
    expect(src).toContain('playsinline=1');
    await expect.poll(() => yt.some((u) => u.includes('youtube-nocookie.com'))).toBe(true);
    await expect
      .poll(() => trEvents(fb, 'ViewContent').length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const vc = trEvents(fb, 'ViewContent')[0]!;
    expect(decodeURIComponent(`${vc.url()} ${vc.postData() ?? ''}`)).toContain('VSL');
    const vaq = await page.evaluate(() => JSON.stringify(window.vaq ?? []));
    expect(vaq).toContain('vsl_play');
    await page.waitForTimeout(3000); // vídeo reproduciéndose
    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(csp).toEqual([]);
    expect(con.problems).toEqual([]);
    test
      .info()
      .annotations.push({ type: 'third-party-console', description: con.thirdParty.join('\n') });
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

const chip = (page: Page, zona: string) =>
  page.locator('#lead-form label.chip').filter({ has: page.locator(`input[value="${zona}"]`) });

async function openForm(page: Page) {
  await page.goto('/#valoracion', { waitUntil: 'networkidle' });
  await page.locator('[data-form-root].is-enhanced').waitFor();
}

test.describe('Formulario', () => {
  const vp = VIEWPORTS[3];

  test('camino feliz: Hombro → saltar → nombre → 612345678 → casilla → enviar', async ({
    browser,
  }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_ACCEPTED);
    await installCspProbe(ctx);
    const page = await ctx.newPage();
    const con = watchConsole(page);
    const fb = fbRequests(page);
    let apiBody: Record<string, unknown> | null = null;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/lead') && r.method() === 'POST')
        apiBody = JSON.parse(r.postData() ?? '{}');
    });
    await openForm(page);

    await expect(page.locator('[data-progress-text]')).toHaveText('1 / 4');
    await chip(page, 'Hombro').click();
    // Avanza solo a los 250 ms
    await expect(page.locator('fieldset[data-step="2"]')).toBeVisible();
    await expect(page.locator('[data-progress-text]')).toHaveText('2 / 4');
    await expect(page.locator('#s2-title')).toBeFocused();
    await expect(page.locator('[data-live]')).toHaveText('Paso 2 de 4');

    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await expect(page.locator('#s3-title')).toBeFocused();
    await page.locator('#nombre').fill('Ana');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#s4-title')).toBeFocused();
    await page.locator('#telefono').fill('612345678');
    await page.locator('#consentimiento_salud').check();
    await page.waitForTimeout(3200); // tiempo humano (> 3 s desde el inicio)

    const vaq = await page.evaluate(() => JSON.stringify(window.vaq ?? []));
    expect(vaq).toContain('form_step');

    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    await page.waitForURL('**/gracias');
    await expect(page.locator('h1')).toHaveText('Recibido, Ana.');
    expect(page.url()).not.toContain('Ana');

    const body = apiBody as Record<string, unknown> | null;
    expect(body).not.toBeNull();
    expect(body!.telefono).toBe('+34612345678');
    expect(body!.zona).toBe('Hombro');
    expect(String(body!.event_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(body!.consentimiento_salud).toBe(true);
    expect(body!.consentimiento_marketing).toBe(true);

    const saved = readLeads().find((l) => l.event_id === body!.event_id);
    expect(saved?.telefono).toBe('+34612345678');

    await expect.poll(() => trEvents(fb, 'Lead').length, { timeout: 15_000 }).toBeGreaterThan(0);
    const lead = trEvents(fb, 'Lead')[0]!;
    const leadBlob = `${lead.url()} ${lead.postData() ?? ''}`;
    expect(leadBlob).toContain(`eid=${body!.event_id}`);
    expect(decodeURIComponent(leadBlob)).not.toMatch(/Hombro|Ana|612345678/);

    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(csp).toEqual([]);
    expect(con.problems).toEqual([]);
    await ctx.close();
  });

  test('"Otro" sin detalle no avanza y muestra el error', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await openForm(page);
    await chip(page, 'Otro').click();
    await expect(page.locator('fieldset[data-step="2"]')).toBeVisible();
    await expect(page.locator('#s2-title')).toHaveText('¿Qué te pasa?');
    await expect(page.getByRole('button', { name: 'Saltar este paso' })).toBeHidden();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('fieldset[data-step="2"]')).toBeVisible();
    await expect(page.locator('#err-detalle')).toBeVisible();
    await expect(page.locator('#detalle')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#detalle').fill('Me duele el pectoral');
    await expect(page.locator('#err-detalle')).toBeHidden();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('fieldset[data-step="3"]')).toBeVisible();
    await ctx.close();
  });

  test('validaciones: nombre de 1 carácter, teléfono de 8 dígitos, casilla', async ({
    browser,
  }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    let posted = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/lead')) posted += 1;
    });
    await openForm(page);
    await chip(page, 'Rodilla').click();
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await page.locator('#nombre').fill('A');
    await page.keyboard.press('Enter');
    await expect(page.locator('#err-nombre')).toBeVisible();
    await expect(page.locator('#nombre')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#nombre').fill('Álex');
    await page.keyboard.press('Enter');
    await expect(page.locator('fieldset[data-step="4"]')).toBeVisible();

    await page.locator('#telefono').fill('61234567');
    await page.locator('#consentimiento_salud').check();
    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    await expect(page.locator('#err-telefono')).toBeVisible();
    await expect(page.locator('#telefono')).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(0);

    await page.locator('#telefono').fill('612345678');
    await page.locator('#consentimiento_salud').uncheck();
    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    await expect(page.locator('#err-consentimiento')).toBeVisible();
    await expect(page.locator('#err-telefono')).toBeHidden();
    await page.waitForTimeout(500);
    expect(posted).toBe(0);
    await ctx.close();
  });

  test('+44 7700 900123 pasa y se normaliza a E.164', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    let body: Record<string, unknown> | null = null;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/lead')) body = JSON.parse(r.postData() ?? '{}');
    });
    await openForm(page);
    await chip(page, 'Codo').click();
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await page.locator('#nombre').fill('Liam');
    await page.keyboard.press('Enter');
    await page.locator('#telefono').fill('+44 7700 900123');
    await page.locator('#consentimiento_salud').check();
    await page.waitForTimeout(3100);
    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    await page.waitForURL('**/gracias');
    expect((body as Record<string, unknown> | null)?.telefono).toBe('+447700900123');
    await ctx.close();
  });

  test('volver atrás conserva los datos', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await openForm(page);
    await chip(page, 'Muñeca').click();
    await page.locator('#detalle').fill('Dolor en los front squat');
    await expect(page.locator('[data-count-value]')).toHaveText('24');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('#nombre').fill('Marta');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.locator('#nombre')).toHaveValue('Marta');
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.locator('#detalle')).toHaveValue('Dolor en los front squat');
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.locator('input[name="zona"][value="Muñeca"]')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Atrás' })).toBeHidden();
    await ctx.close();
  });

  test('solo teclado: Tab, flechas en los chips y Enter', async ({ browser }) => {
    const ctx = await newCtx(browser, VIEWPORTS[10]);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await openForm(page);
    await page.locator('#s1-title').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('input[name="zona"]').first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    // Con flechas solo se mueve la selección: no avanza solo.
    await page.waitForTimeout(500);
    await expect(page.locator('fieldset[data-step="1"]')).toBeVisible();
    await expect(page.locator('input[name="zona"][value="Muñeca"]')).toBeChecked();
    await page.keyboard.press('Enter');
    await expect(page.locator('fieldset[data-step="2"]')).toBeVisible();
    await expect(page.locator('#s2-title')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#detalle')).toBeFocused();
    await page.keyboard.type('Me molesta al apoyar');
    await page.keyboard.press('Enter');
    await expect(page.locator('#s3-title')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#nombre')).toBeFocused();
    await page.keyboard.type('Nora');
    await page.keyboard.press('Enter');
    await expect(page.locator('#s4-title')).toBeFocused();
    await page.keyboard.press('Tab'); // prefijo
    await expect(page.locator('#prefijo')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#telefono')).toBeFocused();
    await page.keyboard.type('699 11 22 33');
    await page.keyboard.press('Tab');
    await expect(page.locator('#consentimiento_salud')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#consentimiento_salud')).toBeChecked();
    await ctx.close();
  });

  test('honeypot relleno: responde ok y no guarda nada', async ({ browser, request }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await openForm(page);
    await chip(page, 'Cadera').click();
    await page.getByRole('button', { name: 'Saltar este paso' }).click();
    await page.locator('#nombre').fill('Bot Honeypot UI');
    await page.keyboard.press('Enter');
    await page.locator('#telefono').fill('612000111');
    await page.locator('#consentimiento_salud').check();
    await page
      .locator('#website')
      .evaluate((el: HTMLInputElement) => (el.value = 'https://spam.example'));
    await page.waitForTimeout(3100);
    const resp = page.waitForResponse('**/api/lead');
    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    expect(await (await resp).json()).toEqual({ ok: true });
    await page.waitForURL('**/gracias');
    expect(readLeads().some((l) => l.nombre === 'Bot Honeypot UI')).toBe(false);

    const api = await request.post('/api/lead', {
      data: {
        zona: 'Hombro',
        nombre: 'Bot Honeypot API',
        telefono: '612000222',
        consentimiento_salud: true,
        website: 'x',
        started_at: Date.now() - 60_000,
      },
    });
    expect(await api.json()).toEqual({ ok: true });
    expect(readLeads().some((l) => l.nombre === 'Bot Honeypot API')).toBe(false);
    await ctx.close();
  });

  test('envío en menos de 3 s: responde ok y no guarda nada', async ({ request }) => {
    const now = Date.now();
    const res = await request.post('/api/lead', {
      data: {
        zona: 'Hombro',
        detalle: '',
        nombre: 'Bot Rapido',
        telefono: '612000333',
        consentimiento_salud: true,
        website: '',
        started_at: now,
        submitted_at: now + 900,
      },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(readLeads().some((l) => l.nombre === 'Bot Rapido')).toBe(false);
  });

  test('API: validación en servidor y método', async ({ request }) => {
    const old = Date.now() - 60_000;
    const bad = await request.post('/api/lead', {
      data: {
        zona: 'Otro',
        detalle: 'abc',
        nombre: 'A',
        telefono: '61234567',
        consentimiento_salud: false,
        website: '',
        started_at: old,
      },
    });
    expect(bad.status()).toBe(422);
    expect((await bad.json()).fields).toEqual([
      'detalle',
      'nombre',
      'telefono',
      'consentimiento_salud',
    ]);
    const get = await request.get('/api/lead');
    expect(get.status()).toBe(405);
  });

  test('sin JavaScript: formulario entero y POST a /api/lead → /gracias', async ({ browser }) => {
    // reducedMotion: sin scroll suave, que hace reintentar el auto-scroll de Playwright.
    const ctx = await newCtx(browser, vp, { javaScriptEnabled: false, reducedMotion: 'reduce' });
    await installCspProbe(ctx);
    const page = await ctx.newPage();
    await page.goto('/#valoracion');
    // Espera a que termine el scroll suave hasta el ancla.
    await expect
      .poll(async () => {
        const a = await page.evaluate(() => window.scrollY);
        await page.waitForTimeout(150);
        return a === (await page.evaluate(() => window.scrollY));
      })
      .toBe(true);
    for (const step of [1, 2, 3, 4])
      await expect(page.locator(`fieldset[data-step="${step}"]`)).toBeVisible();
    await expect(page.locator('[data-next]')).toBeHidden();
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await page.locator('label.chip', { hasText: 'Tobillo / pie' }).click();
    await page.locator('#detalle').fill('Esguince que no termina de curar');
    await page.locator('#nombre').fill('Sin JS');
    await page.locator('#telefono').fill('655444333');
    await page.locator('#consentimiento_salud').check();
    await page.getByRole('button', { name: 'Enviar y valorar mi caso' }).click();
    await page.waitForURL('**/gracias');
    await expect(page.locator('h1')).toHaveText('Recibido.');
    const saved = readLeads().find((l) => l.nombre === 'Sin JS');
    expect(saved?.telefono).toBe('+34655444333');
    expect(saved?.zona).toBe('Tobillo / pie');
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Barra CTA fija
// ---------------------------------------------------------------------------

test.describe('Barra CTA fija', () => {
  const vp = VIEWPORTS[3];
  const visible = (page: Page) =>
    page
      .locator('[data-sticky-cta]')
      .evaluate(
        (el) =>
          el.classList.contains('is-visible') && getComputedStyle(el).visibility === 'visible',
      );

  test('aparece al pasar el hero, desaparece en #valoracion, vuelve en el footer', async ({
    browser,
  }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(await visible(page)).toBe(false);
    await page.locator('#video').scrollIntoViewIfNeeded();
    await expect.poll(() => visible(page)).toBe(true);
    await page.locator('#valoracion [data-form-root]').scrollIntoViewIfNeeded();
    await expect.poll(() => visible(page)).toBe(false);
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await page.waitForTimeout(400);
    // En el footer puede reaparecer, pero nunca tapa su contenido (hueco reservado).
    const copyBottom = await page
      .locator('.footer-copy')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const barTop = await page
      .locator('[data-sticky-cta]')
      .evaluate((el) => el.getBoundingClientRect().top);
    if (await visible(page)) expect(copyBottom).toBeLessThanOrEqual(barTop);
    await ctx.close();
  });

  test('nunca coincide con el banner de cookies', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('#cookie-banner')).toBeVisible();
    await page.locator('#video').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    expect(await visible(page)).toBe(false);
    await page.locator('[data-consent-action="reject"]').click();
    await expect.poll(() => visible(page)).toBe(true);
    await page.locator('footer [data-open-cookie-settings]').click();
    await expect.poll(() => visible(page)).toBe(false);
    await ctx.close();
  });

  test('respeta el safe-area del iPhone (390x844, hasTouch, isMobile)', async ({ browser }) => {
    const ctx = await newCtx(browser, vp);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toContain('viewport-fit=cover');
    const pad = () =>
      page
        .locator('[data-sticky-cta]')
        .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    const base = await pad();
    const cdp = await ctx.newCDPSession(page);
    let emulated = false;
    try {
      await cdp.send(
        'Emulation.setSafeAreaInsetsOverride' as never,
        { insets: { top: 47, bottom: 34, left: 0, right: 0 } } as never,
      );
      emulated = true;
    } catch {
      emulated = false;
    }
    if (emulated) {
      await page.waitForTimeout(200);
      expect(await pad()).toBeCloseTo(base + 34, 0);
    } else {
      // Sin emulación disponible: se verifica la regla CSS.
      const css = await page.evaluate(async () => {
        const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
          (l) => l.href,
        );
        return (await Promise.all(hrefs.map((h) => fetch(h).then((r) => r.text())))).join('\n');
      });
      expect(css).toMatch(/\.sticky-cta\[[^\]]+\]\{[^}]*env\(safe-area-inset-bottom\)/);
    }
    test.info().annotations.push({
      type: 'safe-area',
      description: emulated ? 'emulado por CDP' : 'regla CSS verificada',
    });
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Marquee de testimonios
// ---------------------------------------------------------------------------

test.describe('Marquee', () => {
  const trackX = (page: Page) =>
    page
      .locator('.marquee-track')
      .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

  test('se mueve a la izquierda, loop sin saltos y pausa con hover', async ({ browser }) => {
    const ctx = await newCtx(browser, VIEWPORTS[10]);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('#opiniones').scrollIntoViewIfNeeded();
    const x1 = await trackX(page);
    await page.waitForTimeout(1200);
    const x2 = await trackX(page);
    expect(x2).toBeLessThan(x1);

    // Pausa con hover (antes de tocar la animación por script).
    await page.locator('.marquee').hover();
    const h1 = await trackX(page);
    await page.waitForTimeout(700);
    const h2 = await trackX(page);
    expect(Math.abs(h2 - h1)).toBeLessThan(0.5);
    await page.mouse.move(5, 5);

    const geo = await page.evaluate(() => {
      const lists = [...document.querySelectorAll<HTMLElement>('.marquee-list')];
      const track = document.querySelector<HTMLElement>('.marquee-track')!;
      const anim = track.getAnimations()[0] as CSSAnimation;
      const kf = (anim.effect as KeyframeEffect).getKeyframes();
      return {
        w0: lists[0]!.getBoundingClientRect().width,
        w1: lists[1]!.getBoundingClientRect().width,
        track: track.scrollWidth,
        from: kf[0]?.transform,
        to: kf[kf.length - 1]?.transform,
        duration: anim.effect?.getTiming().duration,
        iterations: anim.effect?.getTiming().iterations,
        copyHidden: lists[1]!.getAttribute('aria-hidden'),
        copyInert: lists[1]!.hasAttribute('inert'),
      };
    });
    // -50% del track = exactamente el ancho de una copia → el final coincide con el inicio.
    expect(Math.abs(geo.w0 - geo.w1)).toBeLessThan(0.5);
    expect(Math.abs(geo.track - 2 * geo.w0)).toBeLessThan(1);
    expect(String(geo.to)).toContain('-50%');
    expect(Number(geo.duration)).toBeGreaterThanOrEqual(45_000);
    expect(Number(geo.duration)).toBeLessThanOrEqual(60_000);
    expect(geo.iterations).toBe(Infinity);
    expect(geo.copyHidden).toBe('true');
    expect(geo.copyInert).toBe(true);

    // Posición de la primera tarjeta de la copia con desplazamiento -50%: igual que la original en 0.
    const seam = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>('.marquee-track')!;
      const anim = track.getAnimations()[0]!;
      const dur = Number(anim.effect!.getTiming().duration);
      anim.pause();
      anim.currentTime = 0;
      const a = document
        .querySelector('.marquee-list:not([data-copy]) .t-card')!
        .getBoundingClientRect().left;
      anim.currentTime = dur - 0.001;
      const b = document
        .querySelector('.marquee-list[data-copy] .t-card')!
        .getBoundingClientRect().left;
      anim.play();
      return { a, b };
    });
    expect(Math.abs(seam.a - seam.b)).toBeLessThan(1.5);
    await ctx.close();
  });

  test('reduced motion: sin animación y con scroll manual', async ({ browser }) => {
    const ctx = await newCtx(browser, VIEWPORTS[3], { reducedMotion: 'reduce' });
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('#opiniones').scrollIntoViewIfNeeded();
    const info = await page.evaluate(() => {
      const m = document.querySelector<HTMLElement>('.marquee')!;
      const t = document.querySelector<HTMLElement>('.marquee-track')!;
      return {
        anim: getComputedStyle(t).animationName,
        overflow: getComputedStyle(m).overflowX,
        scrollable: m.scrollWidth > m.clientWidth,
        copy: getComputedStyle(document.querySelector('.marquee-list[data-copy]')!).display,
        snap: getComputedStyle(m).scrollSnapType,
      };
    });
    expect(info.anim).toBe('none');
    expect(info.overflow).toBe('auto');
    expect(info.scrollable).toBe(true);
    expect(info.copy).toBe('none');
    expect(info.snap).toContain('x');
    const before = await page.locator('.marquee').evaluate((el) => el.scrollLeft);
    await page
      .locator('.marquee')
      .evaluate((el) => el.scrollBy({ left: 300, behavior: 'instant' }));
    const after = await page.locator('.marquee').evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
    // Contador: sin animación, número final directamente.
    await expect(page.locator('[data-count-to]')).toHaveText('+120');
    await ctx.close();
  });

  test('"Leer más" abre el testimonio completo en un <dialog> accesible', async ({ browser }) => {
    const ctx = await newCtx(browser, VIEWPORTS[3]);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    const btn = page.locator('.marquee-list:not([data-copy]) [data-dialog-open="t-leo"]');
    await btn.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('#t-leo');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('he aprendido a gestionar las cargas');
    await expect(dialog).toContainText('más de un año');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(btn).toBeFocused();
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Otros
// ---------------------------------------------------------------------------

test.describe('Rendimiento', () => {
  test('JS total en la home < 30 KB comprimido (sin Pixel ni YouTube)', async ({ browser }) => {
    const ctx = await newCtx(browser, VIEWPORTS[3]);
    await setConsent(ctx, CONSENT_REJECTED);
    const page = await ctx.newPage();
    const sizes: Record<string, number> = {};
    page.on('response', async (res) => {
      const url = res.url();
      if (!url.startsWith('http://127.0.0.1') || !/\.js(\?|$)/.test(url)) return;
      const len = Number((await res.allHeaders())['content-length'] ?? 0);
      sizes[new URL(url).pathname] = len || (await res.body()).length;
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await scrollThrough(page);
    const own = Object.entries(sizes).filter(([p]) => !p.startsWith('/_vercel/'));
    const total = own.reduce((acc, [, n]) => acc + n, 0);
    test
      .info()
      .annotations.push({ type: 'js-bytes', description: `${total} B en ${own.length} archivos` });
    expect(total).toBeLessThan(30 * 1024);
    await ctx.close();
  });
});

test.describe('Estructura y copy (sección 4 y 16)', () => {
  test('exactamente 6 secciones en orden, con CTA al final de cada una salvo la 6', async ({
    page,
  }) => {
    await page.goto('/');
    const ids = await page.locator('main > section').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(['inicio', 'video', 'por-que', 'como-funciona', 'opiniones', 'valoracion']);
    const ctas = await page
      .locator('main > section')
      .evaluateAll((els) =>
        els.map((sec) =>
          [...sec.querySelectorAll('a[data-cta]')].map((a) => a.getAttribute('data-cta')),
        ),
      );
    expect(ctas).toEqual([['hero', 'hero_video'], ['vsl'], ['why'], ['how'], ['testimonials'], []]);
    // El último CTA de cada sección 2–5 es el último elemento interactivo de la sección.
    for (const id of ['video', 'por-que', 'como-funciona', 'opiniones']) {
      const last = await page.locator(`#${id}`).evaluate((sec) =>
        [...sec.querySelectorAll('a, button')]
          .filter((el) => !el.closest('dialog'))
          .pop()
          ?.getAttribute('data-cta'),
      );
      expect(last, id).toBeTruthy();
    }
    await expect(page.locator('header [data-cta="header"]')).toHaveAttribute('href', '#valoracion');
    await expect(page.locator('[data-sticky-cta] [data-cta="sticky"]')).toHaveAttribute(
      'href',
      '#valoracion',
    );
  });

  test('copy de la sección 4 tal cual', async ({ page }) => {
    await page.goto('/');
    const text = await page.evaluate(() =>
      (document.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' '),
    );
    const expected = [
      'Fisioterapia online para atletas de CrossFit',
      'Recupérate de tu lesión sin dejar de entrenar.',
      'Un plan a medida, ajustado cada semana y con seguimiento diario. Estés donde estés.',
      'Quiero valorar mi caso',
      'Ver el vídeo · 7 min',
      '+120 atletas recuperados',
      '100 % online',
      'Valoración inicial gratuita',
      'atletas recuperados',
      'fisio y atleta de CrossFit desde',
      'online, estés donde estés',
      'seguimiento en app y WhatsApp',
      'Si llevas tiempo con dolor, este vídeo es para ti.',
      'En 7 minutos vas a entender por qué no has mejorado y qué puedes hacer a partir de ahora.',
      'Te escribo yo por WhatsApp. Sin compromiso.',
      'Si entrenas con dolor, esto te suena.',
      'Evitas ejercicios que antes hacías sin pensar.',
      'Mejoras un poco y, al volver a entrenar normal, recaes.',
      'Empiezas a pensar que lo tuyo es crónico.',
      'El problema no suele ser tu lesión. Suele ser el enfoque.',
      'Ejercicios sueltos, un tratamiento puntual cuando duele y ninguna progresión.',
      'Alivia a corto plazo, pero no prepara a tu cuerpo para volver a tolerar lo que le pides entrenando.',
      'Especialista en CrossFit.',
      'Fisioterapeuta y atleta desde 2017. Conozco el box por dentro.',
      'Sin dejar de entrenar.',
      'Adaptamos tu programación para que sigas entrenando de forma segura.',
      'Un plan que se ajusta.',
      'Reajustes cada semana según cómo responde tu cuerpo.',
      'Nunca vas solo.',
      'Seguimiento diario en la app y contacto directo por WhatsApp.',
      'Así de claro.',
      'Valoramos tu caso.',
      'Rellenas el formulario y hacemos una videollamada gratuita.',
      'Desde el primer día sabes qué hacer, qué evitar y por qué.',
      'Tu plan, en tu móvil.',
      'Ejercicio específico y las adaptaciones para que sigas entrenando, en una app sencilla.',
      'Seguimiento diario y reajustes cada semana.',
      'Vuelves al 100 %.',
      'Preparamos tu vuelta a tu mejor nivel y te damos herramientas para no recaer.',
      'Programas de 8, 12 o 24 semanas según tu caso. El precio depende del plan y lo vemos juntos en la valoración.',
      'Atletas reales. Vuelta real al box.',
      'Después de varias consultas con fisios y seguimiento con traumatólogo sin ninguna mejoría… Ha sido el único profesional con el que he notado mejoría y he recuperado la movilidad en mi hombro.',
      'Había probado muchos tratamientos y fisios, incluso infiltraciones, y el dolor no desaparecía. A día de hoy estoy entrenando con total normalidad sin dolor.',
      'A pesar de ser todo online, el seguimiento y la cercanía han sido de 10. La mejora ha sido brutal y puedo volver a practicar CrossFit sin miedo a ningún movimiento.',
      'Es la mejor rehabilitación que he hecho nunca. Lo que más destaco es el compromiso, el feedback y la capacidad que tiene para conocerte y conocer tu lesión.',
      'Gerard me ayudó a entender mi lesión y a gestionar el dolor, las cargas y la intensidad. Mi rodilla ha recuperado su funcionalidad y puedo volver a entrenar sin dolor.',
      'No podía hacer ningún ejercicio con el brazo por encima de la cabeza. Poco a poco fui mejorando hasta no sentir nada de dolor y volver a entrenar con normalidad.',
      'Epitrocleitis, más de un año',
      'Condromalacia en ambas rodillas',
      'Diez meses con dolor',
      'Dolor de hombro en overhead',
      'Soy Gerard Barrantes.',
      'Fisioterapeuta y atleta de CrossFit desde 2017, y fundador de RehabilityWOD.',
      'He trabajado en clínicas privadas y en la red sanitaria de Tarragona.',
      'Hoy me dedico a que atletas como tú vuelvan a entrenar sin dolor y con confianza en su cuerpo.',
      'Gerard Barrantes · Fisioterapeuta',
      'Cuéntame qué te pasa.',
      'Te escribo por WhatsApp para una videollamada de valoración gratuita. Si no es para ti, te lo diré claro.',
      'Abro plazas nuevas cuando tengo hueco para darte el seguimiento que mereces.',
      '¿Qué te duele?',
      'Cuéntame un poco más.',
      '¿Cómo te llamas?',
      '¿A qué número te escribo?',
      'He leído la política de privacidad (se abre en una pestaña nueva) y consiento el tratamiento de los datos de salud que he indicado para valorar mi caso.',
      'Enviar y valorar mi caso',
      '¿Cómo me vas a ayudar si no me tratas en persona?',
      'No necesitas que te toque para recuperarte. Necesitas entender lo que te pasa, una estrategia adaptada a ti y alguien que te acompañe en todo el proceso. La mayoría de diagnósticos fiables no dependen de la palpación, sino de una buena evaluación y pruebas funcionales guiadas, también a distancia.',
      '¿Cómo sé si esto es para mí?',
      'Si entrenas CrossFit, arrastras dolor desde hace tiempo y has probado de todo sin resultados duraderos, lo más probable es que sí. Lo vemos en la videollamada gratuita, y si no es para ti, te lo diré claro.',
      '¿Qué garantías tengo?',
      'No te voy a prometer resultados en dos semanas ni una solución mágica. Te garantizo un proceso en el que no estás solo: probamos, ajustamos y afinamos lo que necesitas en cada fase.',
      '¿Y si ya tengo pruebas o diagnóstico por imagen?',
      'Genial, las usamos como información complementaria. Una resonancia te dice qué hay a nivel estructural, pero no lo que puedes o no puedes hacer. Lo que marca el rumbo es cómo te afecta en el día a día y cómo responde tu cuerpo al esfuerzo.',
      'Fisioterapia online para atletas de CrossFit.',
      'Usamos cookies propias para que la web funcione y, si nos dejas, de Meta para medir nuestros anuncios.',
      'Gerard Barrantes Bautista · RehabilityWOD',
    ];
    const missing = expected.filter((t) => !text.includes(t));
    expect(missing).toEqual([]);
    for (const z of [
      'Hombro',
      'Codo',
      'Muñeca',
      'Espalda / lumbar',
      'Cadera',
      'Rodilla',
      'Tobillo / pie',
      'Otro',
    ]) {
      await expect(page.locator(`#lead-form input[name="zona"][value="${z}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#detalle')).toHaveAttribute(
      'placeholder',
      'Ej.: me duele el hombro en los overhead desde hace 6 meses.',
    );
    await expect(page.locator('#consentimiento_salud')).not.toBeChecked();
  });
});

test.describe('Páginas legales y rutas', () => {
  for (const path of ['/aviso-legal', '/privacidad', '/cookies']) {
    test(`${path} muestra los datos del titular`, async ({ page }) => {
      await page.goto(path);
      const text = await page.locator('main').innerText();
      expect(text).toContain('GERARD BARRANTES BAUTISTA');
      expect(text).toContain('48010022Y');
      expect(text).toContain('43007 Tarragona');
      expect(text).toContain('636 748 147');
      expect(text).toContain('info@rehabilitywod.com');
      expect(text).toMatch(/Última actualización: \S+/);
    });
  }

  test('privacidad: transferencias internacionales corregidas', async ({ page }) => {
    await page.goto('/privacidad');
    const text = await page.locator('main').innerText();
    expect(text).toContain('Marco de Privacidad de Datos UE-EE. UU.');
    expect(text).not.toMatch(/No están previstas transferencias/);
    expect(text).toContain('artículo 9');
  });

  test('/vsl redirige a /#video con 301', async ({ request }) => {
    const res = await request.get('/vsl', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe('/#video');
  });

  test('/gracias es noindex y no está en el sitemap', async ({ page, request }) => {
    await page.goto('/gracias');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    const sm = await (await request.get('/sitemap-0.xml')).text();
    expect(sm).not.toContain('/gracias');
    expect(sm).toContain('/privacidad');
  });

  test('cabeceras de seguridad', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
    expect(h['strict-transport-security']).toContain('max-age=63072000');
    expect(h['content-security-policy']).toContain(
      "script-src 'self' https://connect.facebook.net",
    );
    expect(h['content-security-policy']).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  test('sin guiones largos, emojis ni estrellas en el texto', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const html = await page.content();
      const text = await page.locator('body').innerText();
      expect(text, path).not.toContain('—');
      expect(html, path).not.toContain('—');
      expect(text, path).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}★☆⭐✨🔥]/u);
    }
  });
});
