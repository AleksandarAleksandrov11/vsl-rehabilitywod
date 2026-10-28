/**
 * POST /api/lead-capi (serverless en Vercel): Lead de la API de conversiones de Meta para los
 * envíos con JS. El navegador la llama con sendBeacon (o fetch keepalive) justo después de que
 * /api/lead responda OK, sin esperar la respuesta: la gracias no depende de ella.
 *
 * Cuerpo (JSON, como application/json o text/plain): event_id, nombre, telefono (E.164), fbc, fbp,
 * fbclid, fbclid_ts, event_source_url, consent_marketing y sig. Nunca la zona ni el detalle.
 *
 * Responde 204 si el evento se acepta (sin META_CAPI_TOKEN no se envía nada a Meta), 403 si la
 * firma no cuadra o el origen es otro, 409 si ese event_id ya se envió y 400/413/415 si el cuerpo
 * no vale. La lógica del evento está en src/lib/capi.ts.
 */
import type { APIRoute } from 'astro';
import { firstTime, sendLeadEvent, verifySig } from '../../lib/capi';
import { json, sameOrigin } from '../../lib/http';
import { LIMITS, UUID_RE, cleanText, validateNombre } from '../../lib/lead';

export const prerender = false;

const MAX_BODY_BYTES = 4 * 1024;
const E164_RE = /^\+\d{8,15}$/;

export const POST: APIRoute = async ({ request }) => {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json') && !type.includes('text/plain')) {
    return json({ ok: false, error: 'unsupported_media_type' }, 415);
  }
  if (!sameOrigin(request)) return json({ ok: false, error: 'forbidden_origin' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload_too_large' }, 413);
  }

  let raw: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('body');
    raw = data as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }

  const eventId = cleanText(raw.event_id, 36);
  const telefono = cleanText(raw.telefono, 20);
  const nombre = cleanText(raw.nombre, LIMITS.nombreMax + 1).replace(/\s+/g, ' ');
  if (!UUID_RE.test(eventId) || !E164_RE.test(telefono) || !validateNombre(nombre)) {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  if (!verifySig(eventId, telefono, raw.sig)) {
    return json({ ok: false, error: 'bad_signature' }, 403);
  }
  if (!firstTime(eventId)) return json({ ok: false, error: 'duplicate' }, 409);

  await sendLeadEvent(
    {
      event_id: eventId,
      nombre,
      telefono,
      fbc: cleanText(raw.fbc, 600),
      fbp: cleanText(raw.fbp, 100),
      fbclid: cleanText(raw.fbclid, 500),
      fbclid_ts: Number(raw.fbclid_ts) || null,
      event_source_url: cleanText(raw.event_source_url, 300),
      consent_marketing: raw.consent_marketing === true,
    },
    request,
  );
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8' },
  });
