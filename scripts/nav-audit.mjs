/**
 * npm run qa:nav
 * Auditoría de botones y enlaces de todas las páginas: a dónde llevan y dónde queda la pantalla.
 *   A)  Inventario: enlaces internos (200 y anclas) y pestañas nuevas con noopener; botones con
 *       nombre accesible. Salidas de la web solo en /gracias (WhatsApp) y en las legales (teléfono,
 *       email y AEPD): la home y la 404 no tienen ninguna.
 *   F)  Fugas: en la home, con Instagram de iPhone (390) y escritorio (1440), con y sin JS, con el
 *       banner abierto y cerrado, el FAQ abierto, la barra fija a la vista y errores de validación,
 *       ningún enlace, formulario ni iframe sale del dominio (salvo el reproductor del vídeo).
 *   A2) Ningún botón ni enlace tapado por otro en su punto de toque (móvil y escritorio, con y sin
 *       banner de cookies).
 *   B)  En Chromium móvil, WebKit (iPhone) y escritorio: todos los CTA a #valoracion dejan la
 *       sección del formulario arriba, bajo la cabecera; "Ver el vídeo" lleva al vídeo; cada
 *       tarjeta de "¿Qué te duele?" (y su enlace "¿Otra duda?", con "Otro") con un solo toque marca
 *       la zona, abre el paso 2 y deja el formulario arriba; "Configurar cookies", FAQ,
 *       testimonios, vídeo, logo y enlaces entre páginas.
 * Requiere un build con ASTRO_ADAPTER=node. WebKit es opcional (si no está instalado, se omite).
 * PARTS=A,F,A2,B para elegir partes.
 */
import { spawn } from 'node:child_process';
import { chromium, webkit, devices } from '@playwright/test';
const PORT = 4510,
  SITE = `http://127.0.0.1:${PORT}`;
try {
  await fetch(SITE);
  throw new Error(`El puerto ${PORT} ya está ocupado`);
} catch (e) {
  if (String(e.message).includes('ocupado')) throw e;
}
const server = spawn('node', ['scripts/qa-server.mjs'], {
  env: { ...process.env, PORT: String(PORT), LEAD_MOCK: '1' },
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
process.on('uncaughtException', (e) => {
  console.error(e);
  server.kill();
  process.exit(1);
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(SITE)).ok) break;
  } catch {
    // el servidor aún no está listo
  }
  await new Promise((r) => setTimeout(r, 200));
}
const problems = [];
const ok = [];
const report = (good, msg) => {
  (good ? ok : problems).push(msg);
  console.log(`${good ? '✓' : '✗'} ${msg}`);
};
const settle = async (page) => {
  let last = -1,
    same = 0;
  for (let i = 0; i < 80 && same < 6; i++) {
    await page.waitForTimeout(100);
    const y = await page.evaluate(() => Math.round(scrollY));
    same = y === last ? same + 1 : 0;
    last = y;
  }
  return last;
};
const headerH = (page) =>
  page.evaluate(() => document.querySelector('[data-header]')?.getBoundingClientRect().bottom ?? 0);
const top = (page, sel) =>
  page.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().top), sel);

