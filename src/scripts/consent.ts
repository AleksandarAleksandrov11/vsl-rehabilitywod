/**
 * Consentimiento de cookies (AEPD).
 * Se guarda en localStorage como `rw_consent` = {v, marketing, ts}.
 * Caduca a los 12 meses o si cambia la versión `v`.
 */

export const CONSENT_KEY = 'rw_consent';
export const CONSENT_VERSION = 1;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type Consent = { v: number; marketing: boolean; ts: number };

export const CONSENT_EVENT = 'rw:consent';

export function getConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Consent>;
    if (
      data?.v !== CONSENT_VERSION ||
      typeof data.marketing !== 'boolean' ||
      typeof data.ts !== 'number' ||
      Date.now() - data.ts > MAX_AGE_MS
    ) {
      return null;
    }
    return { v: data.v, marketing: data.marketing, ts: data.ts };
  } catch {
    return null;
  }
}

export const hasMarketingConsent = (): boolean => getConsent()?.marketing === true;

export function saveConsent(marketing: boolean): Consent {
  const consent: Consent = { v: CONSENT_VERSION, marketing, ts: Date.now() };
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {
    // Almacenamiento bloqueado: la elección vale solo para esta página.
  }
  document.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: consent }));
  return consent;
}

export function onConsentChange(callback: (consent: Consent) => void): void {
  document.addEventListener(CONSENT_EVENT, (event) => {
    callback((event as CustomEvent<Consent>).detail);
  });
}
