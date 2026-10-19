/** Diálogos "Leer más" de los testimonios (también desde la copia del loop del marquee). */
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
      // Al cerrar, el foco vuelve al botón original (el de la copia está fuera del tabulador).
      (opener && !opener.closest('[data-copy]') ? opener : fallback)?.focus({
        preventScroll: true,
      });
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
});

export {};
