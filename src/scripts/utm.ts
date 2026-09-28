/**
 * Atribución: UTM y fbclid se capturan en la primera visita de la sesión y se guardan en
 * sessionStorage, para enviarlos con el lead aunque el usuario navegue por la web.
 */
import { TRACKING_KEYS, type TrackingKey } from '../lib/lead';

const KEY = 'rw_attribution';

export type Attribution = Record<TrackingKey, string> & { referrer: string };

const empty = (): Attribution =>
  Object.assign(
    { referrer: '' },
    Object.fromEntries(TRACKING_KEYS.map((k) => [k, ''])) as Record<TrackingKey, string>,
  );

export function captureAttribution(): void {
  try {
    if (window.sessionStorage.getItem(KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const data = empty();
    for (const key of TRACKING_KEYS) data[key] = (params.get(key) ?? '').slice(0, 200);
    const ref = document.referrer;
    // Solo referrers externos (sin query, por si llevan datos).
    if (ref && !ref.startsWith(window.location.origin)) {
      try {
        const u = new URL(ref);
        data.referrer = `${u.origin}${u.pathname}`.slice(0, 300);
      } catch {
        data.referrer = '';
      }
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // sessionStorage bloqueado: se enviará vacío.
  }
}

export function getAttribution(): Attribution {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<Attribution>) };
  } catch {
    // ignorar
  }
  return empty();
}
