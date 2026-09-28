/**
 * Banner de cookies: primera visita, Aceptar / Rechazar / Configurar, Esc y reapertura desde
 * "Configurar cookies". Avisa a la barra CTA fija (evento rw:banner) para que nunca coincidan.
 */
import { getConsent, saveConsent } from './consent';

const banner = document.getElementById('cookie-banner');
const prefs = document.getElementById('cookie-prefs');
const marketing = document.getElementById('cb-marketing') as HTMLInputElement | null;
const configureBtn = banner?.querySelector<HTMLButtonElement>('[data-consent-action="configure"]');
let returnFocus: HTMLElement | null = null;

function announce(open: boolean) {
  document.documentElement.dataset.cookieBanner = open ? 'open' : 'closed';
  const h = open && banner ? banner.getBoundingClientRect().height + 12 : 0;
  document.documentElement.style.scrollPaddingBottom = h ? `${Math.ceil(h)}px` : '';
  document.dispatchEvent(new CustomEvent('rw:banner', { detail: { open } }));
}

function setPrefs(open: boolean) {
  if (!prefs || !configureBtn) return;
  prefs.hidden = !open;
  configureBtn.setAttribute('aria-expanded', String(open));
  if (open && marketing) marketing.checked = getConsent()?.marketing === true;
}

function show({ withPrefs = false, focus = true } = {}) {
  if (!banner) return;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  banner.hidden = false;
  banner.classList.add('is-entering');
  setPrefs(withPrefs);
  if (focus) banner.focus({ preventScroll: true });
  announce(true);
}

function hide() {
  if (!banner || banner.hidden) return;
  const hadFocus = banner.contains(document.activeElement);
  banner.hidden = true;
  banner.classList.remove('is-entering');
  announce(false);
  if (hadFocus && returnFocus && returnFocus !== document.body && document.contains(returnFocus)) {
    returnFocus.focus({ preventScroll: true });
  }
}

banner?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const action = target?.closest<HTMLElement>('[data-consent-action]')?.dataset.consentAction;
  if (!action) return;
  if (action === 'accept') {
    saveConsent(true);
    hide();
  } else if (action === 'reject') {
    saveConsent(false);
    hide();
  } else if (action === 'configure') {
    setPrefs(prefs?.hidden ?? false);
    announce(true);
  } else if (action === 'save') {
    saveConsent(marketing?.checked === true);
    hide();
  }
});

// Esc cierra sin decidir: el banner vuelve a salir en la siguiente página.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && banner && !banner.hidden) hide();
});

// "Configurar cookies" del footer (y de la política de cookies) reabre el panel.
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-open-cookie-settings]')) return;
  event.preventDefault();
  show({ withPrefs: true });
});

if (!getConsent()) {
  // Primera visita (o consentimiento caducado): el foco va al banner.
  show({ focus: true });
} else {
  announce(false);
}

window.addEventListener(
  'resize',
  () => {
    if (banner && !banner.hidden) announce(true);
  },
  { passive: true },
);
