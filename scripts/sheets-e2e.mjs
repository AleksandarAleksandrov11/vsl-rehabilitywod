/**
 * node scripts/sheets-e2e.mjs
 * Prueba de extremo a extremo del envío a Google Sheets sin cuenta de Google:
 * 1. Carga apps-script/Code.gs (el mismo archivo que se pega en Apps Script) en Node con una
 *    simulación de SpreadsheetApp, MailApp, etc., y lo sirve como la URL /exec del script.
 * 2. Arranca la web (build con ASTRO_ADAPTER=node) con GOOGLE_SCRIPT_URL y LEAD_SECRET apuntando
 *    a ese simulador (sin modo mock).
 * 3. Rellena el formulario llegando desde un anuncio de Meta (UTM + fbclid) y comprueba la fila
 *    de la hoja "Leads", la pestaña "Resumen" y el email de aviso. También prueba el envío sin
 *    JavaScript y que un secreto erróneo no escribe nada.
 * 4. Contrato: el cuerpo que recibe el Apps Script tiene exactamente estos campos y tipos (los
 *    del objeto Lead más `secret`). Si alguien añade o quita uno, falla.
 * Requiere un build previo: ASTRO_ADAPTER=node npx astro build
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from '@playwright/test';

const GAS_PORT = 4390;
const SITE_PORT = 4391;
const SECRET = 'prueba-secreto-e2e-0123456789abcdef0123456789';
const SITE = `http://127.0.0.1:${SITE_PORT}`;

/* ------------------------------------------------------------------ */
/* Simulación mínima de Google Sheets / Apps Script                   */
/* ------------------------------------------------------------------ */

const colToNum = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
function parseA1(a1) {
  const m = /^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(a1);
  if (!m) throw new Error(`A1 no soportado: ${a1}`);
  const c1 = colToNum(m[1]);
  const r1 = m[2] ? Number(m[2]) : 1;
  const c2 = m[3] ? colToNum(m[3]) : c1;
  const r2 = m[4] ? Number(m[4]) : m[3] ? r1 : m[2] ? r1 : 1000;
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
}

/** En una hoja en español los argumentos se separan con ";"; en una en inglés, con ",". */
function formulaOk(formula, locale) {
  const outside = formula.replace(/"[^"]*"/g, '""');
  return /^es/.test(locale ?? '') ? !outside.includes(',') : !outside.includes(';');
}

class Range {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  setValues(values) {
    values.forEach((r, i) => r.forEach((v, j) => this.sheet.set(this.row + i, this.col + j, v)));
    return this;
  }
  setValue(v) {
    this.sheet.set(this.row, this.col, v);
    return this;
  }
  copyTo() {
    this.sheet.copied += 1;
    return this;
  }
  setFormula(f) {
    this.sheet.set(this.row, this.col, f);
    return this;
  }
  getValue() {
    const v = this.sheet.get(this.row, this.col);
    if (typeof v === 'string' && v.startsWith('=')) {
      return formulaOk(v, this.sheet.ss.locale) ? 3 : '#ERROR!';
    }
    return v;
  }
  clear() {
    this.sheet.cells.delete(`${this.row}:${this.col}`);
    return this;
  }
  setNumberFormat(fmt) {
    for (let i = 0; i < this.rows; i++) this.sheet.formats.set(`${this.row + i}:${this.col}`, fmt);
    return this;
  }
  setDataValidation(rule) {
    for (let i = 0; i < this.rows; i++) this.sheet.validation.set(this.row + i, rule);
    return this;
  }
  getDataValidation() {
    return this.sheet.validation.get(this.row) ?? null;
  }
  offset(r, c) {
    return new Range(this.sheet, this.row + r, this.col + c, 1, 1);
  }
}
for (const m of [
  'setFontWeight',
  'setBackground',
  'setFontColor',
  'setVerticalAlignment',
  'setWrap',
  'setFontSize',
]) {
  Range.prototype[m] = function () {
    return this;
  };
}

