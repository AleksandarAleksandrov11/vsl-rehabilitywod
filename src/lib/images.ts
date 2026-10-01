/**
 * Utilidades de imagen: AVIF (calidad 60) y WebP (calidad 78) con srcset, generados en build
 * por astro:assets. Nunca se sirve una imagen por encima de su tamaño natural.
 */
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

export const QUALITY = { avif: 60, webp: 78 } as const;
/** Fondos casi tapados por un velo: la calidad baja no se nota y pesan la mitad. */
export const QUALITY_VEILED = { avif: 42, webp: 62 } as const;
/** Hero: va bajo un degradado oscuro, así que admite algo menos de calidad sin notarse. */
export const QUALITY_HERO = { avif: 50, webp: 70 } as const;
export const WIDTHS = {
  // 960 evita servir 1080 px en los móviles de 390-430 px con pantalla retina.
  portrait: [480, 768, 960, 1080, 1440],
  landscape: [768, 1280, 1920, 2560],
  /** Capturas de la app: como mucho 280 px en pantalla (840 px a 3x). */
  appShot: [320, 480, 640, 840],
} as const;

export type ResponsiveSource = {
  avif: string;
  webp: string;
  /** WebP más pequeño que cubre ~1280 px: el src del <img>. */
  fallback: string;
  width: number;
  height: number;
};

export async function responsive(
  src: ImageMetadata,
  widths: readonly number[],
  quality: { avif: number; webp: number } = QUALITY,
): Promise<ResponsiveSource> {
  const usable = widths.filter((w) => w <= src.width);
  const list = usable.length ? usable : [src.width];
  const [avif, webp] = await Promise.all([
    getImage({ src, widths: list, format: 'avif', quality: quality.avif }),
    getImage({ src, widths: list, format: 'webp', quality: quality.webp }),
  ]);
  const fallbackWidth = list.find((w) => w >= 1280) ?? list[list.length - 1] ?? src.width;
  const fallback = await getImage({
    src,
    width: fallbackWidth,
    format: 'webp',
    quality: quality.webp,
  });
  return {
    avif: avif.srcSet.attribute,
    webp: webp.srcSet.attribute,
    fallback: fallback.src,
    width: src.width,
    height: src.height,
  };
}