const PARTS = (process.env.PARTS ?? 'A,F,A2,B').split(',');
const IG_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.28.81 (iPhone15,3; iOS 18_5; es_ES; es; scale=3.00; 1290x2796; 761254823)';
// Salidas permitidas por página (todo lo demás debe quedarse en la web).
const LEGAL_OUT = [
  /^tel:\+34640995494$/,
  /^mailto:info@rehabilitywod\.com$/,
  /^https:\/\/www\.aepd\.es$/,
];
const ALLOWED_OUT = {
  '/gracias': [/^https:\/\/wa\.me\/34640995494\?text=.+/],
  '/aviso-legal': LEGAL_OUT,
  '/privacidad': LEGAL_OUT,
  '/cookies': LEGAL_OUT,
};
// ---------- A) Inventario estático de todas las páginas ----------
if (PARTS.includes('A')) {
  const b = await chromium.launch();
  const page = await b.newPage();
  for (const path of ['/', '/gracias', '/aviso-legal', '/privacidad', '/cookies', '/no-existe']) {
    const res = await page.goto(SITE + path, { waitUntil: 'domcontentloaded' });
    const items = await page.evaluate(() => ({
      links: [...document.querySelectorAll('a[href]')].map((a) => ({
        href: a.getAttribute('href'),
        text: (a.getAttribute('aria-label') || a.textContent)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 50),
        target: a.target,
        rel: a.rel,
      })),
      buttons: [...document.querySelectorAll('button')].map((b) => ({
        name: (b.getAttribute('aria-label') || b.textContent)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 50),
      })),
    }));
    let bad = 0;
    for (const l of items.links) {
      const h = l.href;
      if (l.target === '_blank' && !/noopener/.test(l.rel)) {
        bad++;
        report(false, `${path}: "${l.text}" abre pestaña nueva sin noopener`);
      }
      if (h.startsWith('#')) {
        if (h.length > 1 && !(await page.locator(h).count())) {
          bad++;
          report(false, `${path}: ancla rota ${h} ("${l.text}")`);
        }
      } else if (h.startsWith('/')) {
        const [p, hash] = h.split('#');
        const r = await page.request.get(SITE + (p || '/'));
        if (r.status() !== 200) {
          bad++;
          report(false, `${path}: ${h} responde ${r.status()}`);
        } else if (hash && !(await r.text()).includes(`id="${hash}"`)) {
          bad++;
          report(false, `${path}: ancla rota ${h}`);
        }
      } else if (!(ALLOWED_OUT[path] ?? []).some((re) => re.test(h))) {
        bad++;
        report(false, `${path}: salida de la web no permitida ${h}`);
      }
    }
    for (const bt of items.buttons)
      if (!bt.name) {
        bad++;
        report(false, `${path}: botón sin nombre accesible`);
      }
    report(
      bad === 0,
      `${path} (${res.status()}): ${items.links.length} enlaces y ${items.buttons.length} botones revisados`,
    );
  }
  await b.close();
}

// ---------- F) Fugas: nada que saque de la landing antes de enviar ----------
const outLinks = (page) =>
  page.evaluate(() => {
    const out = [];
    const check = (url, what) => {
      const u = (url ?? '').trim();
      if (!u || u.startsWith('#')) return;
      let parsed = null;
      try {
        parsed = new URL(u, location.href);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.origin !== location.origin) out.push(`${what} ${u}`);
    };
    document
      .querySelectorAll('a[href], area[href]')
      .forEach((a) => check(a.getAttribute('href'), 'enlace'));
    document
      .querySelectorAll('form[action]')
      .forEach((f) => check(f.getAttribute('action'), 'formulario'));
    document.querySelectorAll('iframe[src]').forEach((f) => {
      const src = f.getAttribute('src');
      if (!(f.closest('[data-vsl]') && src.startsWith('https://www.youtube-nocookie.com/embed/')))
        check(src, 'iframe');
    });
    return out;
  });
if (PARTS.includes('F')) {
  const b = await chromium.launch();
  for (const [vpName, device] of [
    [
      'Instagram iPhone 390',
      { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IG_IOS },
    ],
    ['escritorio 1440', { viewport: { width: 1440, height: 900 } }],
  ]) {
    for (const js of [true, false]) {
      const ctx = await b.newContext({ ...device, javaScriptEnabled: js, reducedMotion: 'reduce' });
      await ctx.route(/facebook|youtube|ytimg|wa\.me/, (r) => r.abort());
      const page = await ctx.newPage();
      const found = [];
      const collect = async (state) =>
        found.push(...(await outLinks(page)).map((l) => `[${state}] ${l}`));
      await page.goto(SITE + '/', { waitUntil: 'networkidle' });
      await collect(js ? 'banner abierto' : 'sin JS');
      if (js) {
        for (const bt of await page.locator('#faq button[aria-expanded]').all()) await bt.click();
        await collect('FAQ abierto');
        await page.locator('#por-que').scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await collect('barra fija');
        await page.locator('#valoracion').scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: 'Continuar' }).click();
        await collect('error paso 1');
        await page.locator('[data-consent-action="reject"]').click();
        await collect('banner cerrado');
      } else {
        await page.goto(SITE + '/?error=1#valoracion', { waitUntil: 'networkidle' });
        await collect('sin JS, vuelta con error');
      }
      report(
        found.length === 0,
        `Fugas ${vpName} ${js ? 'con JS' : 'sin JS'}: ${found.length ? found.join('; ') : 'ninguna salida de la web'}`,
      );
      await ctx.close();
    }
  }
  await b.close();
}

