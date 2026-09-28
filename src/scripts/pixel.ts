/**
 * Meta Pixel cargado de forma programática y SOLO con consentimiento de marketing.
 * Sin <noscript>: la imagen de fallback dispara un PageView sin consentimiento.
 * Nunca se envían datos de salud (zona, detalle), ni nombre ni teléfono.
 */
import { hasMarketingConsent } from './consent';

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

/** Carga el Pixel y envía PageView. Solo si hay consentimiento. */
export function loadPixel(): void {
  const pixelId = getPixelId();
  if (!pixelId || !hasMarketingConsent()) return;
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

type AllowedEvent = 'PageView' | 'ViewContent' | 'Lead' | 'FormStart';
type SafeParams = { content_name?: 'VSL' };

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
  const safe: SafeParams = params.content_name === 'VSL' ? { content_name: 'VSL' } : {};
  const options = opts.eventID ? { eventID: opts.eventID } : undefined;
  if (event === 'FormStart') {
    window.fbq('trackCustom', 'FormStart', {}, options);
  } else {
    window.fbq('track', event, safe, options);
  }
}

export const isPixelActive = (): boolean => initialized && !revoked && hasMarketingConsent();
