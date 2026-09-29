/**
 * Eventos personalizados de Vercel Analytics (sin cookies).
 * Si el plan de Vercel no admite eventos personalizados o el script no carga, no rompe nada.
 */
import { track as vercelTrack } from '@vercel/analytics';

type Primitive = string | number | boolean | null;

// Cola compatible con el script de Vercel (window.va / window.vaq los tipa @vercel/analytics):
// los eventos previos a su carga no se pierden.
function ensureQueue(): void {
  if (typeof window.va === 'function') return;
  window.va = (event, properties) => {
    (window.vaq = window.vaq || []).push([event, properties]);
  };
}

export type CtaLocation =
  | 'header'
  | 'hero'
  | 'hero_video'
  | 'vsl'
  | 'why'
  | 'compare'
  | 'how'
  | 'about'
  | 'closing'
  | 'sticky';

export function trackEvent(name: string, data?: Record<string, Primitive>): void {
  try {
    ensureQueue();
    vercelTrack(name, data);
  } catch {
    // Nunca bloquea la interacción.
  }
}
