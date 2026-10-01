/**
 * Fotos del hero con dirección de arte: vertical hasta 1023 px y horizontal desde 1024 px.
 * Se calculan una sola vez y las usan Hero.astro (<picture>) y la home (precarga responsive).
 */
import heroMobile from '../assets/photos/hero-mobile.jpg';
import heroDesktop from '../assets/photos/hero-desktop.jpg';
import { WIDTHS, QUALITY_HERO, responsive, type ResponsiveSource } from './images';

export const HERO_MEDIA = {
  mobile: '(max-width: 1023.98px)',
  desktop: '(min-width: 1024px)',
} as const;

let cache: Promise<{ mobile: ResponsiveSource; desktop: ResponsiveSource }> | undefined;

export function heroSources() {
  cache ??= Promise.all([
    responsive(heroMobile, WIDTHS.portrait, QUALITY_HERO),
    responsive(heroDesktop, WIDTHS.landscape, QUALITY_HERO),
  ]).then(([mobile, desktop]) => ({ mobile, desktop }));
  return cache;
}