class Sheet {
  constructor(ss, name) {
    this.ss = ss;
    this.name = name;
    this.cells = new Map();
    this.formats = new Map();
    this.validation = new Map();
    this.conditional = [];
    this.maxCols = 26;
    this.copied = 0;
    this.widths = new Map();
  }
  set(r, c, v) {
    this.cells.set(`${r}:${c}`, v);
  }
  get(r, c) {
    return this.cells.get(`${r}:${c}`) ?? '';
  }
  getLastRow() {
    let last = 0;
    for (const [k, v] of this.cells)
      if (v !== '' && v !== null) last = Math.max(last, Number(k.split(':')[0]));
    return last;
  }
  getMaxRows() {
    return 1000;
  }
  getMaxColumns() {
    return this.maxCols;
  }
  insertColumnsAfter(after, n) {
    this.maxCols = Math.max(this.maxCols, after + n);
  }
  setColumnWidth(c, w) {
    this.widths.set(c, w);
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return new Range(this, ...parseA1(a));
    return new Range(this, a, b, c ?? 1, d ?? 1);
  }
  row(r, width) {
    return Array.from({ length: width }, (_, i) => this.get(r, i + 1));
  }
  getParent() {
    return this.ss;
  }
  clear() {
    this.cells.clear();
  }
  setConditionalFormatRules(rules) {
    this.conditional = rules;
  }
}
for (const m of ['setFrozenRows', 'setRowHeight']) Sheet.prototype[m] = () => {};

const builder = (kind) => {
  const spec = { kind };
  const b = new Proxy(
    {},
    {
      get: (_, prop) =>
        prop === 'build'
          ? () => spec
          : (...args) => {
              spec[prop] = args;
              return b;
            },
    },
  );
  return b;
};

function makeGoogle(props) {
  const ss = {
    sheets: new Map(),
    getSheetByName: (n) => ss.sheets.get(n) ?? null,
    insertSheet: (n) => {
      const s = new Sheet(ss, n);
      ss.sheets.set(n, s);
      return s;
    },
    setSpreadsheetTimeZone: (tz) => (ss.tz = tz),
    setSpreadsheetLocale: (l) => (ss.locale = l),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/SIMULADA',
  };
  const mails = [];
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newDataValidation: () => builder('validation'),
      newConditionalFormatRule: () => builder('conditional'),
      CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT' },
      flush() {},
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => ({
        content,
        setMimeType() {
          return this;
        },
      }),
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d) => d.toISOString() },
    Logger: { log: () => {} },
    console,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('apps-script/Code.gs', 'utf8'), context, { filename: 'Code.gs' });
  return { context, ss, mails };
}

/* ------------------------------------------------------------------ */
/* Prueba                                                             */
/* ------------------------------------------------------------------ */

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
};

/** Contrato con el Apps Script: claves y tipos exactos del cuerpo (ver src/pages/api/lead.ts). */
const CONTRACT = {
  zona: 'string',
  detalle: 'string',
  nombre: 'string',
  telefono: 'string',
  entrena_crossfit: 'string',
  consentimiento_salud: 'true',
  consentimiento_marketing: 'boolean',
  utm_source: 'string',
  utm_medium: 'string',
  utm_campaign: 'string',
  utm_content: 'string',
  utm_term: 'string',
  fbclid: 'string',
  landing_url: 'string',
  referrer: 'string',
  device: 'string',
  event_id: 'string',
  started_at: 'number|null',
  secret: 'string',
};
const ENTRENA = [
  'Sí, entreno CrossFit',
  'Entreno otra cosa (fuerza, gimnasio...)',
  'Ahora mismo no entreno',
];
const ZONAS = [
  'Hombro',
  'Codo',
  'Muñeca',
  'Espalda / lumbar',
  'Cadera',
  'Rodilla',
  'Tobillo / pie',
  'Otro',
];
function contractProblems(body) {
  const out = [];
  const keys = Object.keys(body);
  const expected = Object.keys(CONTRACT);
  const extra = keys.filter((k) => !expected.includes(k));
  const missing = expected.filter((k) => !keys.includes(k));
  if (extra.length) out.push(`de más: ${extra.join(', ')}`);
  if (missing.length) out.push(`faltan: ${missing.join(', ')}`);
  for (const [k, type] of Object.entries(CONTRACT)) {
    const v = body[k];
    const ok =
      type === 'true'
        ? v === true
        : type === 'number|null'
          ? v === null || typeof v === 'number'
          : typeof v === type;
    if (!ok) out.push(`${k} no es ${type}`);
  }
  if (!ZONAS.includes(body.zona)) out.push(`zona ${body.zona}`);
  if (!ENTRENA.includes(body.entrena_crossfit))
    out.push(`entrena_crossfit ${body.entrena_crossfit}`);
  if (!['mobile', 'tablet', 'desktop', ''].includes(body.device)) out.push(`device ${body.device}`);
  return out;
}
const bodies = [];

