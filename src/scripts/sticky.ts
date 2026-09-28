/**
 * Barra CTA fija (móvil < 768 px): aparece cuando el CTA del hero sale de pantalla, se oculta
 * con #valoracion en pantalla y nunca coincide con el banner de cookies.
 */
const bar = document.querySelector<HTMLElement>('[data-sticky-cta]');
const link = bar?.querySelector<HTMLAnchorElement>('a');
const heroCta = document.querySelector<HTMLElement>('[data-hero-cta]');
const valoracion = document.getElementById('valoracion');
const mobile = window.matchMedia('(max-width: 767.98px)');

const state = {
  heroVisible: true,
  valoracionVisible: false,
  bannerOpen: document.documentElement.dataset.cookieBanner === 'open',
};

function update() {
  if (!bar) return;
  const show =
    mobile.matches && !state.heroVisible && !state.valoracionVisible && !state.bannerOpen;
  bar.classList.toggle('is-visible', show);
  bar.setAttribute('aria-hidden', String(!show));
  if (link) link.tabIndex = show ? 0 : -1;
  document.documentElement.dataset.sticky = show ? 'visible' : 'hidden';
}

if (bar && 'IntersectionObserver' in window) {
  if (heroCta) {
    new IntersectionObserver(([entry]) => {
      // Visible mientras el CTA del hero está en pantalla o aún no se ha pasado.
      state.heroVisible = !!entry && (entry.isIntersecting || entry.boundingClientRect.top > 0);
      update();
    }).observe(heroCta);
  }
  if (valoracion) {
    new IntersectionObserver(([entry]) => {
      state.valoracionVisible = !!entry?.isIntersecting;
      update();
    }).observe(valoracion);
  }
  document.addEventListener('rw:banner', (event) => {
    state.bannerOpen = !!(event as CustomEvent<{ open: boolean }>).detail?.open;
    update();
  });
  mobile.addEventListener('change', update);
  update();
}

export {};