// ---------- A2) Ningún botón ni enlace tapado por otro (móvil y escritorio, con y sin banner) ----------
if (PARTS.includes('A2'))
  for (const [vpName, vp] of [
    ['móvil 390x844', { width: 390, height: 844, isMobile: true, hasTouch: true }],
    ['móvil 360x640', { width: 360, height: 640, isMobile: true, hasTouch: true }],
    ['escritorio 1440x900', { width: 1440, height: 900 }],
  ]) {
    const b = await chromium.launch();
    for (const banner of [false, true]) {
      const ctx = await b.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: !!vp.isMobile,
        hasTouch: !!vp.hasTouch,
        bypassCSP: true,
        reducedMotion: 'reduce',
      });
      await ctx.route(/facebook|youtube|ytimg/, (r) => r.abort());
      if (!banner)
        await ctx.addInitScript(() =>
          localStorage.setItem(
            'rw_consent',
            JSON.stringify({ v: 1, marketing: false, ts: Date.now() }),
          ),
        );
      const page = await ctx.newPage();
      for (const path of banner
        ? ['/']
        : ['/', '/gracias', '/aviso-legal', '/privacidad', '/cookies', '/no-existe']) {
        await page.goto(SITE + path, { waitUntil: 'networkidle' });
        if (!banner) await page.addStyleTag({ content: '.sticky-cta{display:none!important}' });
        const scope = banner ? '#cookie-banner' : 'body';
        const covered = await page.evaluate(async (scope) => {
          const out = [];
          const els = [
            ...document
              .querySelector(scope)
              .querySelectorAll('a[href], button, summary, label.chip, [role="button"]'),
          ];
          for (const el of els) {
            if (
              el.closest(
                '[inert],[hidden],dialog:not([open]),[aria-hidden="true"],.sr-only,.skip-link,#cookie-banner',
              ) &&
              !(
                scope === '#cookie-banner' &&
                el.closest('#cookie-banner') &&
                !el.closest('[hidden]')
              )
            )
              continue;
            const cs = getComputedStyle(el);
            if (
              cs.visibility === 'hidden' ||
              cs.display === 'none' ||
              el.getClientRects().length === 0
            )
              continue;
            el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            if (r.left < 0 || r.right > innerWidth + 1) continue; // fuera de un carrusel con scroll horizontal
            const pts = [
              [0.5, 0.5],
              [0.2, 0.5],
              [0.8, 0.5],
            ];
            for (const [fx, fy] of pts) {
              const x = r.left + r.width * fx,
                y = r.top + r.height * fy;
              const hit = document.elementFromPoint(x, y);
              if (!hit || el.contains(hit) || hit.contains(el)) continue;
              const label = (el.getAttribute('aria-label') || el.textContent)
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 40);
              const by = (
                hit.closest('a,button,label,summary')?.textContent ||
                hit.className ||
                hit.tagName
              )
                .toString()
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 40);
              const hr = hit.getBoundingClientRect();
              out.push(
                `"${label}" tapado por "${by}" [punto ${Math.round(x)},${Math.round(y)}; el ${Math.round(r.left)}-${Math.round(r.right)}x${Math.round(r.top)}-${Math.round(r.bottom)}; vh ${innerWidth}x${innerHeight} esc ${visualViewport.scale}; tapa ${hit.tagName} ${Math.round(hr.left)}-${Math.round(hr.right)}x${Math.round(hr.top)}-${Math.round(hr.bottom)}]`,
              );
              break;
            }
          }
          return [...new Set(out)];
        }, scope);
        report(
          covered.length === 0,
          `${vpName}${banner ? ' con banner' : ''} ${path}: ${covered.length ? covered.join('; ') : 'ningún botón ni enlace tapado'}`,
        );
      }
      await ctx.close();
    }
    await b.close();
  }

