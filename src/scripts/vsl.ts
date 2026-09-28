/**
 * Fachada de la VSL: el iframe de youtube-nocookie solo se carga al hacer clic.
 * Envía vsl_play (Vercel) y ViewContent (Meta, solo con consentimiento).
 */
import { trackEvent } from './tracking';
import { track as pixelTrack } from './pixel';

const frame = document.querySelector<HTMLElement>('[data-vsl]');
const facade = frame?.querySelector<HTMLButtonElement>('[data-vsl-play]');

// Si la miniatura maxres no existe (fallback en tiempo de ejecución), usar hqdefault.
const thumb = frame?.querySelector<HTMLImageElement>('[data-yt-thumb]');
if (thumb) {
  const useHq = () => {
    const hq = thumb.src.replace('maxresdefault', 'hqdefault');
    if (hq !== thumb.src) thumb.src = hq;
  };
  thumb.addEventListener('error', useHq, { once: true });
  if (thumb.complete && thumb.naturalWidth > 0 && thumb.naturalWidth <= 120) useHq();
}

facade?.addEventListener('click', () => {
  if (!frame || !frame.dataset.embed) return;
  const iframe = document.createElement('iframe');
  iframe.src = frame.dataset.embed;
  iframe.title = 'Vídeo: por qué no mejora tu lesión y qué puedes hacer (RehabilityWOD)';
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  facade.replaceWith(iframe);
  iframe.focus();
  trackEvent('vsl_play');
  pixelTrack('ViewContent', { content_name: 'VSL' });
});
