/** Contador de la tira de stats (0 → 120 en 1,2 s, una vez; con reduced-motion, número final). */
// Contador 0 → 120 en 1,2 s, una sola vez al entrar en pantalla.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const counters = document.querySelectorAll<HTMLElement>('[data-count-to]');

function animate(el: HTMLElement) {
  const to = Number(el.dataset.countTo ?? 0);
  const prefix = el.dataset.countPrefix ?? '';
  const duration = Number(el.dataset.countDuration ?? 1200);
  const start = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = `${prefix}${Math.round(to * ease(t))}`;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (!reduce && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        animate(entry.target as HTMLElement);
      }
    },
    { threshold: 0.6 },
  );
  // El número animado va con aria-hidden: el lector de pantalla oye siempre el valor final.
  counters.forEach((el) => io.observe(el));
}

export {};
