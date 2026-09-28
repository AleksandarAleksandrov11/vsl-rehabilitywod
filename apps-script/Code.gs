/**
 * RehabilityWOD · Recepción de leads en Google Sheets.
 *
 * La web (/api/lead en Vercel) envía cada solicitud de valoración a esta aplicación web.
 * El script comprueba el secreto, guarda el lead en la hoja "Leads" y avisa por email.
 *
 * Propiedades del script (Configuración del proyecto > Propiedades del script):
 *   LEAD_SECRET   Cadena larga y aleatoria. La misma que la variable LEAD_SECRET de Vercel.
 *   NOTIFY_EMAIL  Correo donde llegan los avisos. Si no existe: info@rehabilitywod.com
 *
 * Instrucciones completas en README-apps-script.md.
 */

var SHEET_NAME = 'Leads';
var DEFAULT_NOTIFY_EMAIL = 'info@rehabilitywod.com';
var TIMEZONE = 'Europe/Madrid';
var DATE_FORMAT = 'dd/MM/yyyy HH:mm';

var HEADERS = [
  'Fecha',
  'Zona',
  'Detalle',
  'Nombre',
  'Teléfono',
  'Estado',
  'Notas',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'Landing',
  'Referrer',
  'Dispositivo',
  'Consent. salud',
  'Consent. marketing',
  'Event ID',
];

var ESTADOS = ['Nuevo', 'Contactado', 'Videollamada agendada', 'Cliente', 'Descartado'];

// Anchos de columna (px) para que la hoja se lea bien desde el primer día.
var COLUMN_WIDTHS = [
  130, 110, 320, 140, 140, 170, 260, 110, 110, 140, 120, 110, 140, 200, 160, 100, 110, 130, 280,
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
    appendLead_(lead);
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
  // Teléfono y Event ID como texto (sin notación científica ni fórmulas).
  sheet.getRange('E:E').setNumberFormat('@');
  sheet.getRange('S:S').setNumberFormat('@');
  sheet.getRange('A:A').setNumberFormat(DATE_FORMAT);
  // Detalle y Notas con ajuste de texto.
  sheet.getRange('C:C').setWrap(true);
  sheet.getRange('G:G').setWrap(true);
  applyEstadoValidation_(sheet);
}

/** Desplegable en la columna Estado (mini-CRM). */
function applyEstadoValidation_(sheet) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ESTADOS, true)
    .setAllowInvalid(false)
    .setHelpText('Estado del lead: ' + ESTADOS.join(', '))
    .build();
  sheet.getRange(2, 6, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

function appendLead_(lead) {
  var sheet = getSheet_();
  var fecha = Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT);
  var row = [
    fecha,
    lead.zona,
    lead.detalle,
    lead.nombre,
    lead.telefono,
    'Nuevo',
    '',
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.utm_content,
    lead.utm_term,
    lead.fbclid,
    lead.landing_url,
    lead.referrer,
    lead.device,
    lead.consentimiento_salud ? 'Sí' : 'No',
    lead.consentimiento_marketing ? 'Sí' : 'No',
    lead.event_id,
  ].map(sanitize_);

  var next = sheet.getLastRow() + 1;
  var range = sheet.getRange(next, 1, 1, row.length);
  // Teléfono y Event ID como texto antes de escribir.
  sheet.getRange(next, 5).setNumberFormat('@');
  sheet.getRange(next, 19).setNumberFormat('@');
  range.setValues([row]);

  // Si la fila cae fuera del rango con validación (hoja crecida), se vuelve a aplicar.
  if (!sheet.getRange(next, 6).getDataValidation()) {
    applyEstadoValidation_(sheet);
  }
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
    'Zona: ' + lead.zona,
    'Detalle: ' + (lead.detalle || '(sin detalle)'),
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
      ['Zona', lead.zona],
      ['Detalle', lead.detalle || '(sin detalle)'],
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
 * instalación: crea la hoja "Leads" si no existe, inserta una fila de prueba y envía el aviso.
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
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    fbclid: '',
    landing_url: 'https://rehabilitywod.com/',
    referrer: '',
    device: 'desktop',
    event_id: Utilities.getUuid(),
  });
  appendLead_(lead);
  notify_(lead, props.getProperty('NOTIFY_EMAIL') || DEFAULT_NOTIFY_EMAIL);
  Logger.log('Fila de prueba añadida en "' + SHEET_NAME + '" y aviso enviado.');
  if (!props.getProperty('LEAD_SECRET')) {
    Logger.log('AVISO: falta la propiedad LEAD_SECRET. Sin ella, la web no podrá guardar leads.');
  }
}
