/**
 * Fachada de la VSL: el iframe de youtube-nocookie solo se carga al hacer clic y aparece con
 * un fundido de 250 ms sobre el póster. Envía vsl_play (Vercel) y ViewContent (Meta, solo con
 * consentimiento).
 */
import { trackEvent } from './tracking';
import { track as pixelTrack } from './pixel';

const frame = document.querySelector<HTMLElement>('[data-vsl]');
const facade = frame?.querySelector<HTMLButtonElement>('[data-vsl-play]');

facade?.addEventListener('click', () => {
  if (!frame?.dataset.embed || frame.querySelector('iframe')) return;
  const iframe = document.createElement('iframe');
  iframe.src = frame.dataset.embed;
  iframe.title = 'Vídeo: ¿Por qué sigues con dolor al entrenar CrossFit? (RehabilityWOD)';
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';

  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    iframe.classList.add('is-ready');
    // Tras el fundido, el póster sobra.
    window.setTimeout(() => facade.remove(), 300);
  };
  iframe.addEventListener('load', show, { once: true });
  window.setTimeout(show, 2500);

  facade.setAttribute('aria-hidden', 'true');
  facade.tabIndex = -1;
  frame.append(iframe);
  iframe.focus();
  trackEvent('vsl_play');
  pixelTrack('ViewContent', { content_name: 'VSL' });
});
