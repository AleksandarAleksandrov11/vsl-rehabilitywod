/**
 * Utilidades de las rutas /api (solo servidor): respuesta JSON, cookies de la petición y
 * comprobación de origen. Las usan /api/lead, /api/lead-capi y /api/event-capi.
 */
import { CONFIG } from '../config';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export function readCookie(header: string | null, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return '';
      }
    }
  }
  return '';
}

/** El Origin, si lo hay, debe ser esta misma web. */
export function sameOrigin(request: Request): boolean {
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

const isOwnHost = (url: string, request: Request): boolean => {
  try {
    const u = new URL(url);
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
    return u.host === host || u.host === new URL(CONFIG.siteUrl).host;
  } catch {
    return false;
  }
};

/**
 * Más estricta que sameOrigin: la petición tiene que decir de dónde viene (Origin o, si el
 * navegador no lo manda, Referer) y tiene que ser esta web.
 */
export function ownOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') return isOwnHost(origin, request);
  const referer = request.headers.get('referer');
  return !!referer && isOwnHost(referer, request);
}
