/**
 * VSL con el reproductor de YouTube (youtube-nocookie) en facade.
 * - Hasta pulsar play solo se ve la portada: no se descarga nada de YouTube.
 * - Al acercar el dedo o el ratón a la portada se abre la conexión con YouTube (preconnect).
 * - Al pulsar play se inserta el iframe con autoplay y se envía vsl_play (Vercel) y
 *   ViewContent (Meta, solo con consentimiento).
 */
import { trackEvent } from './tracking';
import { track as pixelTrack } from './pixel';

const YT_ORIGIN = 'https://www.youtube-nocookie.com';

const frame = document.querySelector<HTMLElement>('[data-vsl]');
const facade = frame?.querySelector<HTMLButtonElement>('[data-vsl-play]');
let iframe: HTMLIFrameElement | null = null;

function load(): void {
  if (!frame?.dataset.embed || iframe) return;
  const url = new URL(frame.dataset.embed);
  url.searchParams.set('origin', window.location.origin);
  url.searchParams.set('autoplay', '1');

  iframe = document.createElement('iframe');
  iframe.src = url.toString();
  iframe.title = 'Vídeo: ¿Por qué sigues con dolor al entrenar CrossFit? (RehabilityWOD)';
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';

  // La portada solo se retira cuando el reproductor ha cargado: si YouTube no carga (red,
  // bloqueadores), sigue viéndose la portada en vez de un recuadro vacío.
  iframe.addEventListener(
    'load',
    () => {
      // YouTube pinta su portada un instante después del load: se espera antes del fundido.
      window.setTimeout(() => {
        iframe?.classList.add('is-ready');
        window.setTimeout(() => facade?.remove(), 300);
      }, 500);
    },
    { once: true },
  );

  if (facade) {
    facade.setAttribute('aria-hidden', 'true');
    facade.tabIndex = -1;
  }
  frame.append(iframe);
  iframe.focus();
  trackEvent('vsl_play');
  pixelTrack('ViewContent', { content_name: 'VSL' });
}

/** Abre la conexión con YouTube justo antes del clic (una sola vez). */
let warmed = false;
function warmUp(): void {
  if (warmed) return;
  warmed = true;
  for (const host of [YT_ORIGIN, 'https://www.youtube.com', 'https://i.ytimg.com']) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = host;
    link.crossOrigin = '';
    document.head.append(link);
  }
}

if (frame && facade) {
  for (const type of ['pointerover', 'touchstart', 'focus']) {
    facade.addEventListener(type, warmUp, { once: true, passive: true });
  }
  facade.addEventListener('click', load);
}
