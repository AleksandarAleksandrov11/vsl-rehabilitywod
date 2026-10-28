/**
 * Meta Pixel cargado de forma programática y SOLO con consentimiento de marketing.
 * Sin <noscript>: la imagen de fallback dispara un PageView sin consentimiento.
 * Nunca se envían datos de salud (zona, detalle). Nombre y teléfono solo en el Lead, como advanced
 * matching manual y ya cifrados en SHA-256 en el navegador (trackLead).
 * Eventos y parámetros cerrados: ver AllowedEvent y SafeParams. El PageView y el ViewContent
 * llevan el mismo event_id que los que se mandan a la API de conversiones (meta-events.ts).
 */
import { hasMarketingConsent } from './consent';
import { getAttribution } from './utm';
import { pageViewId, readCookie } from './meta-events';

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: FbqFn;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

const FBEVENTS_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

let initialized = false;
let revoked = false;

/** Equivalente al snippet base de Meta, sin script en línea (compatible con la CSP). */
function installSnippet(): void {
  if (window.fbq) return;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as FbqFn;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const t = document.createElement('script');
  t.async = true;
  t.src = FBEVENTS_SRC;
  const s = document.getElementsByTagName('script')[0];
  if (s?.parentNode) s.parentNode.insertBefore(t, s);
  else document.head.appendChild(t);
}

export function getPixelId(): string {
  return document.documentElement.dataset.pixelId ?? '';
}

const FBC_MAX_AGE = 90 * 24 * 60 * 60; // 90 días, como la cookie de Meta

/**
 * Guarda el fbclid del anuncio en la cookie _fbc (formato de Meta: fb.1.<ms>.<fbclid>) para que el
 * Pixel y la API de conversiones lo usen aunque la persona ya no esté en la URL del anuncio.
 * Se escribe en el dominio principal (como hace Meta) y solo con consentimiento de marketing.
 */
function storeFbc(): void {
  const attribution = getAttribution();
  const fbclid = attribution.fbclid.trim();
  if (!fbclid || !/^[\w-]{6,500}$/.test(fbclid)) return;
  const current = readCookie('_fbc');
  if (current.endsWith(`.${fbclid}`)) return;
  // El mismo fbc que se guardó al aterrizar (y que ya ha recibido la API de conversiones).
  const value = attribution.fbc || `fb.1.${attribution.fbclid_ts || Date.now()}.${fbclid}`;
  const parts = window.location.hostname.split('.');
  // Del dominio más corto al más largo: el navegador rechaza los sufijos públicos (.com, .app…).
  const domains = parts.length > 1 ? parts.map((_, i) => parts.slice(i).join('.')).reverse() : [];
  const base = `_fbc=${encodeURIComponent(value)}; max-age=${FBC_MAX_AGE}; path=/; SameSite=Lax`;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  for (const domain of domains.slice(1)) {
    document.cookie = `${base}; domain=.${domain}${secure}`;
    if (readCookie('_fbc') === value) return;
  }
  document.cookie = `${base}${secure}`;
}

/** Carga el Pixel y envía PageView. Solo si hay consentimiento. */
export function loadPixel(): void {
  const pixelId = getPixelId();
  if (!pixelId || !hasMarketingConsent()) return;
  storeFbc();
  if (initialized) {
    if (revoked) {
      revoked = false;
      window.fbq?.('consent', 'grant');
      window.fbq?.('track', 'PageView', {}, { eventID: pageViewId });
    }
    return;
  }
  installSnippet();
  // Desactiva los eventos automáticos y el advanced matching automático: si no, Meta enviaría el
  // texto de los botones pulsados (p. ej. la zona del dolor) y leería los campos del formulario.
  window.fbq?.('set', 'autoConfig', false, pixelId);
  window.fbq?.('init', pixelId);
  // El mismo event_id que el PageView que ya recibió la API de conversiones: Meta lo cuenta una vez.
  window.fbq?.('track', 'PageView', {}, { eventID: pageViewId });
  initialized = true;
  revoked = false;
}

