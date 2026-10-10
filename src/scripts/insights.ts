/**
 * Vercel Web Analytics y Speed Insights. Se cargan desde boot.ts cuando la página ya ha
 * terminado de cargar, para no competir con el hero. Speed Insights lee las métricas con
 * observadores "buffered", así que no pierde el FCP ni el LCP por cargarse tarde.
 */
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

inject({ framework: 'astro' });
injectSpeedInsights({ framework: 'astro', route: window.location.pathname });
