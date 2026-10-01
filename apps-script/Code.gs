/**
 * RehabilityWOD · Recepción de leads en Google Sheets.
 *
 * La web (/api/lead en Vercel) envía cada solicitud de valoración a esta aplicación web.
 * El script comprueba el secreto, guarda el lead en la hoja "Leads" y avisa por email.
 * La pestaña "Resumen" cuenta los leads por día, zona de dolor y campaña de Meta.
 *
 * Propiedades del script (Configuración del proyecto > Propiedades del script):
 *   LEAD_SECRET   Cadena larga y aleatoria. La misma que la variable LEAD_SECRET de Vercel.
 *   NOTIFY_EMAIL  Correo donde llegan los avisos. Si no existe: aaswebmarketing@gmail.com
 *
 * Instrucciones completas en README-apps-script.md.
 */

var SHEET_NAME = 'Leads';
var SUMMARY_NAME = 'Resumen';
var DEFAULT_NOTIFY_EMAIL = 'aaswebmarketing@gmail.com';
var TIMEZONE = 'Europe/Madrid';
var DATE_FORMAT = 'dd/MM/yyyy HH:mm';

// Columnas de la hoja "Leads" (A → S). Las 11 primeras son las que se leen a diario:
// cuándo, quién, qué le pasa y de qué anuncio de Meta viene.
var HEADERS = [
  'Fecha y hora', // A
  'Nombre', // B
  'Teléfono', // C
  'Zona de dolor', // D
  'Qué le pasa', // E
  'utm_source', // F
  'utm_medium', // G
  'utm_campaign', // H
  'utm_content', // I
  'utm_term', // J
  'fbclid', // K
  'Estado', // L
  'Notas', // M
  'Landing', // N
  'Referrer', // O
  'Dispositivo', // P
  'Consent. salud', // Q
  'Consent. marketing', // R
  'Event ID', // S
];

// Posición (1-based) de las columnas con formato especial.
var COL = { fecha: 1, telefono: 3, detalle: 5, estado: 12, notas: 13, eventId: 19 };

var ESTADOS = ['Nuevo', 'Contactado', 'Videollamada agendada', 'Cliente', 'Descartado'];
var ESTADO_COLORES = {
  Nuevo: '#FFF4CC',
  Contactado: '#DDEBFF',
  'Videollamada agendada': '#E8DDFF',
  Cliente: '#D1FAE5',
  Descartado: '#EEEEEE',
};

// Anchos de columna (px) para que la hoja se lea bien desde el primer día.
var COLUMN_WIDTHS = [
  135, 140, 140, 130, 320, 110, 110, 160, 160, 140, 140, 170, 240, 200, 160, 100, 110, 130, 280,
];

/* ------------------------------------------------------------------ */
/* Entrada                                                            */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid_json' });
  }

  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('LEAD_SECRET');
  if (!secret || !data || data.secret !== secret) {
    return json_({ ok: false });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    var lead = normalizeLead_(data);
    appendLead_(lead, new Date());
    notify_(lead, props.getProperty('NOTIFY_EMAIL') || DEFAULT_NOTIFY_EMAIL);
    return json_({ ok: true });
  } catch (err) {
    console.error('Error guardando el lead: ' + (err && err.message));
    return json_({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

/** Comprueba que el despliegue responde: abre la URL en el navegador. */
function doGet() {
  return json_({ ok: true, status: 'up' });
}

/* ------------------------------------------------------------------ */
/* Hoja                                                               */
/* ------------------------------------------------------------------ */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME, 0);
    setupSheet_(sheet);
  } else if (sheet.getLastRow() === 0) {
    setupSheet_(sheet);
  }
  if (!ss.getSheetByName(SUMMARY_NAME)) setupSummary_(ss);
  return sheet;
}

