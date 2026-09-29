/**
 * Script en línea del <head> de la home (única excepción a "sin scripts en línea").
 * Marca <html class="js"> y, si es la primera visita de la sesión y no hay
 * prefers-reduced-motion, <html data-intro="play"> para mostrar la animación inicial.
 *
 * IMPORTANTE: si cambias este texto, cambia también su hash sha256 en la CSP de vercel.json
 * (`node scripts/csp-hash.mjs` lo calcula). El test "CSP: hash del script de la intro" lo vigila.
 */
export const INTRO_SCRIPT =
  "(function(){var d=document.documentElement;d.classList.add('js');try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&!sessionStorage.getItem('rw_intro')){d.setAttribute('data-intro','play');sessionStorage.setItem('rw_intro','1')}}catch(e){}})();";
