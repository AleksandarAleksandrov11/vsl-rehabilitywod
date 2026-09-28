/**
 * Reglas del formulario de valoración. Se comparten entre el cliente (src/scripts/form.ts)
 * y la API (src/pages/api/lead.ts), para que ambos validen exactamente lo mismo.
 */

export const ZONAS = [
  'Hombro',
  'Codo',
  'Muñeca',
  'Espalda / lumbar',
  'Cadera',
  'Rodilla',
  'Tobillo / pie',
  'Otro',
] as const;

export type Zona = (typeof ZONAS)[number];

export const LIMITS = {
  detalleMax: 500,
  detalleMinOtro: 5,
  nombreMin: 2,
  nombreMax: 60,
  minFillMs: 3000,
} as const;

export const MESSAGES = {
  zona: 'Elige una opción para continuar.',
  detalleOtro: 'Cuéntame en pocas palabras qué te pasa (mínimo 5 caracteres).',
  detalleMax: 'Máximo 500 caracteres.',
  nombre: 'Escribe tu nombre (de 2 a 60 caracteres).',
  telefono: 'Revisa el número: 9 cifras que empiecen por 6, 7, 8 o 9, o con prefijo internacional.',
  consentimiento: 'Necesito tu consentimiento para poder valorar tu caso.',
  envio: 'No se ha podido enviar. Inténtalo de nuevo o escríbeme a info@rehabilitywod.com.',
} as const;

export const isZona = (value: unknown): value is Zona =>
  typeof value === 'string' && (ZONAS as readonly string[]).includes(value);

/** Quita espacios de más y caracteres de control. */
export const cleanText = (value: unknown, max = 1000): string =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);

export const validateNombre = (value: string): boolean => {
  const v = value.trim();
  return v.length >= LIMITS.nombreMin && v.length <= LIMITS.nombreMax;
};

export const validateDetalle = (value: string, zona: string): boolean => {
  const v = value.trim();
  if (v.length > LIMITS.detalleMax) return false;
  if (zona === 'Otro') return v.length >= LIMITS.detalleMinOtro;
  return true;
};

const SPANISH_NATIONAL = /^[6-9]\d{8}$/;

/**
 * Normaliza un teléfono a E.164.
 * - Sin "+": número español de 9 cifras que empieza por 6, 7, 8 o 9 (con el prefijo indicado).
 * - Con "+" (o "00"): formato internacional de 8 a 15 cifras. Si es +34, se exige el formato español.
 * Devuelve null si no es válido.
 */
export function normalizePhone(rawNumber: string, rawPrefix = '+34'): string | null {
  let number = String(rawNumber ?? '').replace(/[\s\-.()/]/g, '');
  if (number.startsWith('00')) number = `+${number.slice(2)}`;

  if (number.startsWith('+')) {
    const digits = number.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    if (digits.startsWith('34') && !SPANISH_NATIONAL.test(digits.slice(2))) return null;
    return `+${digits}`;
  }

  if (!/^\d+$/.test(number)) return null;

  let prefix = String(rawPrefix ?? '').replace(/[\s\-()]/g, '');
  if (prefix.startsWith('00')) prefix = `+${prefix.slice(2)}`;
  const prefixDigits = prefix.replace(/^\+/, '') || '34';
  if (!/^\d{1,4}$/.test(prefixDigits)) return null;

  if (prefixDigits === '34') {
    return SPANISH_NATIONAL.test(number) ? `+34${number}` : null;
  }

  const full = `${prefixDigits}${number}`;
  return /^\d{8,15}$/.test(full) ? `+${full}` : null;
}

/** Enmascara un teléfono para los logs: +34******678 */
export const maskPhone = (phone: string): string =>
  phone.length > 6
    ? `${phone.slice(0, 3)}${'*'.repeat(phone.length - 6)}${phone.slice(-3)}`
    : '***';

export type LeadPayload = {
  zona: Zona;
  detalle: string;
  nombre: string;
  telefono: string;
  consentimiento_salud: boolean;
  consentimiento_marketing: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  fbclid: string;
  landing_url: string;
  referrer: string;
  device: 'mobile' | 'tablet' | 'desktop' | '';
  event_id: string;
  website: string;
  started_at: number | null;
  submitted_at: number | null;
};

export const TRACKING_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
] as const;

export type TrackingKey = (typeof TRACKING_KEYS)[number];
