/**
 * Formulario de valoración: una pregunta por pantalla.
 * Mejora progresiva sobre el <form> nativo (que sin JS envía a /api/lead y lleva a /gracias).
 *
 * Al enviar con éxito:
 * - Lead del Pixel (una vez por event_id, con advanced matching) y Lead de la API de conversiones
 *   por /api/lead-capi (sendBeacon, sin esperar respuesta), los dos con el mismo event_id.
 * - Gracias dentro de la tarjeta, con el foco en el título. En móvil, a los 1,5 s se abre WhatsApp
 *   con el mensaje ya escrito (window.location, nunca window.open) y queda el botón
 *   "Abrir WhatsApp" por si no se abre; en escritorio, solo el botón.
 * Si el envío falla: se conserva todo lo escrito y el enlace de WhatsApp lleva los datos.
 *
 * Eventos de Meta (solo con consentimiento): FormStart una vez por sesión al tocar el formulario o
 * una tarjeta de "¿Qué te duele?", ViewContent (Formulario) y FormStep {step} una vez por paso y
 * sesión, FormError {step, field}; en Vercel, form_step {step} y form_error {step, field}.
 */
import {
  LIMITS,
  MESSAGES,
  isZona,
  normalizePhone,
  validateDetalle,
  validateNombre,
  type LeadPayload,
} from '../lib/lead';
import { getAttribution } from './utm';
import { hasMarketingConsent } from './consent';
import { isPixelActive, track as pixelTrack, trackLead, type FormField } from './pixel';
import { trackEvent } from './tracking';
import { adVariantByKey } from '../data/ad-variants';

const AUTO_ADVANCE_MS = 250;
const LEAVE_MS = 280;
/** Apertura automática de WhatsApp en móvil tras el envío (y al menos 800 ms después del Lead). */
const WA_AUTO_MS = 1500;
const WA_AFTER_LEAD_MS = 800;
const WA_MAX_CHARS = 600;
const SUBMIT_LABEL = 'Enviar y valorar mi caso';
const SUBMIT_LABEL_WA = 'Enviar y abrir WhatsApp';

type ErrorKey = 'zona' | 'detalle' | 'nombre' | 'telefono' | 'consentimiento';

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function detectDevice(): LeadPayload['device'] {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w <= 1024 && window.matchMedia('(pointer: coarse)').matches) return 'tablet';
  return 'desktop';
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  try {
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

/**
 * Evento de Meta una sola vez por sesión. Solo cuenta como enviado si el Pixel está activo: si la
 * persona acepta las cookies más tarde, el evento sale en la siguiente ocasión.
 */
function pixelOnce(key: string, send: () => void): void {
  if (!isPixelActive()) return;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // sin sessionStorage: se envía igualmente
  }
  send();
}

const clip = (text: string) =>
  text.length > WA_MAX_CHARS ? `${text.slice(0, WA_MAX_CHARS - 1).trimEnd()}…` : text;

/** Mensaje de WhatsApp tras enviar el formulario. */
const thanksMessage = (p: LeadPayload) =>
  clip(
    `Hola Gerard, soy ${p.nombre}. Acabo de pedir la valoración en la web. Zona: ${p.zona}.${p.detalle ? ` ${p.detalle}` : ''}`,
  );

/** Mensaje de WhatsApp si el envío falla: lleva todo lo que se ha escrito. */
const errorMessage = (p: LeadPayload) =>
  clip(
    `Hola Gerard, soy ${p.nombre}. El formulario de la web no se ha enviado. Mi teléfono: ${p.telefono}. Zona: ${p.zona}.${p.detalle ? ` ${p.detalle}` : ''}`,
  );

/** Prefijo internacional: "+" (o "00") y de 1 a 4 cifras. */
const validPrefix = (value: string) => /^(\+|00)?\d{1,4}$/.test(value.replace(/[\s\-()]/g, ''));
const isIntl = (value: string) => /^\s*(\+|00)/.test(value);

