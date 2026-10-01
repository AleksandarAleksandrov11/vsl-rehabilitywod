/**
 * Movimiento de la home (solo transform, con requestAnimationFrame):
 * - Parallax sutil (±40 px) en la banda de cierre.
 * Con prefers-reduced-motion no hay parallax ni avance animado.
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_SHIFT = 40;

const layers = [...document.querySelectorAll<HTMLElement>('[data-parallax]')];
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
}

function request(): void {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
}

if (!reduce && layers.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    request();
  });
  layers.forEach((layer) => layer.parentElement && io.observe(layer.parentElement));
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
}

export {};
