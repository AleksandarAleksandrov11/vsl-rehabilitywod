/**
 * POST /api/event-capi (serverless en Vercel): visitas a la landing para la API de conversiones de
 * Meta, para que Meta las vea aunque no se acepten las cookies (el Pixel solo se carga con ellas).
 * El navegador la llama con sendBeacon (o fetch keepalive), sin esperar la respuesta:
 * - PageView al cargar la landing;
 * - ViewContent una vez por sesión (al completar el paso 1 si el Pixel está cargado, a la vez que
 *   el del Pixel; si no, al llegar al formulario).
 * Con el Pixel cargado, el event_id es el mismo que el del evento del navegador (Meta deduplica).
 *
 * Cuerpo (JSON, como application/json o text/plain): event_name (solo PageView o ViewContent),
 * event_id, event_source_url, fbc y fbp. Sin datos personales; el evento lleva además el user agent
 * y la IP (src/lib/capi.ts, buildPageEvent).
 *
 * Sin firma (no hay datos del lead): solo acepta peticiones de esta misma web (Origin o Referer),
 * la lista cerrada de eventos y un envío por event_id; los bots evidentes se ignoran (204 sin
 * enviar nada). Responde 204 si se acepta (sin META_CAPI_TOKEN no se envía nada a Meta), 403 si el
 * origen es otro, 409 si ese event_id ya llegó y 400/405/413/415 si la petición no vale.
 */
import type { APIRoute } from 'astro';
import {
  PAGE_EVENTS,
  firstTime,
  isEvidentBot,
  sendPageEvent,
  type PageEventName,
} from '../../lib/capi';
import { json, ownOrigin } from '../../lib/http';
import { UUID_RE, cleanText } from '../../lib/lead';

export const prerender = false;

const MAX_BODY_BYTES = 2 * 1024;
const noContent = () =>
  new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json') && !type.includes('text/plain')) {
    return json({ ok: false, error: 'unsupported_media_type' }, 415);
  }
  if (!ownOrigin(request)) return json({ ok: false, error: 'forbidden_origin' }, 403);
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

  const name = cleanText(raw.event_name, 20);
  const eventId = cleanText(raw.event_id, 36);
  if (!(PAGE_EVENTS as readonly string[]).includes(name) || !UUID_RE.test(eventId)) {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  if (isEvidentBot(request)) return noContent();
  if (!firstTime(eventId)) return json({ ok: false, error: 'duplicate' }, 409);

  await sendPageEvent(
    {
      event_name: name as PageEventName,
      event_id: eventId,
      event_source_url: cleanText(raw.event_source_url, 300),
      fbc: cleanText(raw.fbc, 600),
      fbp: cleanText(raw.fbp, 100),
    },
    request,
  );
  return noContent();
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8' },
  });
