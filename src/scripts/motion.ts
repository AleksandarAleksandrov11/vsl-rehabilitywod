/**
 * Movimiento de la home (solo transform, con requestAnimationFrame):
 * - Parallax sutil (±40 px) en la banda 3B y en el cierre.
 * - Línea de los pasos (escritorio): el punto avanza con el scroll.
 * - Carruseles que empiezan centrados (capturas de la app en móvil).
 * Con prefers-reduced-motion no hay parallax ni avance animado.
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_SHIFT = 40;

const layers = [...document.querySelectorAll<HTMLElement>('[data-parallax]')];
const rail = document.querySelector<HTMLElement>('[data-rail]');
const railDot = rail?.querySelector<HTMLElement>('[data-rail-dot]');
const visible = new Set<Element>();
let ticking = false;

function frame(): void {
  ticking = false;
  const vh = window.innerHeight;
  for (const layer of layers) {
    const box = layer.parentElement;
    if (!box || !visible.has(box)) continue;
    const rect = box.getBoundingClientRect();
    // -1 cuando la sección entra por abajo, 1 cuando sale por arriba.
    const t = (vh / 2 - (rect.top + rect.height / 2)) / ((vh + rect.height) / 2);
    const shift = Math.max(-1, Math.min(1, t)) * MAX_SHIFT;
    layer.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
  }
  if (rail && railDot && visible.has(rail) && rail.offsetWidth > 0) {
    const rect = rail.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (vh * 0.85 - rect.top) / (vh * 0.5)));
    rail.style.setProperty('--p', p.toFixed(3));
    railDot.style.setProperty('--x', `${(p * rect.width).toFixed(1)}px`);
  }
}

function request(): void {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
}

if (!reduce && (layers.length || rail) && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    request();
  });
  layers.forEach((layer) => layer.parentElement && io.observe(layer.parentElement));
  if (rail) io.observe(rail);
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
} else if (rail) {
  rail.style.setProperty('--p', '1');
}

// Carruseles que empiezan con el elemento central centrado.
document.querySelectorAll<HTMLElement>('[data-center-scroll]').forEach((el) => {
  const center = () => {
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > 1) el.scrollLeft = overflow / 2;
  };
  center();
  window.addEventListener('load', center, { once: true });
});

export {};
