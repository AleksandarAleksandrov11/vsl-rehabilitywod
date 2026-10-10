/**
 * Meta Pixel cargado de forma programática y SOLO con consentimiento de marketing.
 * Sin <noscript>: la imagen de fallback dispara un PageView sin consentimiento.
 * Nunca se envían datos de salud (zona, detalle), ni nombre ni teléfono.
 */
import { hasMarketingConsent } from './consent';
import { getAttribution } from './utm';

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

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

/**
 * Guarda el fbclid del anuncio en la cookie _fbc (formato de Meta: fb.1.<ms>.<fbclid>) para que el
 * Pixel y la API de conversiones lo usen aunque la persona ya no esté en la URL del anuncio.
 * Se escribe en el dominio principal (como hace Meta) y solo con consentimiento de marketing.
 */
function storeFbc(): void {
  const fbclid = getAttribution().fbclid.trim();
  if (!fbclid || !/^[\w-]{10,500}$/.test(fbclid)) return;
  const current = readCookie('_fbc');
  if (current.endsWith(`.${fbclid}`)) return;
  const value = `fb.1.${Date.now()}.${fbclid}`;
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
      window.fbq?.('track', 'PageView');
    }
    return;
  }
  installSnippet();
  // Desactiva los eventos automáticos y el advanced matching automático: si no, Meta enviaría el
  // texto de los botones pulsados (p. ej. la zona del dolor) y leería los campos del formulario.
  window.fbq?.('set', 'autoConfig', false, pixelId);
  window.fbq?.('init', pixelId);
  window.fbq?.('track', 'PageView');
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
type CustomEvent = 'FormStart' | 'VideoPlay';
type AllowedEvent = StandardEvent | CustomEvent;
const CUSTOM_EVENTS: readonly AllowedEvent[] = ['FormStart', 'VideoPlay'];
type SafeParams = { content_name?: 'Formulario' };

/**
 * Wrapper de eventos. No hace nada sin consentimiento.
 * Los parámetros admitidos están cerrados a propósito: nada de salud ni datos personales.
 */
export function track(
  event: AllowedEvent,
  params: SafeParams = {},
  opts: { eventID?: string } = {},
): void {
  if (revoked || !initialized || !hasMarketingConsent() || !window.fbq) return;
  const safe: SafeParams =
    params.content_name === 'Formulario' ? { content_name: 'Formulario' } : {};
  const options = opts.eventID ? { eventID: opts.eventID } : undefined;
  if (CUSTOM_EVENTS.includes(event)) {
    window.fbq('trackCustom', event, {}, options);
  } else {
    window.fbq('track', event, safe, options);
  }
}

export const isPixelActive = (): boolean => initialized && !revoked && hasMarketingConsent();
