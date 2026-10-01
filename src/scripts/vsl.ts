/**
 * VSL con el reproductor de YouTube tal cual (youtube-nocookie).
 * - El iframe se inserta cuando el vídeo se acerca a la pantalla (no en la primera pintura).
 * - Si se hace clic en la portada antes de eso, se carga ya con autoplay.
 * - Al empezar a reproducirse envía vsl_play (Vercel) y ViewContent (Meta, solo con
 *   consentimiento). El estado del reproductor llega por postMessage (API de iframes de YouTube,
 *   sin cargar su script).
 */
import { trackEvent } from './tracking';
import { track as pixelTrack } from './pixel';

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
// Estados del reproductor que solo aparecen tras pulsar play (sin autoplay): 1 = reproduciendo,
// 3 = cargando (el primero que llega en conexiones lentas).
const PLAY_STATES = new Set([1, 3]);

const frame = document.querySelector<HTMLElement>('[data-vsl]');
const facade = frame?.querySelector<HTMLButtonElement>('[data-vsl-play]');
let iframe: HTMLIFrameElement | null = null;
let played = false;

function onPlay(): void {
  if (played) return;
  played = true;
  trackEvent('vsl_play');
  pixelTrack('ViewContent', { content_name: 'VSL' });
}

/** Pide al reproductor que avise de sus cambios de estado (se repite por si aún no escucha). */
function subscribe(): void {
  [0, 400, 1200, 2500].forEach((delay) => {
    window.setTimeout(() => {
      const win = iframe?.contentWindow;
      if (!win) return;
      win.postMessage(
        JSON.stringify({ event: 'listening', id: 'vsl', channel: 'widget' }),
        YT_ORIGIN,
      );
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'addEventListener',
          args: ['onStateChange'],
          id: 'vsl',
          channel: 'widget',
        }),
        YT_ORIGIN,
      );
    }, delay);
  });
}

function load(autoplay: boolean): void {
  if (!frame?.dataset.embed || iframe) return;
  const url = new URL(frame.dataset.embed);
  url.searchParams.set('origin', window.location.origin);
  if (autoplay) url.searchParams.set('autoplay', '1');

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
      subscribe();
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
  if (autoplay) {
    iframe.focus();
    onPlay();
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== YT_ORIGIN || !iframe || event.source !== iframe.contentWindow) return;
  let data: { event?: string; info?: unknown } | null = null;
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  const state =
    data?.event === 'onStateChange'
      ? data.info
      : data?.event === 'infoDelivery'
        ? (data.info as { playerState?: number } | undefined)?.playerState
        : undefined;
  if (typeof state === 'number' && PLAY_STATES.has(state)) onPlay();
});

if (frame) {
  facade?.addEventListener('click', () => load(true));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        load(false);
      },
      { rootMargin: '0px 0px 150px 0px' },
    );
    io.observe(frame);
  } else {
    load(false);
  }
}
