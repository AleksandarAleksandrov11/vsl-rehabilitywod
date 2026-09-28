/**
 * Configuración central de la landing.
 * Todo lo que Gerard puede querer cambiar sin tocar componentes está aquí.
 * Los `TODO(Gerard)` se listan también en el README.
 */

const env = import.meta.env;

export const CONFIG = {
  // TODO(Gerard): apuntar el dominio a Vercel y confirmar la URL final (variable SITE_URL).
  siteUrl: String(env.SITE_URL ?? 'https://rehabilitywod.com').replace(/\/+$/, ''),
  pixelId: String(env.PUBLIC_META_PIXEL_ID ?? '1433154668778788'),
  // TODO(Gerard): confirmar el número de WhatsApp. La web actual enlaza
  // wa.me/640995494 (sin prefijo 34, el enlace no funciona) y el aviso legal da el 636748147.
  whatsapp: '34640995494',
  email: 'info@rehabilitywod.com',
  instagram: 'https://instagram.com/rehability_wod',
  instagramHandle: '@rehability_wod',
  vslYoutubeId: 'V3AgSalCNJs',
  vslMinutes: 7,

  // TODO(Gerard): crear el Apps Script y poner GOOGLE_SCRIPT_URL y LEAD_SECRET en Vercel
  // (pasos en apps-script/README-apps-script.md). Sin ellos, /api/lead funciona en modo mock.

  // TODO(Gerard): sustituir src/assets/images/gerard-about.jpg por una foto definitiva
  // (vertical 4:5, 1000 px de ancho como mínimo). La actual es un fotograma de la VSL.

  // Encuadre de la foto del hero sin reexportarla (0 = izquierda/arriba, 1 = derecha/abajo).
  // TODO(Gerard): sustituir src/assets/images/gerard-hero.jpg por la foto definitiva
  // (horizontal, 1920 px de ancho como mínimo) y ajustar estos valores si hace falta.
  heroFocal: { x: 0.44, y: 0.3 },

  legal: {
    titular: 'GERARD BARRANTES BAUTISTA',
    titularNombre: 'Gerard Barrantes Bautista',
    nombreComercial: 'RehabilityWOD',
    nif: '48010022Y',
    domicilio: 'Bloque Cuba, Escalera B, 1º 3ª, Sant Pere i Sant Pau, 43007 Tarragona',
    ciudad: 'Tarragona',
    codigoPostal: '43007',
    pais: 'ES',
    telefono: '636 748 147',
    telefonoE164: '+34636748147',
    email: 'info@rehabilitywod.com',
    actividad: 'Fisioterapia y readaptación online',
    // TODO(Gerard): que un profesional revise los textos legales antes de publicar.
    ultimaActualizacion: 'Septiembre de 2026',
  },
} as const;

export const SEO = {
  title: 'Fisioterapia online para atletas de CrossFit | RehabilityWOD',
  description:
    'Recupérate de tu lesión sin dejar de entrenar. Plan a medida, seguimiento diario y valoración inicial gratuita. +120 atletas recuperados.',
} as const;

export const whatsappLink = (text?: string) =>
  `https://wa.me/${CONFIG.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
