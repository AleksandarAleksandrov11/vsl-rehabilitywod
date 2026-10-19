/**
 * Script en línea del <head> de la home (única excepción a "sin scripts en línea").
 * Se ejecuta antes de pintar el hero: si la visita viene de un anuncio conocido (utm_content en la
 * URL, o guardado en sessionStorage en esta misma sesión), marca <html data-ad="..."> y el CSS del
 * hero muestra su antetítulo y su subtítulo. Así no hay parpadeo y no hace falta renderizar en
 * el servidor. Con un utm_content desconocido se borra lo guardado y el hero queda como siempre.
 *
 * La CSP de vercel.json lo permite por su hash sha256: si cambia este texto o AD_VARIANTS, hay que
 * actualizarlo con `node scripts/csp-hash.mjs --write` tras el build (un test lo comprueba).
 */
import { AD_VARIANTS } from '../data/ad-variants';

export function buildAdScript(): string {
  const map = Object.fromEntries(
    AD_VARIANTS.filter((v) => /^[a-z0-9]+$/.test(v.key)).map((v) => [v.utm, v.key]),
  );
  return (
    `(function(){try{var m=${JSON.stringify(map)},s=sessionStorage,` +
    `p=new URLSearchParams(location.search).get('utm_content'),k;` +
    `if(p!==null){k=Object.prototype.hasOwnProperty.call(m,p)?m[p]:'';` +
    `if(k)s.setItem('rw_ad',k);else s.removeItem('rw_ad')}else{k=s.getItem('rw_ad')}` +
    `if(k&&/^[a-z0-9]+$/.test(k))document.documentElement.setAttribute('data-ad',k)}catch(e){}})();`
  );
}