// ---------- B) Comportamiento en la home ----------
const targets = [
  [
    'Chromium móvil 390x844',
    chromium,
    { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    true,
  ],
  ['WebKit iPhone 15', webkit, devices['iPhone 15'], true],
  ['Chromium escritorio 1440x900', chromium, { viewport: { width: 1440, height: 900 } }, false],
];
if (PARTS.includes('B'))
  for (const [name, engine, dev, touch] of targets) {
    console.log(`\n== ${name}`);
    let b;
    try {
      b = await engine.launch();
    } catch {
      console.log(`- ${name}: navegador no instalado, se omite`);
      continue;
    }
    const ctx = await b.newContext({ ...dev });
    await ctx.route(/facebook|youtube|ytimg|wa\.me|instagram|tiktok/, (r) => r.abort());
    await ctx.addInitScript(() =>
      localStorage.setItem(
        'rw_consent',
        JSON.stringify({ v: 1, marketing: false, ts: Date.now() }),
      ),
    );
    const page = await ctx.newPage();
    const press = async (loc) => (touch ? loc.tap() : loc.click());
    await page.goto(SITE + '/', { waitUntil: 'networkidle' });
    const tol = 6;

    // 1) Todos los CTA a #valoracion: la sección del formulario arriba, bajo la cabecera.
    // Enlace "Saltar al formulario" (solo con teclado): Tab + Enter.
    if (!touch) {
      await page.goto(SITE + '/', { waitUntil: 'networkidle' });
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
      await page.keyboard.press('Enter');
      await settle(page);
      const h = await headerH(page);
      const t = await top(page, '#valoracion');
      report(
        focused === 'Saltar al formulario' && Math.abs(t - (h + 12)) <= tol,
        `${name}: "Saltar al formulario" (Tab + Enter) → #valoracion (sección a ${t}px)`,
      );
    }
    const ctas = await page.evaluate(() =>
      [...document.querySelectorAll('a[href="#valoracion"]')].map((a, i) => ({
        i,
        cta: a.dataset.cta || a.textContent.trim().slice(0, 30),
        // "¿Otra duda?" (cierre de "¿Qué te duele?"): va como las tarjetas (más abajo).
        skip: a.classList.contains('skip-link') || a.hasAttribute('data-zona'),
      })),
    );
    for (const { i, cta, skip } of ctas) {
      if (skip) continue;
      await page.goto(SITE + '/', { waitUntil: 'networkidle' });
      const loc = page.locator('a[href="#valoracion"]').nth(i);
      if (cta === 'sticky') {
        await page.evaluate(() => window.scrollTo({ top: 1600, behavior: 'instant' }));
        await page.waitForTimeout(700);
      } else
        await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForTimeout(300);
      if (!(await loc.isVisible())) {
        report(
          !touch || cta !== 'sticky' ? true : false,
          `${name}: CTA ${cta} no visible en este tamaño (se omite)`,
        );
        continue;
      }
      await press(loc);
      await settle(page);
      const h = await headerH(page);
      const t = await top(page, '#valoracion');
      const f = await top(page, '[data-form-root]');
      const vh = await page.evaluate(() => innerHeight);
      const good = Math.abs(t - (h + 12)) <= tol && f < vh;
      report(
        good,
        `${name}: CTA "${cta}" → #valoracion arriba (sección a ${t}px, cabecera ${Math.round(h)}px, formulario a ${f}px de ${vh})`,
      );
    }

    // 2) "Ver el vídeo" → #video
    await page.goto(SITE + '/', { waitUntil: 'networkidle' });
    await press(page.locator('[data-cta="hero_video"]'));
    await settle(page);
    {
      const h = await headerH(page);
      const t = await top(page, '#video');
      report(
        Math.abs(t - (h + 12)) <= tol,
        `${name}: "Ver el vídeo" → #video (sección a ${t}px, cabecera ${Math.round(h)}px)`,
      );
    }

    // 3) Las 8 tarjetas de "¿Qué te duele?": un toque → formulario arriba, zona marcada, paso 2.
    await page.goto(SITE + '/', { waitUntil: 'networkidle' });
    const zonas = await page
      .locator('#zonas .zcard')
      .evaluateAll((els) => els.map((e) => e.dataset.zona));
    zonas.push('enlace Otro');
    for (const item of zonas) {
      const zona = item === 'enlace Otro' ? 'Otro' : item;
      await page
        .locator('#zonas')
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.waitForTimeout(400);
      const card =
        item === 'enlace Otro'
          ? page.locator('#zonas a[data-zona="Otro"]')
          : page.locator(`#zonas .zcard[data-zona="${zona}"]`);
      await card.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForTimeout(250);
      await press(card);
      await settle(page);
      const s = await page.evaluate(() => {
        const t = document
          .querySelector('fieldset[data-step="2"] .step-title')
          .getBoundingClientRect();
        return {
          zona: document.querySelector('input[name="zona"]:checked')?.value,
          step: document.querySelector('[data-progress-text]').textContent,
          title: document.querySelector('fieldset[data-step="2"] .step-title').textContent.trim(),
          titleTop: Math.round(t.top),
          titleBottom: Math.round(t.bottom),
          vh: innerHeight,
        };
      });
      const h = await headerH(page);
      const f = await top(page, '[data-form-root]');
      const good =
        s.zona === zona &&
        s.step === 'Paso 2 de 4' &&
        Math.abs(f - (h + 12)) <= tol &&
        s.titleTop >= h &&
        s.titleBottom <= s.vh;
      report(
        good,
        `${name}: ${item === 'enlace Otro' ? '"¿Otra duda?"' : `tarjeta ${zona}`} (1 ${touch ? 'toque' : 'clic'}) → ${s.step}, zona ${s.zona}, formulario a ${f}px (cabecera ${Math.round(h)}), título "${s.title}" visible`,
      );
    }

    // 4) Configurar cookies, FAQ, testimonios, vídeo, logo.
    await page.goto(SITE + '/', { waitUntil: 'networkidle' });
    const cfg = page.locator('footer [data-open-cookie-settings]');
    await cfg.scrollIntoViewIfNeeded();
    await press(cfg);
    await page.waitForTimeout(400);
    report(
      await page.locator('#cookie-prefs').isVisible(),
      `${name}: "Configurar cookies" abre el panel`,
    );
    await page.locator('[data-consent-action="save"]').click();
    await page.waitForTimeout(300);
    const faqBtns = page.locator('.faq-trigger, [data-faq-trigger], #faq button[aria-expanded]');
    const nFaq = await faqBtns.count();
    let faqOk = 0;
    for (let i = 0; i < nFaq; i++) {
      const bt = faqBtns.nth(i);
      await bt.scrollIntoViewIfNeeded();
      await press(bt);
      await page.waitForTimeout(450);
      const open = await bt.getAttribute('aria-expanded');
      await press(bt);
      await page.waitForTimeout(450);
      const closed = await bt.getAttribute('aria-expanded');
      if (open === 'true' && closed === 'false') faqOk++;
    }
    report(
      nFaq > 0 && faqOk === nFaq,
      `${name}: FAQ ${faqOk}/${nFaq} preguntas se abren y se cierran`,
    );
    const tBtns = page.locator(
      '#opiniones button[aria-haspopup="dialog"], #opiniones [data-dialog-open]',
    );
    const nT = await tBtns.count();
    let tOk = 0;
    let tTried = 0;
    for (let i = 0; i < nT; i++) {
      const bt = tBtns.nth(i);
      if (!(await bt.isVisible())) continue;
      await bt.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForTimeout(200);
      const inView = await bt.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth;
      });
      if (!inView) continue; // el carrusel lo ha llevado fuera de la pantalla en este momento
      tTried++;
      // El carrusel se mueve sin parar (se pausa al tocarlo): se pulsa sin esperar a que esté quieto.
      if (touch) await bt.tap({ force: true });
      else await bt.click({ force: true });
      await page.waitForTimeout(400);
      const dlg = page.locator('dialog[open]');
      const opened = await dlg.count();
      if (opened) {
        await press(dlg.locator('button').first());
        await page.waitForTimeout(400);
      }
      if (opened && !(await page.locator('dialog[open]').count())) tOk++;
    }
    report(
      tTried > 0 && tOk === tTried,
      `${name}: testimonios ${tOk}/${tTried} "leer completo" (los que estaban a la vista) abren y cierran`,
    );
    await page.locator('[data-vsl-play]').scrollIntoViewIfNeeded();
    await press(page.locator('[data-vsl-play]'));
    await page.waitForTimeout(400);
    report(
      (await page.locator('#video iframe').count()) === 1,
      `${name}: play del vídeo inserta el reproductor`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await press(page.locator('.header-brand'));
    await page.waitForLoadState('domcontentloaded');
    report(new URL(page.url()).pathname === '/', `${name}: logo de la cabecera → inicio`);

    // 5) Entre páginas: cabecera de una legal y enlaces de /gracias.
    for (const [from, sel, expect] of [
      ['/aviso-legal', '.header-cta', '#valoracion'],
      ['/gracias', 'a.thanks-link[href="/#valoracion"]', '#valoracion'],
      ['/gracias', 'a.thanks-link[href="/#video"]', '#video'],
    ]) {
      await page.goto(SITE + from, { waitUntil: 'networkidle' });
      await press(page.locator(sel).first());
      await page.waitForURL(new RegExp(`${expect}$`));
      await page.waitForLoadState('networkidle');
      await settle(page);
      const h = await headerH(page);
      const t = await top(page, expect);
      report(
        Math.abs(t - (h + 12)) <= tol,
        `${name}: ${from} "${sel}" → ${expect} arriba (sección a ${t}px, cabecera ${Math.round(h)}px)`,
      );
    }
    await b.close();
  }
server.kill();
console.log(`\n${ok.length} correctas, ${problems.length} con problema`);
if (problems.length) {
  console.log('\nPROBLEMAS:\n' + problems.join('\n'));
  process.exit(1);
}