const gas = makeGoogle({ LEAD_SECRET: SECRET, NOTIFY_EMAIL: 'avisos@example.com' });
const gasServer = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST') {
      try {
        bodies.push(JSON.parse(body));
      } catch {
        bodies.push(null);
      }
    }
    const out =
      req.method === 'POST'
        ? gas.context.doPost({ postData: { contents: body } })
        : gas.context.doGet();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(out.content);
  });
});
await new Promise((r) => gasServer.listen(GAS_PORT, '127.0.0.1', r));

const site = spawn('node', ['scripts/qa-server.mjs'], {
  env: {
    ...process.env,
    PORT: String(SITE_PORT),
    LEAD_MOCK: '0',
    GOOGLE_SCRIPT_URL: `http://127.0.0.1:${GAS_PORT}/exec`,
    LEAD_SECRET: SECRET,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let siteLog = '';
site.stdout.on('data', (d) => (siteLog += d));
site.stderr.on('data', (d) => (siteLog += d));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(SITE)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch();
try {
  const leads = () => gas.ss.getSheetByName('Leads');
  const HEADERS = vm.runInContext('HEADERS', gas.context);
  const EXPECTED_HEADERS = [
    'Fecha y hora',
    'Nombre',
    'Teléfono',
    'Zona de dolor',
    'Qué le pasa',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ];
  check(
    'Las 10 primeras columnas son las pedidas',
    JSON.stringify(HEADERS.slice(0, 10)) === JSON.stringify(EXPECTED_HEADERS),
    HEADERS.slice(0, 10).join(' | '),
  );
  check(
    'No se guardan fbclid ni referrer',
    !HEADERS.some((h) => /fbclid|referrer/i.test(h)),
    `${HEADERS.length} columnas`,
  );

  // 1) Llegada desde un anuncio de Meta y envío con JavaScript.
  const utm = {
    utm_source: 'ig',
    utm_medium: 'paid_social',
    utm_campaign: 'Valoracion Octubre',
    utm_content: 'Video Gerard 01',
    utm_term: 'Crossfit 25-45',
    fbclid: 'IwAR0prueba123',
  };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('rw_consent', JSON.stringify({ v: 1, marketing: false, ts: Date.now() }));
  });
  // Tras enviar, la gracias abre WhatsApp en móvil: se responde en local.
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ body: 'WhatsApp (QA)' }));
  const page = await ctx.newPage();
  await page.goto(`${SITE}/?${new URLSearchParams(utm)}`, { waitUntil: 'networkidle' });
  // Navega por la página (la atribución se guarda en la primera visita de la sesión).
  await page.goto(`${SITE}/#valoracion`, { waitUntil: 'networkidle' });
  await page
    .locator('#lead-form label.chip')
    .filter({ has: page.locator('input[value="Rodilla"]') })
    .click();
  await page.locator('#detalle').fill('Me duele la rodilla en los squats desde hace 3 meses.');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#nombre').fill('Laura');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#telefono').fill('633 417 829');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#s5-title').waitFor();
  await page.waitForTimeout(400);
  await page.locator('#consentimiento_salud').check();
  // Pregunta de filtro: justo antes del botón de envío.
  await page.locator('label.choice', { hasText: 'Entreno otra cosa' }).click();
  // Tiempo humano: el antispam descarta los envíos de menos de 3 s.
  await page.waitForTimeout(3200);
  await page.locator('[data-submit]').click();
  const thanks = await page
    .locator('[data-form-done]')
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('Tras enviar, la gracias sale en la tarjeta del formulario', thanks);
  const jsBody = bodies.at(-1);
  const jsProblems = jsBody ? contractProblems(jsBody) : ['sin cuerpo'];
  check(
    'Contrato (con JS): el Apps Script recibe exactamente sus campos y tipos',
    jsProblems.length === 0 && jsBody.secret === SECRET,
    jsProblems.join('; ') || `${Object.keys(jsBody).length} campos`,
  );

  const sheet = leads();
  const row = sheet ? sheet.row(2, HEADERS.length) : [];
  const byHeader = Object.fromEntries(HEADERS.map((h, i) => [h, row[i]]));
  check(
    'Se crea la hoja "Leads" con la cabecera',
    !!sheet && sheet.row(1, HEADERS.length).join() === HEADERS.join(),
  );
  check(
    'Fecha y hora es una fecha real',
    byHeader['Fecha y hora'] instanceof Date ||
      Object.prototype.toString.call(byHeader['Fecha y hora']) === '[object Date]',
    String(byHeader['Fecha y hora']),
  );
  check('Nombre', byHeader['Nombre'] === 'Laura', byHeader['Nombre']);
  check(
    'Teléfono en formato internacional (como texto)',
    byHeader['Teléfono'] === "'+34633417829",
    byHeader['Teléfono'],
  );
  check('Zona de dolor', byHeader['Zona de dolor'] === 'Rodilla', byHeader['Zona de dolor']);
  check(
    'Qué le pasa',
    byHeader['Qué le pasa'] === 'Me duele la rodilla en los squats desde hace 3 meses.',
  );
  for (const [k, v] of Object.entries(utm)) {
    if (k === 'fbclid') continue;
    check(k, byHeader[k] === v, byHeader[k]);
  }
  check('Estado empieza en «Nuevo»', byHeader['Estado'] === 'Nuevo');
  check(
    'Nueva columna final «Entrena CrossFit» con la respuesta',
    HEADERS.at(-1) === 'Entrena CrossFit' &&
      byHeader['Entrena CrossFit'] === 'Entreno otra cosa (fuerza, gimnasio...)',
    byHeader['Entrena CrossFit'],
  );
  check(
    'Son 18 columnas: A-Q como antes y R nueva',
    HEADERS.length === 18 && HEADERS[16] === 'Event ID',
  );
  check('Consentimiento de salud registrado', byHeader['Consent. salud'] === 'Sí');
  check(
    'Event ID (el mismo que el Lead del Pixel)',
    /^[0-9a-f-]{36}$/.test(byHeader['Event ID']),
    byHeader['Event ID'],
  );
  check('Landing sin parámetros', byHeader['Landing'] === `${SITE}/`, byHeader['Landing']);
  check(
    'Desplegable de Estado y colores',
    !!sheet?.validation.get(2) && sheet.conditional.length === 5,
  );

  const summary = gas.ss.getSheetByName('Resumen');
  const formulas = summary
    ? [...summary.cells.values()].filter((v) => String(v).startsWith('='))
    : [];
  check('Pestaña "Resumen" con sus fórmulas', formulas.length === 8, `${formulas.length} fórmulas`);
  check(
    'Todas las fórmulas del Resumen son válidas en una hoja en español (sin #ERROR!)',
    formulas.every((f) => formulaOk(f, gas.ss.locale)) && formulas.some((f) => f.includes(';')),
    gas.ss.locale,
  );
  check(
    'Resumen por campaña usa la columna utm_campaign (H)',
    formulas.some((f) => f.includes('select H, count(A)') && f.includes("label H 'Campaña'")),
  );

  const mail = gas.mails.at(-1);
  check(
    'El email de aviso incluye la respuesta (texto y HTML)',
    !!mail &&
      mail.body.includes('Entrena CrossFit: Entreno otra cosa (fuerza, gimnasio...)') &&
      mail.htmlBody.includes('Entrena CrossFit') &&
      mail.htmlBody.includes('Entreno otra cosa (fuerza, gimnasio...)'),
  );
  check(
    'Email de aviso con nombre y zona',
    !!mail && mail.subject === 'Nuevo lead: Laura · Rodilla' && mail.to === 'avisos@example.com',
    mail?.subject,
  );

  // 2) Formulario sin JavaScript (envío clásico).
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const p2 = await nojs.newPage();
  await p2.goto(`${SITE}/?utm_source=fb&utm_campaign=SinJS`, { waitUntil: 'load' });
  await p2.locator('#lead-form input[value="Hombro"]').check({ force: true });
  await p2.locator('#nombre').fill('Pau');
  await p2.locator('#telefono').fill('+34 699 111 222');
  await p2.locator('#consentimiento_salud').check({ force: true });
  await p2
    .locator('#lead-form input[name="entrena_crossfit"][value="Ahora mismo no entreno"]')
    .check({ force: true });
  await p2.locator('[data-submit]').click();
  await p2.waitForURL(/\/gracias/, { timeout: 15000 });
  const nojsBody = bodies.at(-1);
  const nojsProblems = nojsBody ? contractProblems(nojsBody) : ['sin cuerpo'];
  check(
    'Contrato (sin JS): el Apps Script recibe exactamente sus campos y tipos',
    nojsProblems.length === 0 && nojsBody.secret === SECRET && nojsBody.started_at === null,
    nojsProblems.join('; ') || `${Object.keys(nojsBody).length} campos`,
  );
  const row3 = leads().row(3, HEADERS.length);
  check(
    'Sin JavaScript también guarda la fila',
    row3[1] === 'Pau' && row3[3] === 'Hombro' && row3[17] === 'Ahora mismo no entreno',
    `${row3[1]} · ${row3[3]} · ${row3[17]}`,
  );

  // 2b) La API exige la respuesta: sin ella o con un valor raro no se guarda nada.
  const countBefore = leads().getLastRow();
  const apiLead = (extra) => ({
    zona: 'Codo',
    detalle: '',
    nombre: 'Api Filtro',
    telefono: '633417829',
    consentimiento_salud: true,
    started_at: Date.now() - 10000,
    submitted_at: Date.now(),
    ...extra,
  });
  const post = (body) =>
    fetch(`${SITE}/api/lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SITE },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
  const sinCampo = await post(apiLead({}));
  const raro = await post(apiLead({ entrena_crossfit: 'Quizá' }));
  check(
    'La API rechaza el envío sin la respuesta o con un valor que no es una opción (422)',
    sinCampo.status === 422 &&
      sinCampo.json.fields.includes('entrena_crossfit') &&
      raro.status === 422 &&
      leads().getLastRow() === countBefore,
    `${sinCampo.status} / ${raro.status}`,
  );
  const buena = await post(apiLead({ entrena_crossfit: ENTRENA[0] }));
  check(
    'Con una opción válida, la API guarda y devuelve ok',
    buena.status === 200 && buena.json.ok === true && leads().getLastRow() === countBefore + 1,
  );

  // 2c) Hoja que ya existe (17 columnas, con leads): solo se añade el encabezado R; nada más se toca.
  const legacy = makeGoogle({ LEAD_SECRET: SECRET, NOTIFY_EMAIL: 'avisos@example.com' });
  const OLD = HEADERS.slice(0, 17);
  const oldSheet = legacy.ss.insertSheet('Leads');
  oldSheet.maxCols = 17;
  oldSheet.getRange(1, 1, 1, 17).setValues([OLD]);
  const oldRow = (n) =>
    OLD.map((_, i) => (i === 1 ? `Antiguo ${n}` : i === 2 ? `+3460000000${n}` : `v${n}-${i}`));
  oldSheet.getRange(2, 1, 1, 17).setValues([oldRow(1)]);
  oldSheet.getRange(3, 1, 1, 17).setValues([oldRow(2)]);
  const snap = (sh, rows) => rows.map((r) => sh.row(r, 17).join('|'));
  const antes = snap(oldSheet, [1, 2, 3]);
  const send = (g, extra) =>
    g.context.doPost({
      postData: {
        contents: JSON.stringify({
          secret: SECRET,
          nombre: 'Migra',
          zona: 'Codo',
          telefono: '+34633417829',
          consentimiento_salud: true,
          event_id: crypto.randomUUID(),
          ...extra,
        }),
      },
    });
  const r1 = JSON.parse(send(legacy, { entrena_crossfit: ENTRENA[0] }).content);
  check(
    'Hoja existente: el lead se guarda, R1 pasa a «Entrena CrossFit» y R4 lleva la respuesta',
    r1.ok === true &&
      oldSheet.get(1, 18) === 'Entrena CrossFit' &&
      oldSheet.get(4, 18) === ENTRENA[0] &&
      oldSheet.get(4, 2) === 'Migra',
  );
  check(
    'Hoja existente: columnas A-Q y leads anteriores intactos; sus celdas de R siguen vacías',
    JSON.stringify(snap(oldSheet, [1, 2, 3])) === JSON.stringify(antes) &&
      oldSheet.get(2, 18) === '' &&
      oldSheet.get(3, 18) === '' &&
      oldSheet.maxCols >= 18,
  );
  const dos = JSON.parse(send(legacy, { entrena_crossfit: ENTRENA[2] }).content);
  check(
    'Hoja existente: el encabezado se añade una sola vez y el segundo lead va a la fila 5',
    dos.ok === true && oldSheet.get(5, 18) === ENTRENA[2] && oldSheet.copied === 1,
  );
  const viejaLanding = JSON.parse(send(legacy, {}).content);
  check(
    'Una landing antigua (sin el campo) sigue guardando; la columna queda vacía',
    viejaLanding.ok === true && oldSheet.get(6, 2) === 'Migra' && oldSheet.get(6, 18) === '',
  );
  const propia = makeGoogle({ LEAD_SECRET: SECRET });
  const hojaR = propia.ss.insertSheet('Leads');
  hojaR.maxCols = 20;
  hojaR.getRange(1, 1, 1, 17).setValues([OLD]);
  hojaR.getRange(1, 18).setValue('Algo mío');
  send(propia, { entrena_crossfit: ENTRENA[1] });
  check('Si R1 ya tiene algo, no se sobrescribe', hojaR.get(1, 18) === 'Algo mío');

  // 3) Secreto incorrecto: el script no escribe nada.
  const before = leads().getLastRow();
  const bad = await fetch(`http://127.0.0.1:${GAS_PORT}/exec`, {
    method: 'POST',
    body: JSON.stringify({ secret: 'otro', nombre: 'X', zona: 'Codo', telefono: '+34600000000' }),
  }).then((r) => r.json());
  check(
    'Con un secreto incorrecto no se guarda nada',
    bad.ok === false && leads().getLastRow() === before,
  );

  // 4) Inyección de fórmulas neutralizada.
  gas.context.doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        nombre: '=HYPERLINK("x")',
        zona: 'Codo',
        telefono: '+34600000001',
        consentimiento_salud: true,
        event_id: crypto.randomUUID(),
      }),
    },
  });
  const inj = leads().row(leads().getLastRow(), 2)[1];
  check(
    'Un nombre que empieza por "=" no se ejecuta como fórmula',
    inj === `'=HYPERLINK("x")`,
    inj,
  );

  await ctx.close();
  await nojs.close();
} finally {
  await browser.close();
  site.kill();
  gasServer.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
if (failed.length) {
  console.log(siteLog.slice(-2000));
  process.exit(1);
}