function setupSheet_(sheet) {
  // Fechas en hora de Madrid y formato español (la hoja es solo para los leads).
  var ss = sheet.getParent();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  ss.setSpreadsheetLocale('es_ES');
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#0A0A0A')
    .setFontColor('#F5F5F2')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  for (var i = 0; i < COLUMN_WIDTHS.length; i++) {
    sheet.setColumnWidth(i + 1, COLUMN_WIDTHS[i]);
  }
  // Fecha como fecha real (se puede ordenar y filtrar); teléfono y Event ID como texto.
  columnRange_(sheet, COL.fecha).setNumberFormat(DATE_FORMAT);
  columnRange_(sheet, COL.telefono).setNumberFormat('@');
  columnRange_(sheet, COL.eventId).setNumberFormat('@');
  // "Qué le pasa" y Notas con ajuste de texto.
  columnRange_(sheet, COL.detalle).setWrap(true);
  columnRange_(sheet, COL.notas).setWrap(true);
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setVerticalAlignment('top');
  applyEstadoValidation_(sheet);
  applyEstadoColors_(sheet);
}

/** Filas 2 en adelante de una columna. */
function columnRange_(sheet, col) {
  return sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);
}

/** Desplegable en la columna Estado (mini-CRM). */
function applyEstadoValidation_(sheet) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ESTADOS, true)
    .setAllowInvalid(false)
    .setHelpText('Estado del lead: ' + ESTADOS.join(', '))
    .build();
  columnRange_(sheet, COL.estado).setDataValidation(rule);
}

/** Color de fondo según el Estado (se ve de un vistazo qué falta por contactar). */
function applyEstadoColors_(sheet) {
  var range = columnRange_(sheet, COL.estado);
  var rules = ESTADOS.map(function (estado) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(estado)
      .setBackground(ESTADO_COLORES[estado])
      .setRanges([range])
      .build();
  });
  sheet.setConditionalFormatRules(rules);
}

/** Fila de la hoja en el orden de HEADERS. */
function buildRow_(lead, fecha) {
  return [
    fecha,
    lead.nombre,
    lead.telefono,
    lead.zona,
    lead.detalle,
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.utm_content,
    lead.utm_term,
    lead.fbclid,
    'Nuevo',
    '',
    lead.landing_url,
    lead.referrer,
    lead.device,
    lead.consentimiento_salud ? 'Sí' : 'No',
    lead.consentimiento_marketing ? 'Sí' : 'No',
    lead.event_id,
  ].map(sanitize_);
}

function appendLead_(lead, fecha) {
  var sheet = getSheet_();
  var row = buildRow_(lead, fecha);

  var next = sheet.getLastRow() + 1;
  var range = sheet.getRange(next, 1, 1, row.length);
  // Formatos de la fila antes de escribir (por si la hoja ha crecido más allá del formato).
  sheet.getRange(next, COL.fecha).setNumberFormat(DATE_FORMAT);
  sheet.getRange(next, COL.telefono).setNumberFormat('@');
  sheet.getRange(next, COL.eventId).setNumberFormat('@');
  range.setValues([row]);

  // Si la fila cae fuera del rango con validación (hoja crecida), se vuelve a aplicar.
  if (!sheet.getRange(next, COL.estado).getDataValidation()) {
    applyEstadoValidation_(sheet);
    applyEstadoColors_(sheet);
  }
}

/* ------------------------------------------------------------------ */
/* Resumen                                                            */
/* ------------------------------------------------------------------ */

/**
 * Pestaña "Resumen": totales y leads por zona de dolor, campaña, anuncio y origen. Son fórmulas
 * sobre la hoja Leads, así que se actualizan solas. (Las fórmulas van en inglés y con comas:
 * Apps Script las traduce al idioma de la hoja.)
 */
