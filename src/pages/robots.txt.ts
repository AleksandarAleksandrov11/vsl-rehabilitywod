import type { APIRoute } from 'astro';

// Sin sitemap: la landing es para anuncios y todas las páginas llevan noindex (Base.astro). Se deja
// rastrear para que los buscadores vean ese noindex.
export const GET: APIRoute = () =>
  new Response(['User-agent: *', 'Allow: /', 'Disallow: /api/', ''].join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
