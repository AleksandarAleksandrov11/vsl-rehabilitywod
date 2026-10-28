/**
 * Atribución: UTM y fbclid se capturan en la primera visita de la sesión y se guardan en
 * sessionStorage, para enviarlos con el lead aunque el usuario navegue por la web.
 * fbclid_ts es el momento (ms) en que se vio el fbclid por primera vez: con él se forma el fbc de
 * Meta (fb.1.<ms>.<fbclid>) en la cookie _fbc y en la API de conversiones. No va a la hoja.
 */
import { TRACKING_KEYS, type TrackingKey } from '../lib/lead';

const KEY = 'rw_attribution';

export type Attribution = Record<TrackingKey, string> & { referrer: string; fbclid_ts: number };

const empty = (): Attribution =>
  Object.assign(
    { referrer: '', fbclid_ts: 0 },
    Object.fromEntries(TRACKING_KEYS.map((k) => [k, ''])) as Record<TrackingKey, string>,
  );

export function captureAttribution(): void {
  try {
    if (window.sessionStorage.getItem(KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const data = empty();
    for (const key of TRACKING_KEYS) data[key] = (params.get(key) ?? '').slice(0, 200);
    if (data.fbclid) data.fbclid_ts = Date.now();
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
