/** Acordeón de preguntas frecuentes (la altura se anima en CSS con grid-template-rows). */
document.querySelectorAll<HTMLButtonElement>('[data-faq-toggle]').forEach((button) => {
  const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
  if (!panel) return;
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('is-open', open);
  });
});

export {};
