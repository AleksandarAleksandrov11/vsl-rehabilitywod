/**
 * Configuración central de la landing: datos de contacto, redes, vídeo y datos legales.
 * Cambiando este archivo se actualiza toda la web (cabecera, footer, SEO, legales y WhatsApp).
 */

const env = import.meta.env;

export const CONFIG = {
  /** Dominio de la landing. En Vercel se fija con la variable SITE_URL. */
  siteUrl: String(env.SITE_URL ?? 'https://vsl.rehabilitywod.com').replace(/\/+$/, ''),
  pixelId: String(env.PUBLIC_META_PIXEL_ID ?? '1433154668778788'),
  /** Teléfono de contacto y de WhatsApp (el mismo en toda la web). */
  whatsapp: '34640995494',
  telefono: '+34 640 99 54 94',
  email: 'info@rehabilitywod.com',
  instagram: 'https://www.instagram.com/rehability_wod/',
  instagramHandle: '@rehability_wod',
  tiktok: 'https://www.tiktok.com/@rehability_wod',
  facebook: 'https://www.facebook.com/share/18RvRfV4Ec/',
  vslYoutubeId: 'V3AgSalCNJs',
  vslMinutes: 7,
  vslTitle: '¿Por qué sigues con dolor al entrenar CrossFit?',

  legal: {
    titular: 'GERARD BARRANTES BAUTISTA',
    titularNombre: 'Gerard Barrantes Bautista',
    nombreComercial: 'RehabilityWOD',
    nif: '48010022Y',
    domicilio: 'Bloque Cuba, Escalera B, 1º 3ª, Sant Pere i Sant Pau, 43007 Tarragona',
    ciudad: 'Tarragona',
    codigoPostal: '43007',
    pais: 'ES',
    telefono: '640 99 54 94',
    telefonoE164: '+34640995494',
    email: 'info@rehabilitywod.com',
    actividad: 'Fisioterapia y readaptación online',
    ultimaActualizacion: 'Octubre de 2026',
  },
} as const;

export const SEO = {
  title: 'Fisioterapia online para atletas de CrossFit | RehabilityWOD',
  description:
    'Recupérate de tu lesión sin dejar de entrenar. Plan a medida, seguimiento diario y videollamada de valoración. +120 atletas recuperados.',
} as const;

export const whatsappLink = (text?: string) =>
  `https://wa.me/${CONFIG.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Mensaje con el que se abre WhatsApp desde los botones de la web. */
export const WHATSAPP_TEXT = 'Hola Gerard, quiero información sobre la valoración.';
