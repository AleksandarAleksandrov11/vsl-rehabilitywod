/**
 * Carrusel de testimonios: pausa al mantener pulsado en táctil (hover y foco van en CSS) y
 * diálogos "Leer más".
 */
const marquee = document.querySelector<HTMLElement>('[data-marquee]');

// Pausa al mantener pulsado en táctil (hover y foco se resuelven en CSS).
if (marquee) {
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

function openDialog(id: string, opener?: HTMLElement | null) {
  const dialog = document.getElementById(id);
  if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
  dialog.showModal();
  dialog.addEventListener(
    'close',
    () => {
      const fallback = document.querySelector<HTMLElement>(
        `.marquee-list:not([data-copy]) [data-dialog-open="${id}"]`,
      );
      (opener && !opener.closest('[inert]') ? opener : fallback)?.focus({ preventScroll: true });
    },
    { once: true },
  );
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const opener = target.closest<HTMLElement>('[data-dialog-open]');
  if (opener?.dataset.dialogOpen) {
    openDialog(opener.dataset.dialogOpen, opener);
    return;
  }

  if (target.closest('[data-dialog-close]')) {
    target.closest('dialog')?.close();
    return;
  }

  // Clic en el fondo del diálogo: cerrar.
  if (target instanceof HTMLDialogElement && target.open) {
    const r = target.getBoundingClientRect();
    const { clientX: x, clientY: y } = event as MouseEvent;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) target.close();
    return;
  }

  // El duplicado del loop es inert (no recibe clics): si el clic cae sobre su "Leer más",
  // abrimos el mismo testimonio para que funcione igual en cualquier vuelta del carrusel.
  if (marquee && marquee.contains(target)) {
    const { clientX: x, clientY: y } = event as MouseEvent;
    const copies = marquee.querySelectorAll<HTMLElement>('[data-copy] [data-dialog-open]');
    for (const btn of copies) {
      const r = btn.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && btn.dataset.dialogOpen) {
        openDialog(btn.dataset.dialogOpen, null);
        break;
      }
    }
  }
});

export {};
