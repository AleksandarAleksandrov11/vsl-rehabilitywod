/**
 * Mensaje del hero adaptado al anuncio de Meta del que viene la visita (parámetro utm_content).
 * Solo cambian el antetítulo (línea pequeña sobre el H1) y el subtítulo; el H1 y los botones son
 * siempre los mismos. Sin utm_content, o con un valor que no está aquí, el hero queda como siempre.
 *
 * `key` es lo que se marca en <html data-ad="..."> (solo letras y números).
 * `zona`: zona que se deja marcada en el paso 1 del formulario (sin avanzar de paso).
 *
 * Si se añade o cambia un anuncio aquí, el script en línea del <head> cambia: hay que actualizar su
 * hash en la CSP de vercel.json con `npm run build && node scripts/csp-hash.mjs --write`
 * (un test lo comprueba).
 */
export type AdVariant = {
  utm: string;
  key: string;
  eyebrow: string;
  sub: string;
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
    sub: 'Formulario de 30 segundos → llamada corta → valoración con tests → plan semanal con criterios claros de alta.',
  },
];

export const adVariantByKey = (key: string | undefined) =>
  key ? AD_VARIANTS.find((v) => v.key === key) : undefined;
