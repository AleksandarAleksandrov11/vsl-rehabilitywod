/**
 * Script en línea del <head> de la home (única excepción a "sin scripts en línea").
 * Se ejecuta antes de pintar el hero y marca <html data-ad="..."> con la variante del anuncio; el
 * CSS del hero muestra su antetítulo y su subtítulo. Así no hay parpadeo y no hace falta
 * renderizar en el servidor. Prioridad (ver src/data/ad-variants.ts):
 *   utm_content reconocido > utm_campaign > sessionStorage (rw_ad) > hero de siempre.
 * Con parámetros en la URL que no se reconocen, se borra lo guardado y el hero queda como siempre.
 *
 * La CSP de vercel.json lo permite por su hash sha256: si cambia este texto o AD_VARIANTS, hay que
 * actualizarlo con `node scripts/csp-hash.mjs --write` tras el build (un test lo comprueba).
 */
import { AD_VARIANTS, UTM_CONTENT_RE } from '../data/ad-variants';

export function buildAdScript(): string {
  const valid = AD_VARIANTS.filter((v) => /^[a-z0-9]+$/.test(v.key));
  const keys = valid.map((v) => v.key);
  const byContent = valid.filter((v) => v.utm).map((v) => v.key);
  const byCampaign = valid
    .filter((v) => v.campaign?.length)
    .map((v) => [v.campaign!.join('|'), v.key]);
  return (
    `(function(){try{var A=${JSON.stringify(keys)},K=${JSON.stringify(byContent)},` +
    `C=${JSON.stringify(byCampaign)},s=sessionStorage,q=new URLSearchParams(location.search),` +
    `c=q.get('utm_content'),g=q.get('utm_campaign'),k='',m,i;` +
    `if(c!==null){m=c.toLowerCase().trim().match(${UTM_CONTENT_RE});` +
    `if(m){m=(m[1]+m[2]).replace(/\\.0+$/,'');if(K.indexOf(m)>=0)k=m}}` +
    `if(!k&&g)for(i=0;i<C.length&&!k;i++)if(new RegExp(C[i][0]).test(g.toLowerCase()))k=C[i][1];` +
    `if(k)s.setItem('rw_ad',k);else if(c!==null||g!==null)s.removeItem('rw_ad');` +
    `else k=s.getItem('rw_ad')||'';` +
    `if(A.indexOf(k)>=0)document.documentElement.setAttribute('data-ad',k)}catch(e){}})();`
  );
}