function deleteCookie(name: string): void {
  const host = window.location.hostname;
  const parts = host.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i += 1) domains.push(`.${parts.slice(i).join('.')}`);
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  for (const domain of domains) {
    document.cookie = `${name}=; expires=${expires}; path=/${domain ? `; domain=${domain}` : ''}`;
  }
}

/** Retira el consentimiento: revoke, borra _fbp y _fbc y bloquea más eventos. */
export function revokePixel(): void {
  revoked = true;
  if (window.fbq) window.fbq('consent', 'revoke');
  deleteCookie('_fbp');
  deleteCookie('_fbc');
}

type StandardEvent = 'PageView' | 'ViewContent' | 'Lead' | 'Contact';
type CustomEvent = 'FormStart' | 'FormStep' | 'FormError' | 'VideoPlay';
type AllowedEvent = StandardEvent | CustomEvent;
const CUSTOM_EVENTS: readonly AllowedEvent[] = ['FormStart', 'FormStep', 'FormError', 'VideoPlay'];
export type FormField = 'zona' | 'detalle' | 'nombre' | 'telefono' | 'consentimiento' | 'envio';
const FIELDS: readonly FormField[] = [
  'zona',
  'detalle',
  'nombre',
  'telefono',
  'consentimiento',
  'envio',
];
type SafeParams = {
  content_name?: 'Formulario';
  content_category?: 'gracias-auto' | 'gracias-boton';
  step?: number;
  field?: FormField;
};

/** Solo pasan los valores previstos: nada de salud ni datos personales. */
function sanitize(params: SafeParams): SafeParams {
  const safe: SafeParams = {};
  if (params.content_name === 'Formulario') safe.content_name = 'Formulario';
  if (params.content_category === 'gracias-auto' || params.content_category === 'gracias-boton') {
    safe.content_category = params.content_category;
  }
  if (params.step !== undefined && [1, 2, 3, 4].includes(params.step)) safe.step = params.step;
  if (params.field && FIELDS.includes(params.field)) safe.field = params.field;
  return safe;
}

/**
 * Wrapper de eventos. No hace nada sin consentimiento.
 * Los parámetros admitidos están cerrados a propósito: nada de salud ni datos personales.
 */
export function track(
  event: AllowedEvent,
  params: SafeParams = {},
  opts: { eventID?: string } = {},
): void {
  if (!isPixelActive() || !window.fbq) return;
  const safe = sanitize(params);
  const options = opts.eventID ? { eventID: opts.eventID } : undefined;
  window.fbq(CUSTOM_EVENTS.includes(event) ? 'trackCustom' : 'track', event, safe, options);
}

export const isPixelActive = (): boolean => initialized && !revoked && hasMarketingConsent();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Normalización de Meta para nombres (la misma que en src/lib/capi.ts). */
const normName = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}]/gu, '');

/**
 * Lead del Pixel, una sola vez por event_id (sessionStorage rw_lead_<event_id>), con el mismo
 * event_id que la API de conversiones. Antes, advanced matching manual: fbq('init') con el teléfono
 * (ph), el nombre (fn) y el país (country, si es +34), cifrados aquí en SHA-256.
 * Devuelve true si el Lead ha salido.
 */
export async function trackLead(
  eventId: string,
  user: { telefono: string; nombre: string },
): Promise<boolean> {
  if (!isPixelActive() || !window.fbq) return false;
  const key = `rw_lead_${eventId}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // sin sessionStorage: el Lead sale igualmente (una vez por envío)
  }
  try {
    const phone = user.telefono.replace(/\D/g, '');
    const fn = normName(user.nombre.trim().split(/\s+/)[0] ?? '');
    const data: Record<string, string> = { ph: await sha256Hex(phone) };
    if (fn) data.fn = await sha256Hex(fn);
    if (user.telefono.startsWith('+34')) data.country = await sha256Hex('es');
    window.fbq('init', getPixelId(), data);
  } catch {
    // sin crypto.subtle (contexto no seguro): Lead sin advanced matching
  }
  track('Lead', {}, { eventID: eventId });
  return true;
}
