/**
 * Marquees (cinta de stats y testimonios): pausa al mantener pulsado en táctil.
 * El movimiento, la pausa con hover y con foco y el modo reduced-motion van en CSS.
 */
const marquees = [...document.querySelectorAll<HTMLElement>('[data-marquee]')];

for (const marquee of marquees) {
  const pause = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') marquee.classList.add('is-paused');
  };
  const resume = () => marquee.classList.remove('is-paused');
  marquee.addEventListener('pointerdown', pause);
  marquee.addEventListener('pointerup', resume);
  marquee.addEventListener('pointercancel', resume);
  marquee.addEventListener('pointerleave', resume);
  marquee.addEventListener('contextmenu', (e) => {
    if (marquee.classList.contains('is-paused')) e.preventDefault();
  });
}

export {};
