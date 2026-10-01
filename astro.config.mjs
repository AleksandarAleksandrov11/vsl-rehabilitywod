// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

// astro.config se evalúa antes de cargar .env: se lee a mano (Vercel lo pasa por process.env).
const fileEnv = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const SITE_URL = (process.env.SITE_URL || fileEnv.SITE_URL || 'https://vsl.rehabilitywod.com').replace(
  /\/+$/,
  '',
);

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  build: {
    // (El adaptador de Vercel fuerza format: 'directory': /aviso-legal → /aviso-legal/index.html.)
    // Todo el CSS va en un solo archivo externo: sin <style> en línea, CSP más estricta.
    inlineStylesheets: 'never',
  },
  // @astrojs/vercel no admite `astro preview`. Para el QA local (ASTRO_ADAPTER=node) se compila
  // el mismo código con @astrojs/node y se sirve con scripts/qa-server.mjs, que aplica vercel.json.
  adapter:
    process.env.ASTRO_ADAPTER === 'node'
      ? (await import('@astrojs/node')).default({ mode: 'middleware' })
      : vercel(),
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/gracias'),
    }),
  ],
  security: {
    // El checkOrigin de Astro compara Origin con la URL que reconstruye el servidor, y en Vercel
    // (sin allowedDomains) esa URL sale como "localhost": rechazaría el formulario sin JS.
    // /api/lead hace su propia comprobación de origen (ver sameOrigin en src/pages/api/lead.ts).
    checkOrigin: false,
  },
  env: {
    schema: {
      GOOGLE_SCRIPT_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      LEAD_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      LEAD_MOCK: envField.string({ context: 'server', access: 'secret', optional: true }),
      META_CAPI_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Nunca incrustar scripts ni recursos como data:/inline: así la CSP no necesita 'unsafe-inline'.
      assetsInlineLimit: 0,
      // Un solo CSS para todo el sitio (≈ 17 KB comprimido): una petición bloqueante en vez de dos.
      cssCodeSplit: false,
    },
  },
});
