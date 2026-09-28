/**
 * Formulario de valoración: una pregunta por pantalla.
 * Mejora progresiva sobre el <form> nativo (que sin JS envía a /api/lead).
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
import { isPixelActive, track as pixelTrack } from './pixel';
import { trackEvent } from './tracking';

const NAME_KEY = 'rw_nombre';
const AUTO_ADVANCE_MS = 250;
const LEAVE_MS = 280;

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
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function init(root: HTMLElement, form: HTMLFormElement): void {
  const steps = [...form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-step]')];
  const total = steps.length;
  const bar = root.querySelector<HTMLElement>('[data-progress-bar]');
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

  const startedAt = Date.now();
  const eventId = uuidv4();
  const completed = new Set<number>();
  let current = 1;
  let submitting = false;
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
      setError('telefono', phoneOk ? null : MESSAGES.telefono);
      setError('consentimiento', consentOk ? null : MESSAGES.consentimiento);
    }
    return phoneOk && consentOk;
  }

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

  function showStep(step: number, { focus = true, announce = true } = {}): void {
    const previous = steps[current - 1];
    const dir = step >= current ? 1 : -1;
    const animate = announce && !reduceMotion() && previous !== undefined && step !== current;
    // Posición del paso que sale, antes de mostrar el nuevo (al ir hacia atrás lo desplazaría).
    const previousTop = previous?.offsetTop ?? 0;
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
    if (bar) bar.style.transform = `scaleX(${step / total})`;
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
    if (step === 1) pixelTrack('FormStart');
  }

  function next(): void {
    window.clearTimeout(advanceTimer);
    if (!validateStep(current, true)) {
      firstInvalidField(current)?.focus();
      trackEvent('form_error', { reason: `validation_step_${current}` });
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

  // Altura estable: la tarjeta mide lo que el paso más alto (se recalcula al cambiar el ancho).
  // Se mide de forma intrínseca (paso + su barra de navegación + partes fijas de la tarjeta):
  // el <form> se estira con flex y su alto no sirve para comparar pasos.
  function fitHeight(): void {
    const fixed = root.getBoundingClientRect().height - form.getBoundingClientRect().height;
    let max = 0;
    for (const fs of steps) {
      for (const other of steps) other.hidden = other !== fs;
      applyNav(Number(fs.dataset.step));
      const h = fs.getBoundingClientRect().height + (nav?.getBoundingClientRect().height ?? 0);
      max = Math.max(max, h);
    }
    for (const fs of steps) fs.hidden = Number(fs.dataset.step) !== current;
    applyNav(current);
    root.style.minHeight = `${Math.ceil(fixed + max)}px`;
  }
  fitHeight();
  // Las fuentes cambian la altura de los pasos: se vuelve a medir cuando terminan de cargar
  // (fonts.ready puede resolverse antes de que empiecen a cargarse) y al final de la carga.
  const refit = () => {
    if (!root.querySelector('.is-leaving')) fitHeight();
  };
  void document.fonts?.ready.then(refit);
  document.fonts?.addEventListener('loadingdone', refit);
  window.addEventListener('load', refit, { once: true });
  let lastWidth = window.innerWidth;
  window.addEventListener(
    'resize',
    () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      fitHeight();
    },
    { passive: true },
  );
  showStep(1, { focus: false, announce: false });

  // Vuelta desde el fallback sin JS con error.
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === '1' && notice) {
    notice.textContent = MESSAGES.envio;
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    trackEvent('form_submit');

    for (let step = 1; step <= total; step += 1) {
      if (!validateStep(step, true)) {
        if (step !== current) showStep(step);
        firstInvalidField(step)?.focus();
        trackEvent('form_error', { reason: `validation_step_${step}` });
        return;
      }
    }
    completeStep(total);

    const payload = buildPayload();
    if (formError) formError.hidden = true;
    setSubmitting(true);

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'same-origin',
      });
      window.clearTimeout(timer);
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `http_${res.status}`);

      try {
        window.sessionStorage.setItem(NAME_KEY, payload.nombre);
      } catch {
        // sin sessionStorage: /gracias mostrará "Recibido."
      }
      trackEvent('lead');
      // Lead con el mismo eventID que el lead del servidor (deduplicación con la CAPI).
      pixelTrack('Lead', {}, { eventID: payload.event_id });
      // Margen para que salgan las peticiones de analítica antes de cambiar de página.
      await wait(isPixelActive() ? 600 : 150);
      window.location.assign('/gracias');
    } catch (error) {
      setSubmitting(false);
      if (submitLabel) submitLabel.textContent = 'Reintentar el envío';
      if (formError) {
        formError.textContent = MESSAGES.envio;
        formError.hidden = false;
      }
      const reason =
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'timeout'
            : error.message
          : 'unknown';
      trackEvent('form_error', { reason: reason.slice(0, 48) });
    }
  });
}

const root = document.querySelector<HTMLElement>('[data-form-root]');
const form = document.getElementById('lead-form');
if (root && form instanceof HTMLFormElement) init(root, form);
