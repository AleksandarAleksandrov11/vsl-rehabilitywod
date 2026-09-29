/** Diálogos "Leer más" de los testimonios (también desde la copia inert del marquee). */
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
  const marquee = target.closest<HTMLElement>('[data-marquee]');
  if (marquee) {
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
