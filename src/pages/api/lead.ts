/**
 * POST /api/lead (serverless en Vercel).
 * - Acepta JSON (formulario con JS) o application/x-www-form-urlencoded (fallback sin JS).
 * - Valida en servidor lo mismo que el cliente.
 * - Antispam: honeypot relleno o envío en menos de 3 s → 200 {ok:true} sin guardar nada.
 * - Reenvía a Google Apps Script (GOOGLE_SCRIPT_URL) con el secreto LEAD_SECRET. El cuerpo es
 *   siempre el objeto Lead más `secret` (appsScriptBody): un test congela sus claves y tipos.
 * - Modo mock (sin GOOGLE_SCRIPT_URL o LEAD_MOCK=1): log en consola con el teléfono enmascarado.
 * - API de conversiones de Meta (src/lib/capi.ts), para todos los leads:
 *   · con JS, la respuesta lleva `sig` (firma del lead) y el navegador llama a /api/lead-capi;
 *   · sin JS, se envía aquí mismo tras guardar, esperando como mucho 4 s antes de ir a /gracias.
 * Los logs no llevan datos personales (salvo el modo mock, enmascarado).
 */
import type { APIRoute } from 'astro';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GOOGLE_SCRIPT_URL, LEAD_MOCK, LEAD_SECRET } from 'astro:env/server';
import {
  LIMITS,
  MESSAGES,
  TRACKING_KEYS,
  UUID_RE,
  cleanText,
  isZona,
  maskPhone,
  normalizePhone,
  validateDetalle,
  validateNombre,
} from '../../lib/lead';
import { firstTime, sendLeadEvent, signLead } from '../../lib/capi';
import { json, sameOrigin } from '../../lib/http';

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;
const GOOGLE_TIMEOUT_MS = 12000;

type Raw = Record<string, unknown>;

const redirect = (location: string) =>
  new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

const truthy = (v: unknown) => v === true || v === 'true' || v === '1' || v === 'on' || v === 1;

async function readBody(request: Request, isJson: boolean): Promise<Raw | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  if (isJson) {
    const data: unknown = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Raw) : null;
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

/** true = envío demasiado rápido (bot). */
function tooFast(raw: Raw, isJson: boolean): boolean {
  const started = Number(raw.started_at);
  const submitted = Number(raw.submitted_at);
  const hasStarted = Number.isFinite(started) && started > 0;
  if (!hasStarted) return isJson; // el formulario con JS siempre lo envía; sin JS no hay forma de medirlo
  const elapsed =
    Number.isFinite(submitted) && submitted > 0 ? submitted - started : Date.now() - started;
  return elapsed < LIMITS.minFillMs;
}

type Lead = {
  zona: string;
  detalle: string;
  nombre: string;
  telefono: string;
  consentimiento_salud: boolean;
  consentimiento_marketing: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  fbclid: string;
  landing_url: string;
  referrer: string;
  device: string;
  event_id: string;
  started_at: number | null;
};

function buildLead(raw: Raw): { lead?: Lead; fields: string[] } {
  const fields: string[] = [];
  const zona = cleanText(raw.zona, 40);
  const detalle = cleanText(raw.detalle, LIMITS.detalleMax + 1);
  const nombre = cleanText(raw.nombre, LIMITS.nombreMax + 1);
  const telefono = normalizePhone(cleanText(raw.telefono, 30), cleanText(raw.prefijo, 6) || '+34');

  if (!isZona(zona)) fields.push('zona');
  if (!validateDetalle(detalle, zona)) fields.push('detalle');
  if (!validateNombre(nombre)) fields.push('nombre');
  if (!telefono) fields.push('telefono');
  if (!truthy(raw.consentimiento_salud)) fields.push('consentimiento_salud');
  if (fields.length || !telefono) return { fields };

  const tracking = Object.fromEntries(
    TRACKING_KEYS.map((k) => [k, cleanText(raw[k], 200)]),
  ) as Record<(typeof TRACKING_KEYS)[number], string>;

  let landing = cleanText(raw.landing_url, 300);
  try {
    const u = new URL(landing);
    landing = `${u.origin}${u.pathname}`; // sin query
  } catch {
    landing = '';
  }

  const device = cleanText(raw.device, 10);
  const eventId = cleanText(raw.event_id, 36);
  const started = Number(raw.started_at);

  return {
    fields,
    lead: {
      zona,
      detalle,
      nombre,
      telefono,
      consentimiento_salud: true,
      // Solo el booleano true que envía el formulario cuando hay consentimiento de marketing.
      consentimiento_marketing: raw.consentimiento_marketing === true,
      ...tracking,
      landing_url: landing,
      referrer: cleanText(raw.referrer, 300),
      device: ['mobile', 'tablet', 'desktop'].includes(device) ? device : '',
      event_id: UUID_RE.test(eventId) ? eventId : crypto.randomUUID(),
      started_at: Number.isFinite(started) && started > 0 ? started : null,
    },
  };
}

