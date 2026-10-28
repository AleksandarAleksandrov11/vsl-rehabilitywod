/**
 * Identificadores y envíos de eventos de Meta compartidos por el Pixel (pixel.ts), el arranque
 * (boot.ts) y el formulario (form.ts), para que Meta vea las visitas aunque no se acepten las
 * cookies (API de conversiones por /api/event-capi) sin contarlas dos veces:
 * - pageViewId: event_id del PageView de esta carga de página, el mismo en el servidor y en el
 *   Pixel (también si las cookies se aceptan después: su PageView sale con este event_id).
 * - viewContentId(): event_id del ViewContent, uno por sesión (sessionStorage rw_vc_id).
 * - getFbc(): la cookie _fbc o, si no existe, el fbc guardado al aterrizar con el fbclid (utm.ts).
 * - beacon(): sendBeacon (text/plain) o fetch con keepalive; nunca espera ni bloquea.
 * Sin datos personales ni de salud.
 */
import { getAttribution } from './utm';

export function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** event_id del PageView de esta carga de página. */
export const pageViewId = uuidv4();

export function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  try {
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

/** fbc de Meta: la cookie _fbc o, si no existe, el que se guardó al aterrizar con el fbclid. */
export const getFbc = (): string => readCookie('_fbc') || getAttribution().fbc || '';

let fallbackVcId = '';
/** event_id del ViewContent: uno por sesión. */
export function viewContentId(): string {
  try {
    let id = window.sessionStorage.getItem('rw_vc_id');
    if (!id) {
      id = uuidv4();
      window.sessionStorage.setItem('rw_vc_id', id);
    }
    return id;
  } catch {
    fallbackVcId ||= uuidv4();
    return fallbackVcId;
  }
}

/** POST sin esperar respuesta (text/plain: tipo "simple", que sendBeacon envía en todos lados). */
export function beacon(url: string, payload: unknown): void {
  const body = JSON.stringify(payload);
  const type = 'text/plain;charset=UTF-8';
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type }))) return;
  } catch {
    // sendBeacon no disponible o rechazado: fetch con keepalive
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': type },
    body,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined);
}

/** Visita (PageView o ViewContent) para la API de conversiones. */
export function sendVisit(eventName: 'PageView' | 'ViewContent', eventId: string): void {
  beacon('/api/event-capi', {
    event_name: eventName,
    event_id: eventId,
    event_source_url: `${window.location.origin}${window.location.pathname}`,
    fbc: getFbc(),
    fbp: readCookie('_fbp'),
  });
}

let vcSent = false;
/** ViewContent para la API de conversiones, una vez por sesión (sessionStorage rw_capi_vc). */
export function sendViewContentOnce(): void {
  try {
    if (window.sessionStorage.getItem('rw_capi_vc')) return;
    window.sessionStorage.setItem('rw_capi_vc', '1');
  } catch {
    if (vcSent) return;
  }
  vcSent = true;
  sendVisit('ViewContent', viewContentId());
}
