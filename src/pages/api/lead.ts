/**
 * POST /api/lead (serverless en Vercel).
 * - Acepta JSON (formulario con JS) o application/x-www-form-urlencoded (fallback sin JS).
 * - Valida en servidor lo mismo que el cliente.
 * - Antispam: honeypot relleno o envío en menos de 3 s → 200 {ok:true} sin guardar nada.
 * - Reenvía a Google Apps Script (GOOGLE_SCRIPT_URL) con el secreto LEAD_SECRET.
 * - Modo mock (sin GOOGLE_SCRIPT_URL o LEAD_MOCK=1): log en consola con el teléfono enmascarado.
 * - Conversions API de Meta opcional (META_CAPI_TOKEN) y solo con consentimiento de marketing.
 * Los logs no llevan datos personales (salvo el modo mock, enmascarado).
 */
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GOOGLE_SCRIPT_URL, LEAD_MOCK, LEAD_SECRET, META_CAPI_TOKEN } from 'astro:env/server';
import {
  LIMITS,
  MESSAGES,
  TRACKING_KEYS,
  cleanText,
  isZona,
  maskPhone,
  normalizePhone,
  validateDetalle,
  validateNombre,
} from '../../lib/lead';
import { CONFIG } from '../../config';

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;
const GOOGLE_TIMEOUT_MS = 8000;
const CAPI_TIMEOUT_MS = 4000;
const META_GRAPH_VERSION = 'v24.0';

type Raw = Record<string, unknown>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const redirect = (location: string) =>
  new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

const truthy = (v: unknown) => v === true || v === 'true' || v === '1' || v === 'on' || v === 1;

function readCookie(header: string | null, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return true; // navegadores antiguos o peticiones sin Origin
  try {
    const o = new URL(origin);
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
    return o.host === host || o.host === new URL(CONFIG.siteUrl).host;
  } catch {
    return false;
  }
}

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

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

async function sendCapi(lead: Lead, request: Request, clientAddress: string | undefined) {
  const token = META_CAPI_TOKEN;
  const pixelId = String(import.meta.env.PUBLIC_META_PIXEL_ID ?? CONFIG.pixelId);
  if (!token || !pixelId || !lead.consentimiento_marketing) return;

  const cookies = request.headers.get('cookie');
  const fbp = readCookie(cookies, '_fbp');
  let fbc = readCookie(cookies, '_fbc');
  if (!fbc && lead.fbclid) fbc = `fb.1.${lead.started_at ?? Date.now()}.${lead.fbclid}`;

  // Nunca la zona ni el detalle: solo lo necesario para atribuir el evento.
  const userData: Record<string, unknown> = {
    ph: [sha256(lead.telefono.replace(/\D/g, ''))],
    client_user_agent: request.headers.get('user-agent') ?? undefined,
    client_ip_address:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || undefined,
  };
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.event_id,
        event_source_url: lead.landing_url || CONFIG.siteUrl,
        action_source: 'website',
        user_data: userData,
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CAPI_TIMEOUT_MS),
      },
    );
    if (!res.ok) console.warn('[lead] CAPI respondió', res.status);
  } catch (error) {
    console.warn('[lead] CAPI no disponible', error instanceof Error ? error.name : 'error');
  }
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      consentimiento_marketing: truthy(raw.consentimiento_marketing),
      ...tracking,
      landing_url: landing,
      referrer: cleanText(raw.referrer, 300),
      device: ['mobile', 'tablet', 'desktop'].includes(device) ? device : '',
      event_id: UUID_RE.test(eventId) ? eventId : crypto.randomUUID(),
      started_at: Number.isFinite(started) && started > 0 ? started : null,
    },
  };
}

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
      body: JSON.stringify({ ...lead, secret: LEAD_SECRET }),
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
  // Solo para el QA local: guarda el lead completo en un archivo si se indica.
  const file = process.env.LEAD_MOCK_FILE;
  if (file) {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(lead)}\n`, 'utf8');
  }
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
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

  const ok = () => (isJson ? json({ ok: true }) : redirect('/gracias'));

  // Antispam: se responde ok sin guardar nada.
  if (cleanText(raw.website, 200) !== '' || tooFast(raw, isJson)) return ok();

  const { lead, fields } = buildLead(raw);
  if (!lead)
    return fail(422, 'validation', {
      fields,
      message: fields.includes('telefono') ? MESSAGES.telefono : undefined,
    });

  const mock = !GOOGLE_SCRIPT_URL || LEAD_MOCK === '1' || LEAD_MOCK === 'true';
  if (mock) {
    await mockSave(lead);
  } else {
    const saved = await sendToGoogle(lead);
    if (!saved) return fail(502, 'upstream');
  }

  await sendCapi(lead, request, clientAddress);
  return ok();
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8' },
  });
