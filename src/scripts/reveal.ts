/**
 * Animación ligada al scroll, común a todas las páginas (solo transform, opacity y clip-path):
 * barra de progreso bajo el header y entradas de .reveal, .reveal-scale, .reveal-clip y titulares.
 */
// Barra de progreso de scroll (2 px bajo el header). Solo transform.
const progress = document.querySelector<HTMLElement>('[data-scroll-progress]');
if (progress) {
  let ticking = false;
  const paint = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progress.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(paint);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();
}

// Entradas al hacer scroll (.reveal, .reveal-scale, .reveal-clip y titulares .split):
// umbral 0,15, una sola vez. Solo se arma lo que aún no se ve, así que sin JS (o si este
// script falla) todo se ve.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealables = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (!reduceMotion && revealables.length && 'IntersectionObserver' in window) {
  // Chrome tiene en cuenta el clip-path del propio elemento: un .reveal-clip recortado al 100 %
  // nunca "intersecta". En ese caso se observa su contenedor.
  const targets = new Map<Element, HTMLElement[]>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        targets.get(entry.target)?.forEach((el) => el.classList.add('is-in'));
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.15 },
  );
  const vh = window.innerHeight;
  revealables.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < vh && rect.bottom > 0) return;
    el.classList.add('reveal-armed');
    const target = el.classList.contains('reveal-clip') ? (el.parentElement ?? el) : el;
    targets.set(target, [...(targets.get(target) ?? []), el]);
    io.observe(target);
  });
}

export {};