function setupSummary_(ss) {
  var sheet = ss.getSheetByName(SUMMARY_NAME) || ss.insertSheet(SUMMARY_NAME);
  sheet.clear();
  var empty = '"Sin datos todavía"';
  var query = function (col, label) {
    return (
      '=IFERROR(QUERY(Leads!A2:S, "select ' +
      col +
      ', count(A) where A is not null group by ' +
      col +
      ' order by count(A) desc label ' +
      col +
      " '" +
      label +
      "', count(A) 'Leads'\", 0), " +
      empty +
      ')'
    );
  };

  sheet.getRange('A1').setValue('Resumen de leads').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A3:B6').setValues([
    ['Leads totales', '=COUNTA(Leads!A2:A)'],
    ['Leads hoy', '=COUNTIFS(Leads!A2:A, ">="&TODAY(), Leads!A2:A, "<"&(TODAY()+1))'],
    ['Últimos 7 días', '=COUNTIFS(Leads!A2:A, ">="&(TODAY()-6))'],
    ['Pendientes de contactar', '=COUNTIF(Leads!L2:L, "Nuevo")'],
  ]);
  sheet.getRange('A3:A6').setFontWeight('bold');

  var blocks = [
    ['A8', 'Por zona de dolor', 'D', 'Zona de dolor'],
    ['D8', 'Por campaña (utm_campaign)', 'H', 'Campaña'],
    ['G8', 'Por anuncio (utm_content)', 'I', 'Anuncio'],
    ['J8', 'Por origen (utm_source)', 'F', 'Origen'],
  ];
  blocks.forEach(function (b) {
    var head = sheet.getRange(b[0]);
    head.setValue(b[1]).setFontWeight('bold');
    head.offset(1, 0).setFormula(query(b[2], b[3]));
  });
  [1, 4, 7, 10].forEach(function (col) {
    sheet.setColumnWidth(col, 220);
    sheet.setColumnWidth(col + 1, 70);
  });
  sheet.setFrozenRows(1);
}

/* ------------------------------------------------------------------ */
/* Datos                                                              */
/* ------------------------------------------------------------------ */

function str_(value, max) {
  var s = value === null || value === undefined ? '' : String(value);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return max ? s.slice(0, max) : s;
}

function normalizeLead_(d) {
  return {
    zona: str_(d.zona, 40),
    detalle: str_(d.detalle, 500),
    nombre: str_(d.nombre, 60),
    telefono: str_(d.telefono, 20),
    consentimiento_salud: d.consentimiento_salud === true || d.consentimiento_salud === 'true',
    consentimiento_marketing:
      d.consentimiento_marketing === true || d.consentimiento_marketing === 'true',
    utm_source: str_(d.utm_source, 200),
    utm_medium: str_(d.utm_medium, 200),
    utm_campaign: str_(d.utm_campaign, 200),
    utm_content: str_(d.utm_content, 200),
    utm_term: str_(d.utm_term, 200),
    fbclid: str_(d.fbclid, 300),
    landing_url: str_(d.landing_url, 300),
    referrer: str_(d.referrer, 300),
    device: str_(d.device, 10),
    event_id: str_(d.event_id, 36),
  };
}

/**
 * Evita la inyección de fórmulas: si un valor empieza por =, +, - o @ se antepone '.
 * (El teléfono en E.164 empieza por + y queda como texto.)
 */
