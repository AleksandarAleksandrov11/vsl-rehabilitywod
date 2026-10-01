/**
 * Barra CTA fija (móvil < 768 px) y burbuja de WhatsApp (escritorio): aparecen cuando el CTA del
 * hero sale de pantalla. La barra se oculta con #valoracion en pantalla y ninguna de las dos
 * coincide con el banner de cookies.
 */
const bar = document.querySelector<HTMLElement>('[data-sticky-cta]');
const links = [...(bar?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
const floatWa = document.querySelector<HTMLAnchorElement>('[data-whatsapp="float"]');
const heroCta = document.querySelector<HTMLElement>('[data-hero-cta]');
const valoracion = document.getElementById('valoracion');
const mobile = window.matchMedia('(max-width: 767.98px)');

const state = {
  heroVisible: true,
  valoracionVisible: false,
  bannerOpen: document.documentElement.dataset.cookieBanner === 'open',
};

function update() {
  const passedHero = !state.heroVisible && !state.bannerOpen;
  const show = mobile.matches && passedHero && !state.valoracionVisible;
  if (bar) {
    bar.classList.toggle('is-visible', show);
    bar.setAttribute('aria-hidden', String(!show));
    links.forEach((a) => (a.tabIndex = show ? 0 : -1));
  }
  // La burbuja solo se ve en escritorio (en móvil, WhatsApp va dentro de la barra).
  const showFloat = !mobile.matches && passedHero;
  if (floatWa) {
    floatWa.classList.toggle('is-visible', showFloat);
    floatWa.tabIndex = showFloat ? 0 : -1;
  }
  document.documentElement.dataset.sticky = show ? 'visible' : 'hidden';
}

if ((bar || floatWa) && 'IntersectionObserver' in window) {
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
