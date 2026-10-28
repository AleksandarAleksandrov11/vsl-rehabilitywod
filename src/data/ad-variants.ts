/**
 * Mensaje del hero adaptado al anuncio de Meta del que viene la visita.
 * Solo cambian el antetítulo (línea pequeña sobre el H1) y el subtítulo; el H1 y los botones son
 * siempre los mismos. Sin anuncio reconocido, el hero queda como siempre.
 *
 * Cómo se elige (script en línea del <head>, src/lib/ad-script.ts), por este orden:
 * 1. utm_content reconocido: se normaliza (minúsculas, sin espacios alrededor, "mofu3.0" → "mofu3")
 *    y tiene que coincidir con una `key` con `utm`. "mofu10" no es "mofu1".
 * 2. utm_campaign: si contiene alguna palabra de `campaign` (la primera variante que encaje).
 *    Un utm_content desconocido no anula una campaña reconocida.
 * 3. Lo guardado en sessionStorage (rw_ad) en esta misma visita.
 * 4. El hero de siempre.
 *
 * `key` es lo que se marca en <html data-ad="..."> (solo letras y números).
 * `utm`: valor de utm_content del anuncio (tal como llega, se normaliza).
 * `campaign`: palabras de utm_campaign que eligen esta variante si no hay utm_content reconocido.
 * `sub`: sin él se ve el subtítulo de siempre.
 * `zona`: zona que se deja marcada en el paso 1 del formulario (sin avanzar de paso).
 *
 * Cada `key` necesita su regla en el CSS de src/components/Hero.astro (un test lo comprueba). Si se
 * añade o cambia un anuncio aquí, el script en línea del <head> cambia: hay que actualizar su hash
 * en la CSP de vercel.json con `npm run build && node scripts/csp-hash.mjs --write` (un test lo
 * comprueba).
 */
export type AdVariant = {
  key: string;
  utm?: string;
  campaign?: string[];
  eyebrow: string;
  sub?: string;
  zona?: string;
};

export const AD_VARIANTS: AdVariant[] = [
  {
    utm: 'mofu3.0',
    key: 'mofu3',
    eyebrow: 'Vienes del test de hombro',
    sub: 'Si el hombro te frena en overhead, snatch o kipping, te digo con tests de fuerza y movilidad si está listo para volver.',
    zona: 'Hombro',
  },
  {
    utm: 'mofu1.0',
    key: 'mofu1',
    eyebrow: 'Vienes del vídeo del sistema',
    sub: 'Por qué la lesión vuelve cuando empiezas a entrenar bien, y cómo lo evitamos: plan a medida, seguimiento diario y ajustes cada semana.',
  },
  {
    utm: 'mofu2.0',
    key: 'mofu2',
    eyebrow: 'Vienes del caso de Laura',
    sub: 'Hernias, dolor irradiado, «ya he probado de todo». Así trabajo para que vuelvas a entrenar sin parar del todo.',
  },
  {
    utm: 'bofu2.0',
    key: 'bofu2',
    eyebrow: 'Vienes de los casos de Mariana, Belén y Laura',
    sub: 'Si ya has probado de todo, en la valoración te digo si puedo ayudarte o no.',
  },
  {
    utm: 'bofu1.0',
    key: 'bofu1',
    eyebrow: 'Así empieza todo',
    sub: 'Formulario de 30 segundos → videollamada de valoración con tests → plan semanal con criterios claros de alta.',
  },
  {
    key: 'descubrir',
    campaign: ['descubrir', 'tofu'],
    eyebrow: 'Fisioterapia online para atletas de CrossFit',
  },
  {
    key: 'cierre',
    campaign: ['mofu', 'bofu', 'cierre'],
    eyebrow: 'Reserva tu valoración',
    sub: 'Formulario de 30 segundos y videollamada de valoración. Más de 120 atletas recuperados.',
  },
];

export const adVariantByKey = (key: string | undefined) =>
  key ? AD_VARIANTS.find((v) => v.key === key) : undefined;

/** Normalización de utm_content (la misma que hace el script del <head>). */
export const UTM_CONTENT_RE = /^(tofu|mofu|bofu)\s*(\d+(?:\.\d+)?)/;
export function normalizeUtmContent(value: string): string {
  const m = value.toLowerCase().trim().match(UTM_CONTENT_RE);
  return m ? `${m[1]}${m[2]}`.replace(/\.0+$/, '') : '';
}