function init(root: HTMLElement, form: HTMLFormElement): void {
  const steps = [...form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-step]')];
  const total = steps.length;
  const segments = [...root.querySelectorAll<HTMLElement>('[data-progress-seg]')];
  const progressText = root.querySelector<HTMLElement>('[data-progress-text]');
  const progress = root.querySelector<HTMLElement>('[data-progress]');
  const live = root.querySelector<HTMLElement>('[data-live]');
  const notice = root.querySelector<HTMLElement>('[data-form-notice]');
  const formError = form.querySelector<HTMLElement>('[data-form-error]');
  const submitBtn = form.querySelector<HTMLButtonElement>('[data-submit]');
  const backBtn = form.querySelector<HTMLButtonElement>('[data-back]');
  const nextBtn = form.querySelector<HTMLButtonElement>('[data-next]');
  const submitLabel = form.querySelector<HTMLElement>('[data-submit-label]');
  const spinner = form.querySelector<HTMLElement>('.spinner');
  const chips = form.querySelector<HTMLElement>('[data-chips]');
  const detalle = form.querySelector<HTMLTextAreaElement>('#detalle');
  const detalleTitle = form.querySelector<HTMLElement>('[data-detalle-title]');
  const optional = form.querySelector<HTMLElement>('[data-optional]');
  const skipBtn = form.querySelector<HTMLButtonElement>('[data-skip]');
  const countValue = form.querySelector<HTMLElement>('[data-count-value]');
  const nombre = form.querySelector<HTMLInputElement>('#nombre');
  const telefono = form.querySelector<HTMLInputElement>('#telefono');
  const prefijo = form.querySelector<HTMLInputElement>('#prefijo');
  const consent = form.querySelector<HTMLInputElement>('#consentimiento_salud');
  const honeypot = form.querySelector<HTMLInputElement>('#website');
  const formErrorWa = form.querySelector<HTMLAnchorElement>('[data-form-error-wa]');
  const done = root.querySelector<HTMLElement>('[data-form-done]');
  const doneTitle = root.querySelector<HTMLElement>('[data-done-title]');
  const doneText = root.querySelector<HTMLElement>('[data-done-text]');
  const doneWa = root.querySelector<HTMLAnchorElement>('[data-done-wa]');
  const waNumber = (root.dataset.wa ?? '').replace(/\D/g, '');
  const waLink = (text: string) => `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  const mobile = detectDevice() === 'mobile';
  // En móvil, tras enviar se abre WhatsApp: el botón lo dice.
  const submitText = mobile && waNumber ? SUBMIT_LABEL_WA : SUBMIT_LABEL;

  let startedAt = Date.now();
  let eventId = uuidv4();
  const completed = new Set<number>();
  let current = 1;
  let submitting = false;
  let sent = false;
  const errorsSent = new Set<string>();
  let arrowNav = false;
  let advanceTimer = 0;
  let leaveTimer = 0;

  const zonaValue = (): string =>
    form.querySelector<HTMLInputElement>('input[name="zona"]:checked')?.value ?? '';

  // ---------- Errores ----------
  const fieldFor: Record<ErrorKey, HTMLElement | null> = {
    zona: chips,
    detalle,
    nombre,
    telefono,
    consentimiento: consent,
  };

  function setError(key: ErrorKey, message: string | null): void {
    const box = form.querySelector<HTMLElement>(`[data-error="${key}"]`);
    const text = box?.querySelector('span');
    if (box && text) {
      text.textContent = message ?? '';
      box.hidden = !message;
    }
    // Lectores de pantalla: el error también se anuncia (además del aria-describedby del campo).
    if (message && live) live.textContent = message;
    const field = fieldFor[key];
    if (field) {
      if (message) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }
    if (key === 'telefono' && prefijo) {
      if (message) prefijo.setAttribute('aria-invalid', 'true');
      else prefijo.removeAttribute('aria-invalid');
    }
  }

  // ---------- Validación por paso ----------
  function validateStep(step: number, show: boolean): boolean {
    const zona = zonaValue();
    if (step === 1) {
      const ok = isZona(zona);
      if (show) setError('zona', ok ? null : MESSAGES.zona);
      return ok;
    }
    if (step === 2) {
      const value = detalle?.value ?? '';
      const ok = validateDetalle(value, zona);
      if (show) {
        setError(
          'detalle',
          ok
            ? null
            : value.trim().length > LIMITS.detalleMax
              ? MESSAGES.detalleMax
              : MESSAGES.detalleOtro,
        );
      }
      return ok;
    }
    if (step === 3) {
      const ok = validateNombre(nombre?.value ?? '');
      if (show) setError('nombre', ok ? null : MESSAGES.nombre);
      return ok;
    }
    const phoneOk = normalizePhone(telefono?.value ?? '', prefijo?.value ?? '+34') !== null;
    const consentOk = consent?.checked === true;
    if (show) {
      const prefixBad = !isIntl(telefono?.value ?? '') && !validPrefix(prefijo?.value ?? '');
      setError('telefono', phoneOk ? null : prefixBad ? MESSAGES.prefijo : MESSAGES.telefono);
      setError('consentimiento', consentOk ? null : MESSAGES.consentimiento);
    }
    return phoneOk && consentOk;
  }

  /** Campo que falla en un paso (para FormError y form_error). */
  function invalidField(step: number): FormField {
    if (step === 1) return 'zona';
    if (step === 2) return 'detalle';
    if (step === 3) return 'nombre';
    return normalizePhone(telefono?.value ?? '', prefijo?.value ?? '+34') === null
      ? 'telefono'
      : 'consentimiento';
  }

  function reportError(step: number, field: FormField, reason?: string): void {
    trackEvent('form_error', reason ? { step, field, reason } : { step, field });
    // A Meta, cada combinación una vez por página (sin ráfagas al pulsar Enter varias veces).
    const key = `${step}:${field}`;
    if (errorsSent.has(key) || !isPixelActive()) return;
    errorsSent.add(key);
    pixelTrack('FormError', { step, field });
  }

  /** FormStart: una vez por sesión, al primer toque del formulario o de una tarjeta de zona. */
  const formStart = () => pixelOnce('rw_px_formstart', () => pixelTrack('FormStart'));

  function firstInvalidField(step: number): HTMLElement | null {
    if (step === 1)
      return (
        form.querySelector<HTMLInputElement>('input[name="zona"]:checked') ??
        form.querySelector<HTMLInputElement>('input[name="zona"]')
      );
    if (step === 2) return detalle;
    if (step === 3) return nombre;
    if (normalizePhone(telefono?.value ?? '', prefijo?.value ?? '+34') === null) return telefono;
    return consent;
  }

  // ---------- Navegación ----------
  const nav = form.querySelector<HTMLElement>('.form-nav');
  function applyNav(step: number): void {
    if (backBtn) backBtn.hidden = step === 1;
    if (nextBtn) nextBtn.hidden = step === total;
    if (submitBtn) submitBtn.hidden = step !== total;
    // Último paso: la barra se reorganiza en móvil (envío a fila completa y "Atrás" debajo).
    nav?.classList.toggle('is-final', step === total);
  }

  // La tarjeta pasa de su alto anterior al del paso nuevo en el mismo tiempo que la transición
  // de pasos; al terminar vuelve a height: auto (así se adapta a errores o al cambiar el ancho).
  let heightTimer = 0;
  function animateHeight(fromHeight: number): void {
    window.clearTimeout(heightTimer);
    root.style.height = '';
    const toHeight = root.offsetHeight;
    if (Math.abs(toHeight - fromHeight) < 2) return;
    root.style.height = `${fromHeight}px`;
    void root.offsetHeight;
    root.classList.add('is-resizing');
    root.style.height = `${toHeight}px`;
    heightTimer = window.setTimeout(() => {
      root.classList.remove('is-resizing');
      root.style.height = '';
    }, LEAVE_MS + 40);
  }

  function showStep(step: number, { focus = true, announce = true, transition = true } = {}): void {
    const previous = steps[current - 1];
    const dir = step >= current ? 1 : -1;
    const animate =
      transition && announce && !reduceMotion() && previous !== undefined && step !== current;
    // Posición del paso que sale, antes de mostrar el nuevo (al ir hacia atrás lo desplazaría).
    const previousTop = previous?.offsetTop ?? 0;
    // Alto de la tarjeta antes del cambio: cada paso mide lo suyo y el cambio se anima.
    const fromHeight = root.offsetHeight;
    current = step;
    for (const fs of steps) {
      const isCurrent = Number(fs.dataset.step) === step;
      fs.classList.remove('is-entering');
      if (fs === previous && animate) continue;
      fs.hidden = !isCurrent;
      if (isCurrent && animate) {
        // Entra desde +28 px (o -28 px hacia atrás) en 280 ms.
        fs.style.setProperty('--dir', String(dir));
        void fs.offsetWidth;
        fs.classList.add('is-entering');
      }
    }
    if (animate && previous) {
      // El paso anterior sale hacia el lado contrario, superpuesto, y luego se oculta.
      window.clearTimeout(leaveTimer);
      steps.forEach((fs) => {
        if (fs === previous) return;
        fs.classList.remove('is-leaving');
        fs.style.top = '';
      });
      previous.style.setProperty('--dir', String(dir));
      previous.style.top = `${previousTop}px`;
      previous.classList.add('is-leaving');
      leaveTimer = window.setTimeout(() => {
        previous.classList.remove('is-leaving');
        previous.style.top = '';
        previous.hidden = Number(previous.dataset.step) !== current;
      }, LEAVE_MS);
    }
    applyNav(step);
    if (animate) animateHeight(fromHeight);
    segments.forEach((seg) =>
      seg.classList.toggle('is-done', Number(seg.dataset.progressSeg) <= step),
    );
    if (progressText) progressText.textContent = `Paso ${step} de ${total}`;
    if (announce && live) live.textContent = `Paso ${step} de ${total}`;
    if (focus) {
      const title = steps[step - 1]?.querySelector<HTMLElement>('.step-title');
      title?.focus({ preventScroll: true });
      const rect = root.getBoundingClientRect();
      const headerH = 80;
      if (rect.top < headerH || rect.top > window.innerHeight * 0.5) {
        root.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
    }
  }

  function completeStep(step: number): void {
    if (completed.has(step)) return;
    completed.add(step);
    trackEvent('form_step', { step });
    formStart();
    // Señal intermedia para Meta al completar el paso 1, y cada paso una vez por sesión.
    if (step === 1) {
      pixelOnce('rw_px_viewcontent', () =>
        pixelTrack('ViewContent', { content_name: 'Formulario' }),
      );
    }
    pixelOnce(`rw_px_step${step}`, () => pixelTrack('FormStep', { step }));
  }

  function next(): void {
    window.clearTimeout(advanceTimer);
    if (!validateStep(current, true)) {
      firstInvalidField(current)?.focus();
      reportError(current, invalidField(current));
      return;
    }
    if (current < total) {
      completeStep(current);
      showStep(current + 1);
    } else {
      form.requestSubmit();
    }
  }

  function back(): void {
    window.clearTimeout(advanceTimer);
    if (current > 1) showStep(current - 1);
  }

  // "Otro" hace obligatorio el paso 2 y cambia su título.
  function syncOtro(): void {
    const isOtro = zonaValue() === 'Otro';
    if (detalleTitle) detalleTitle.textContent = isOtro ? '¿Qué te pasa?' : 'Cuéntame un poco más.';
    if (optional) optional.hidden = isOtro;
    if (skipBtn) skipBtn.hidden = isOtro;
    if (detalle) {
      detalle.required = isOtro;
      if (isOtro) detalle.minLength = LIMITS.detalleMinOtro;
      else detalle.removeAttribute('minlength');
    }
    if (!isOtro) setError('detalle', null);
  }

  // ---------- Modo "un paso por pantalla" ----------
  form.noValidate = true;
  root.classList.add('is-enhanced');
  if (progress) progress.hidden = false;
  form.querySelectorAll<HTMLElement>('[data-js-only]').forEach((el) => {
    el.hidden = false;
  });
  syncOtro();

  showStep(1, { focus: false, announce: false });
  if (submitLabel) submitLabel.textContent = submitText;

  // Al volver atrás (por ejemplo, desde WhatsApp) el navegador puede restaurar la página tal cual.
  // Con la solicitud ya enviada se queda la gracias (así no se envía dos veces); si no, el
  // formulario vuelve limpio y listo, con otro identificador.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || sent) return;
    form.reset();
    completed.clear();
    startedAt = Date.now();
    eventId = uuidv4();
    setSubmitting(false);
    if (submitLabel) submitLabel.textContent = submitText;
    if (formError) formError.hidden = true;
    syncOtro();
    preselect();
    showStep(1, { focus: false, announce: false });
  });

  // Primer toque del formulario: FormStart (una vez por sesión).
  root.addEventListener('pointerdown', formStart, { passive: true });
  root.addEventListener('focusin', formStart);

  // Vuelta desde el fallback sin JS con error.
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === '1' && notice) {
    notice.textContent = MESSAGES.envioSinJs;
    notice.hidden = false;
    params.delete('error');
    const qs = params.toString();
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  }

  // ---------- Eventos ----------
  form.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-next]')) next();
    else if (target.closest('[data-back]')) back();
    else if (target.closest('[data-skip]')) {
      if (zonaValue() === 'Otro') return;
      setError('detalle', null);
      completeStep(2);
      showStep(3);
    }
  });

  // Paso 1: al tocar una opción avanza solo; con flechas solo se mueve la selección.
  chips?.addEventListener('keydown', (event) => {
    arrowNav = event.key.startsWith('Arrow');
  });
  chips?.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const viaArrow = arrowNav;
    arrowNav = false;
    setError('zona', null);
    notice?.setAttribute('hidden', '');
    syncOtro();
    if (viaArrow) return;
    window.clearTimeout(advanceTimer);
    advanceTimer = window.setTimeout(() => {
      if (current === 1 && isZona(zonaValue())) next();
    }, AUTO_ADVANCE_MS);
  });
  chips?.addEventListener('change', syncOtro);

  /** Marca una zona del paso 1 desde fuera del formulario; con `advance`, pasa al paso 2. */
  function selectZona(value: string, advance: boolean): void {
    const input = [...form.querySelectorAll<HTMLInputElement>('input[name="zona"]')].find(
      (el) => el.value === value,
    );
    if (!input) return;
    input.checked = true;
    setError('zona', null);
    notice?.setAttribute('hidden', '');
    syncOtro();
    if (!advance) return;
    window.clearTimeout(advanceTimer);
    completeStep(1);
    // El formulario está lejos: cambia de paso sin la animación de altura (que en Safari puede
    // cortar el scroll suave) y baja hasta él en el mismo toque, con el título del paso a la vista.
    showStep(2, { focus: false, transition: false });
    const headerH = document.querySelector<HTMLElement>('[data-header]')?.offsetHeight ?? 0;
    const top = root.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
    steps[1]?.querySelector<HTMLElement>('.step-title')?.focus({ preventScroll: true });
  }

  // Sección "¿Qué te duele?": baja al formulario con la zona marcada y ya en el paso 2. El enlace
  // "¿Otra duda?" hace lo mismo con "Otro" (sin JS, solo baja al formulario).
  const zoneCards = document.querySelector<HTMLElement>('[data-zonas]');
  document.getElementById('zonas')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const el = target?.closest<HTMLElement>('[data-zona]');
    if (!el?.dataset.zona) return;
    event.preventDefault();
    formStart();
    selectZona(el.dataset.zona, true);
  });

  // Visitas del anuncio del test de hombro: "Hombro" ya marcado en el paso 1 (sin avanzar).
  function preselect(): void {
    const zona = adVariantByKey(document.documentElement.dataset.ad)?.zona;
    if (!zona) return;
    if (!zonaValue()) selectZona(zona, false);
    // Y su tarjeta destacada con "Tu zona" (sin pulsarla).
    const card = [...(zoneCards?.querySelectorAll<HTMLElement>('[data-zona]') ?? [])].find(
      (el) => el.dataset.zona === zona,
    );
    if (card && !card.classList.contains('is-suggested')) {
      card.classList.add('is-suggested');
      card.setAttribute(
        'aria-label',
        `${card.getAttribute('aria-label')?.replace(':', ' (tu zona):') ?? zona}`,
      );
    }
  }
  preselect();

  // Enter avanza (Shift+Enter hace salto de línea en el textarea).
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const t = event.target;
    if (t instanceof HTMLTextAreaElement) {
      if (event.shiftKey) return;
    } else if (!(t instanceof HTMLInputElement)) {
      return; // botones y enlaces: comportamiento nativo
    }
    event.preventDefault();
    next();
  });

  detalle?.addEventListener('input', () => {
    if (countValue) countValue.textContent = String(detalle.value.length);
    if (validateDetalle(detalle.value, zonaValue())) setError('detalle', null);
  });
  nombre?.addEventListener('input', () => {
    if (validateNombre(nombre.value)) setError('nombre', null);
  });
  telefono?.addEventListener('input', () => {
    if (normalizePhone(telefono.value, prefijo?.value ?? '+34')) setError('telefono', null);
  });
  // Número pegado o autocompletado con +34 (o 0034): el prefijo va a su casilla.
  const splitSpanish = () => {
    if (!telefono || !prefijo) return;
    const m = telefono.value.trim().match(/^(?:\+|00)\s*34[\s.-]*([6-9][\d\s.-]{8,})$/);
    if (!m?.[1] || !normalizePhone(m[1], '+34')) return;
    prefijo.value = '+34';
    telefono.value = m[1].trim();
    setError('telefono', null);
  };
  telefono?.addEventListener('change', splitSpanish);
  telefono?.addEventListener('paste', () => window.setTimeout(splitSpanish, 0));
  prefijo?.addEventListener('input', () => {
    if (normalizePhone(telefono?.value ?? '', prefijo.value)) setError('telefono', null);
  });
  consent?.addEventListener('change', () => {
    if (consent.checked) setError('consentimiento', null);
  });

  // ---------- Envío ----------
  function setSubmitting(on: boolean): void {
    submitting = on;
    if (submitBtn) {
      submitBtn.disabled = on;
      submitBtn.setAttribute('aria-busy', String(on));
    }
    if (spinner) spinner.hidden = !on;
    if (submitLabel && on) submitLabel.textContent = 'Enviando…';
  }

  function buildPayload(): LeadPayload {
    const attribution = getAttribution();
    const zona = zonaValue();
    return {
      zona: zona as LeadPayload['zona'],
      detalle: (detalle?.value ?? '').trim().slice(0, LIMITS.detalleMax),
      nombre: (nombre?.value ?? '').trim().replace(/\s+/g, ' '),
      telefono: normalizePhone(telefono?.value ?? '', prefijo?.value ?? '+34') ?? '',
      consentimiento_salud: consent?.checked === true,
      consentimiento_marketing: hasMarketingConsent(),
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_term: attribution.utm_term,
      fbclid: attribution.fbclid,
      landing_url: `${window.location.origin}${window.location.pathname}`,
      referrer: attribution.referrer,
      device: detectDevice(),
      event_id: eventId,
      website: honeypot?.value ?? '',
      started_at: startedAt,
      submitted_at: Date.now(),
    };
  }

  /** Lead para la API de conversiones (/api/lead-capi), sin esperar respuesta. */
  function sendCapi(payload: LeadPayload, sig: string | undefined): void {
    if (!sig) return; // sin firma (servidor sin secreto) no hay Lead de servidor
    const attribution = getAttribution();
    const body = JSON.stringify({
      event_id: payload.event_id,
      nombre: payload.nombre,
      telefono: payload.telefono,
      fbc: readCookie('_fbc'),
      fbp: readCookie('_fbp'),
      fbclid: attribution.fbclid,
      fbclid_ts: attribution.fbclid_ts || null,
      event_source_url: payload.landing_url,
      consent_marketing: payload.consentimiento_marketing,
      sig,
    });
    // text/plain: tipo "simple", que sendBeacon envía en todos los navegadores.
    const type = 'text/plain;charset=UTF-8';
    try {
      if (navigator.sendBeacon?.('/api/lead-capi', new Blob([body], { type }))) return;
    } catch {
      // sendBeacon no disponible o rechazado: fetch con keepalive
    }
    void fetch('/api/lead-capi', {
      method: 'POST',
      headers: { 'content-type': type },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined);
  }

  /** Gracias dentro de la tarjeta; en móvil abre WhatsApp a los 1,5 s. */
  function showThanks(payload: LeadPayload, leadAt: number): void {
    window.clearTimeout(heightTimer);
    root.classList.remove('is-resizing');
    root.style.height = '';
    form.hidden = true;
    if (progress) progress.hidden = true;
    notice?.setAttribute('hidden', '');
    const auto = mobile && Boolean(waNumber);
    if (doneTitle) doneTitle.textContent = `Gracias, ${payload.nombre.slice(0, LIMITS.nombreMax)}.`;
    if (doneText) {
      doneText.textContent = auto
        ? 'Te abro WhatsApp para que me escribas ya.'
        : 'Te escribo por WhatsApp para agendar la videollamada de valoración. Si prefieres adelantarte, escríbeme tú.';
    }
    if (doneWa && waNumber) {
      doneWa.href = waLink(thanksMessage(payload));
      doneWa.hidden = false;
    }
    if (done) done.hidden = false;
    root.classList.add('is-done');
    doneTitle?.focus({ preventScroll: true });
    const rect = root.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight) {
      root.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
    trackEvent('lead_thankyou_view');
    if (!auto || !doneWa) return;

    // Al menos 800 ms después del Lead del Pixel, para que salga antes de cambiar de app.
    const delay = Math.max(WA_AUTO_MS, leadAt ? WA_AFTER_LEAD_MS - (Date.now() - leadAt) : 0);
    const contact = window.setTimeout(() => {
      pixelTrack('Contact', { content_category: 'gracias-auto' });
      trackEvent('whatsapp_auto');
    }, delay - 300);
    const open = window.setTimeout(() => {
      window.location.href = doneWa.href;
    }, delay);
    // Si la persona pulsa el botón antes, no se abre dos veces (ni se cuenta como automático).
    doneWa.addEventListener(
      'click',
      () => {
        window.clearTimeout(contact);
        window.clearTimeout(open);
      },
      { once: true },
    );
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || sent) return;
    trackEvent('form_submit');

    for (let step = 1; step <= total; step += 1) {
      if (!validateStep(step, true)) {
        if (step !== current) showStep(step);
        firstInvalidField(step)?.focus();
        reportError(step, invalidField(step));
        return;
      }
    }
    completeStep(total);

    const payload = buildPayload();
    if (formError) formError.hidden = true;
    setSubmitting(true);

    type LeadResponse = { ok?: boolean; error?: string; sig?: string };
    let data: LeadResponse | null;
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 20000);
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'same-origin',
      });
      window.clearTimeout(timer);
      data = (await res.json().catch(() => null)) as LeadResponse | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `http_${res.status}`);
    } catch (error) {
      setSubmitting(false);
      if (submitLabel) submitLabel.textContent = 'Reintentar el envío';
      if (formError) {
        const text = formError.querySelector<HTMLElement>('[data-form-error-text]');
        if (text) text.textContent = MESSAGES.envio;
        // El enlace de WhatsApp lleva lo escrito, para mandarlo con un toque.
        if (formErrorWa && waNumber) {
          formErrorWa.href = waLink(errorMessage(payload));
          formErrorWa.hidden = false;
        }
        formError.hidden = false;
      }
      const reason =
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'timeout'
            : error.message
          : 'unknown';
      reportError(total, 'envio', reason.slice(0, 48));
      return;
    }

    sent = true;
    trackEvent('lead');
    // Lead del Pixel (una vez por event_id) y Lead de servidor, con el mismo event_id.
    const leadSent = await trackLead(payload.event_id, {
      telefono: payload.telefono,
      nombre: payload.nombre,
    });
    sendCapi(payload, data?.sig);
    showThanks(payload, leadSent ? Date.now() : 0);
  });
}

const root = document.querySelector<HTMLElement>('[data-form-root]');
const form = document.getElementById('lead-form');
if (root && form instanceof HTMLFormElement) init(root, form);