/**
 * Cuerpo que recibe el Apps Script: el Lead y el secreto, nada más. No cambiar: la hoja y el aviso
 * por email dependen de estos campos (lo comprueban `npm run qa` y `npm run qa:sheets`).
 */
const appsScriptBody = (lead: Lead) => ({ ...lead, secret: LEAD_SECRET });

async function sendToGoogle(lead: Lead): Promise<boolean> {
  const url = GOOGLE_SCRIPT_URL;
  if (!url || !LEAD_SECRET) {
    console.error('[lead] Falta GOOGLE_SCRIPT_URL o LEAD_SECRET');
    return false;
  }
  try {
    // Apps Script responde 302 a script.googleusercontent.com: es normal y se sigue.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(appsScriptBody(lead)),
      redirect: 'follow',
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!res.ok || !data?.ok) {
      console.error('[lead] Apps Script no confirmó el guardado', res.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      '[lead] Error al contactar con Apps Script',
      error instanceof Error ? error.name : 'error',
    );
    return false;
  }
}

async function mockSave(lead: Lead): Promise<void> {
  if (process.env.VERCEL_ENV === 'production') {
    console.warn(
      '[lead] MODO MOCK EN PRODUCCIÓN: este lead NO se ha guardado. Configura GOOGLE_SCRIPT_URL y LEAD_SECRET.',
    );
  }
  console.info('[lead:mock]', JSON.stringify({ ...lead, telefono: maskPhone(lead.telefono) }));
  // Solo para el QA local: guarda en un archivo el cuerpo que recibiría el Apps Script (con el
  // secreto tapado), para comprobar sus campos.
  const file = process.env.LEAD_MOCK_FILE;
  if (file) {
    const body = { ...appsScriptBody(lead), secret: LEAD_SECRET ? '[oculto]' : '' };
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(body)}\n`, 'utf8');
  }
}

/** Datos para la API de conversiones en el envío sin JS: el fbclid sale del Referer, si lo hay. */
function capiFromForm(lead: Lead, request: Request) {
  let fbclid = lead.fbclid;
  let source = lead.landing_url;
  try {
    const ref = new URL(request.headers.get('referer') ?? '');
    fbclid ||= ref.searchParams.get('fbclid') ?? '';
    source ||= `${ref.origin}${ref.pathname}`;
  } catch {
    // sin Referer
  }
  return {
    event_id: lead.event_id,
    nombre: lead.nombre,
    telefono: lead.telefono,
    fbclid,
    event_source_url: source,
    consent_marketing: false, // sin JS no hay banner de cookies
  };
}

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const isForm = contentType.includes('application/x-www-form-urlencoded');

  const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    isJson ? json({ ok: false, error, ...extra }, status) : redirect('/?error=1#valoracion');

  if (!isJson && !isForm) return json({ ok: false, error: 'unsupported_media_type' }, 415);
  if (!sameOrigin(request)) return fail(403, 'forbidden_origin');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return fail(413, 'payload_too_large');

  let raw: Raw | null;
  try {
    raw = await readBody(request, isJson);
  } catch {
    return fail(400, 'invalid_body');
  }
  if (!raw) return fail(400, 'invalid_body');

  // Antispam: se responde ok sin guardar nada (y sin firma: no hay Lead para Meta).
  if (cleanText(raw.website, 200) !== '' || tooFast(raw, isJson)) {
    return isJson ? json({ ok: true }) : redirect('/gracias');
  }

  const { lead, fields } = buildLead(raw);
  if (!lead)
    return fail(422, 'validation', {
      fields,
      message: fields.includes('telefono') ? MESSAGES.telefono : undefined,
    });

  const mock = !GOOGLE_SCRIPT_URL || LEAD_MOCK === '1' || LEAD_MOCK === 'true';
  const saved = mock ? await mockSave(lead).then(() => true) : await sendToGoogle(lead);
  if (!saved) return fail(502, 'upstream');

  if (isJson) {
    // El navegador manda el Lead a /api/lead-capi con esta firma (sin secreto configurado, no hay).
    const sig = signLead(lead.event_id, lead.telefono);
    return json(sig ? { ok: true, sig } : { ok: true });
  }
  // Sin JS: el Lead a Meta sale desde aquí antes de ir a /gracias (la llamada a Meta se corta a
  // los 4 s: CAPI_TIMEOUT_MS en src/lib/capi.ts).
  if (firstTime(lead.event_id)) await sendLeadEvent(capiFromForm(lead, request), request);
  return redirect('/gracias');
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8' },
  });
