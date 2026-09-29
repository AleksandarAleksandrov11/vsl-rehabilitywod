/**
 * Utilidades de imagen: AVIF (calidad 60) y WebP (calidad 78) con srcset, generados en build
 * por astro:assets. Nunca se sirve una imagen por encima de su tamaño natural.
 */
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

export const QUALITY = { avif: 60, webp: 78 } as const;
export const WIDTHS = {
  portrait: [480, 768, 1080, 1440],
  landscape: [768, 1280, 1920, 2560],
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
): Promise<ResponsiveSource> {
  const usable = widths.filter((w) => w <= src.width);
  const list = usable.length ? usable : [src.width];
  const [avif, webp] = await Promise.all([
    getImage({ src, widths: list, format: 'avif', quality: QUALITY.avif }),
    getImage({ src, widths: list, format: 'webp', quality: QUALITY.webp }),
  ]);
  const fallbackWidth = list.find((w) => w >= 1280) ?? list[list.length - 1] ?? src.width;
  const fallback = await getImage({
    src,
    width: fallbackWidth,
    format: 'webp',
    quality: QUALITY.webp,
  });
  return {
    avif: avif.srcSet.attribute,
    webp: webp.srcSet.attribute,
    fallback: fallback.src,
    width: src.width,
    height: src.height,
  };
}