function sanitize_(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

/* ------------------------------------------------------------------ */
/* Aviso por email                                                    */
/* ------------------------------------------------------------------ */

function notify_(lead, to) {
  var wa = 'https://wa.me/' + lead.telefono.replace(/\D/g, '');
  var subject = 'Nuevo lead: ' + (lead.nombre || 'sin nombre') + ' · ' + (lead.zona || 'sin zona');
  var lines = [
    'Nuevo lead desde la landing de RehabilityWOD.',
    '',
    'Nombre: ' + lead.nombre,
    'Teléfono: ' + lead.telefono,
    'WhatsApp: ' + wa,
    'Zona de dolor: ' + lead.zona,
    'Qué le pasa: ' + (lead.detalle || '(sin detalle)'),
    '',
    'Consentimiento datos de salud: ' + (lead.consentimiento_salud ? 'Sí' : 'No'),
    'Consentimiento marketing: ' + (lead.consentimiento_marketing ? 'Sí' : 'No'),
    '',
    'utm_source: ' + lead.utm_source,
    'utm_medium: ' + lead.utm_medium,
    'utm_campaign: ' + lead.utm_campaign,
    'utm_content: ' + lead.utm_content,
    'utm_term: ' + lead.utm_term,
    'fbclid: ' + lead.fbclid,
    'Landing: ' + lead.landing_url,
    'Referrer: ' + lead.referrer,
    'Dispositivo: ' + lead.device,
    'Event ID: ' + lead.event_id,
    '',
    'Hoja: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ];

  var esc = function (s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">' +
    '<p><strong>Nuevo lead desde la landing de RehabilityWOD.</strong></p>' +
    '<p><a href="' +
    esc(wa) +
    '" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#047857;color:#ffffff;text-decoration:none;font-weight:bold">Escribir por WhatsApp</a></p>' +
    '<table cellpadding="4" style="border-collapse:collapse">' +
    [
      ['Nombre', lead.nombre],
      ['Teléfono', lead.telefono],
      ['Zona de dolor', lead.zona],
      ['Qué le pasa', lead.detalle || '(sin detalle)'],
      ['Consent. salud', lead.consentimiento_salud ? 'Sí' : 'No'],
      ['Consent. marketing', lead.consentimiento_marketing ? 'Sí' : 'No'],
      ['utm_source', lead.utm_source],
      ['utm_medium', lead.utm_medium],
      ['utm_campaign', lead.utm_campaign],
      ['utm_content', lead.utm_content],
      ['utm_term', lead.utm_term],
      ['fbclid', lead.fbclid],
      ['Landing', lead.landing_url],
      ['Referrer', lead.referrer],
      ['Dispositivo', lead.device],
      ['Event ID', lead.event_id],
    ]
      .map(function (r) {
        return (
          '<tr><td style="color:#525252;vertical-align:top">' +
          esc(r[0]) +
          '</td><td>' +
          esc(r[1] || '') +
          '</td></tr>'
        );
      })
      .join('') +
    '</table>' +
    '<p><a href="' +
    esc(SpreadsheetApp.getActiveSpreadsheet().getUrl()) +
    '">Abrir la hoja de leads</a></p></div>';

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: lines.join('\n'),
    htmlBody: html,
    name: 'Landing RehabilityWOD',
  });
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Ejecútala una vez desde el editor (botón "Ejecutar") para dar permisos y comprobar la
 * instalación: crea las hojas "Leads" y "Resumen" si no existen, inserta una fila de prueba y
 * envía el aviso.
 */
function testLead() {
  var props = PropertiesService.getScriptProperties();
  var lead = normalizeLead_({
    zona: 'Hombro',
    detalle: 'PRUEBA: fila de test creada desde el editor de Apps Script.',
    nombre: 'Prueba',
    telefono: '+34600000000',
    consentimiento_salud: true,
    consentimiento_marketing: false,
    utm_source: 'test',
    utm_medium: 'paid_social',
    utm_campaign: 'Prueba campaña',
    utm_content: 'Prueba anuncio',
    utm_term: 'Prueba conjunto',
    fbclid: '',
    landing_url: 'https://rehabilitywod.com/',
    referrer: '',
    device: 'desktop',
    event_id: Utilities.getUuid(),
  });
  appendLead_(lead, new Date());
  notify_(lead, props.getProperty('NOTIFY_EMAIL') || DEFAULT_NOTIFY_EMAIL);
  Logger.log('Fila de prueba añadida en "' + SHEET_NAME + '" y aviso enviado.');
  if (!props.getProperty('LEAD_SECRET')) {
    Logger.log('AVISO: falta la propiedad LEAD_SECRET. Sin ella, la web no podrá guardar leads.');
  }
}
