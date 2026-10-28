/**
 * Barra CTA fija (móvil < 768 px): aparece en cuanto el CTA del hero sale de pantalla y se oculta
 * con #valoracion en pantalla y con el footer (que tiene su propio CTA: nunca dos a la vez). Con el
 * banner de cookies abierto se coloca encima de él (variable --cb-h) en vez de esperar a que la
 * persona decida; solo se oculta si el banner ocupa mucho (panel Configurar abierto).
 */
const MAX_BANNER_H = 160;
const bar = document.querySelector<HTMLElement>('[data-sticky-cta]');
const links = [...(bar?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
const heroCta = document.querySelector<HTMLElement>('[data-hero-cta]');
const valoracion = document.getElementById('valoracion');
const footer = document.querySelector<HTMLElement>('.site-footer');
const mobile = window.matchMedia('(max-width: 767.98px)');

const state = {
  heroVisible: true,
  valoracionVisible: false,
  footerVisible: false,
  // El banner puede haberse abierto antes de que cargue este script.
  bannerH: parseFloat(document.documentElement.style.getPropertyValue('--cb-h')) || 0,
};

function update() {
  const passedHero = !state.heroVisible && state.bannerH <= MAX_BANNER_H;
  const show = mobile.matches && passedHero && !state.valoracionVisible && !state.footerVisible;
  if (bar) {
    bar.classList.toggle('is-visible', show);
    bar.setAttribute('aria-hidden', String(!show));
    links.forEach((a) => (a.tabIndex = show ? 0 : -1));
  }
  document.documentElement.dataset.sticky = show ? 'visible' : 'hidden';
}

if (bar && 'IntersectionObserver' in window) {
  if (heroCta) {
    // La cabecera fija tapa la parte de arriba: el CTA cuenta como fuera de pantalla en cuanto
    // queda detrás de ella.
    const headerH = document.querySelector<HTMLElement>('[data-header]')?.offsetHeight ?? 0;
    new IntersectionObserver(
      ([entry]) => {
        // Visible mientras el CTA del hero está en pantalla o aún no se ha pasado.
        state.heroVisible =
          !!entry && (entry.isIntersecting || entry.boundingClientRect.top > headerH);
        update();
      },
      { rootMargin: `-${headerH}px 0px 0px 0px` },
    ).observe(heroCta);
  }
  if (valoracion) {
    new IntersectionObserver(([entry]) => {
      state.valoracionVisible = !!entry?.isIntersecting;
      update();
    }).observe(valoracion);
  }
  if (footer) {
    new IntersectionObserver(([entry]) => {
      state.footerVisible = !!entry?.isIntersecting;
      update();
    }).observe(footer);
  }
  document.addEventListener('rw:banner', (event) => {
    const detail = (event as CustomEvent<{ open: boolean; height: number }>).detail;
    state.bannerH = detail?.open ? detail.height : 0;
    update();
  });
  mobile.addEventListener('change', update);
  update();
}

export {};
