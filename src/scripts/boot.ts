/**
 * Arranque común a todas las páginas: atribución, Pixel según consentimiento,
 * clics en CTA, estado del header y animaciones de entrada.
 */
import { captureAttribution } from './utm';
import { getConsent, onConsentChange } from './consent';
import { loadPixel, revokePixel } from './pixel';
import { trackEvent } from './tracking';
import './cookie-banner';

captureAttribution();

// Visitas con consentimiento guardado: el Pixel se carga al inicio.
if (getConsent()?.marketing) loadPixel();
onConsentChange((consent) => {
  if (consent.marketing) loadPixel();
  else revokePixel();
});

// cta_click {location}
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const cta = target?.closest<HTMLElement>('[data-cta]');
  if (cta?.dataset.cta) trackEvent('cta_click', { location: cta.dataset.cta });
});

// Header: transparente sobre el hero, sólido al hacer scroll.
const header = document.querySelector<HTMLElement>('[data-header]');
const sentinel = document.querySelector<HTMLElement>('[data-top-sentinel]');
if (header && sentinel && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    header.classList.toggle('is-scrolled', !entry?.isIntersecting);
  }).observe(sentinel);
}

// Animaciones de entrada: solo para lo que aún no se ve; una sola vez.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealables = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (!reduceMotion && revealables.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  );
  const vh = window.innerHeight;
  revealables.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < vh && rect.bottom > 0) return;
    el.classList.add('reveal-armed');
    io.observe(el);
  });
}

// Zonas con scroll horizontal (capturas de la app en móvil): enfocables con teclado solo
// cuando realmente hay scroll.
const scrollRegions = document.querySelectorAll<HTMLElement>('[data-scroll-region]');
if (scrollRegions.length) {
  const sync = () =>
    scrollRegions.forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1) el.tabIndex = 0;
      else el.removeAttribute('tabindex');
    });
  sync();
  window.addEventListener('resize', sync, { passive: true });
}
