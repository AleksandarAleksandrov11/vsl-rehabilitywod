/**
 * Servidor local para el QA. Emula lo que hace Vercel en producción:
 * - sirve dist/client con cleanUrls y trailingSlash: false,
 * - aplica las cabeceras (CSP incluida) y redirecciones de vercel.json,
 * - pasa /api/* al handler de Astro (build con ASTRO_ADAPTER=node),
 * - responde /_vercel/insights y /_vercel/speed-insights (en Vercel los sirve la plataforma).
 *
 * @astrojs/vercel no admite `astro preview`; por eso existe este servidor.
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib';
import { pathToRegexp } from 'path-to-regexp';

const ROOT = process.cwd();
const CLIENT = join(ROOT, 'dist/client');
const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '127.0.0.1';

const vercel = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const { handler } = await import(join(ROOT, 'dist/server/entry.mjs'));

const headerRules = (vercel.headers ?? []).map((rule) => ({
  re: pathToRegexp(rule.source),
  headers: rule.headers,
}));
const redirectRules = (vercel.redirects ?? []).map((rule) => ({
  re: pathToRegexp(rule.source),
  destination: rule.destination,
  status: rule.statusCode ?? (rule.permanent === false ? 307 : 308),
}));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function applyHeaders(pathname, res) {
  for (const rule of headerRules) {
    if (!rule.re.test(pathname)) continue;
    for (const { key, value } of rule.headers) res.setHeader(key, value);
  }
}

async function fileFor(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [join(CLIENT, safe)];
  if (!extname(safe))
    candidates.push(join(CLIENT, `${safe}.html`), join(CLIENT, safe, 'index.html'));
  for (const file of candidates) {
    if (!file.startsWith(CLIENT)) continue;
    try {
      const s = await stat(file);
      if (s.isFile()) return file;
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

// Como Vercel: los recursos de texto se sirven comprimidos (brotli o gzip).
const COMPRESSIBLE = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.webmanifest',
  '.xml',
  '.txt',
  '.svg',
]);
const cache = new Map();

async function sendFile(req, res, file, status = 200) {
  res.statusCode = status;
  const ext = extname(file);
  res.setHeader('content-type', TYPES[ext] ?? 'application/octet-stream');
  const accept = String(req.headers['accept-encoding'] ?? '');
  const enc = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
  if (!enc || !COMPRESSIBLE.has(ext)) {
    createReadStream(file).pipe(res);
    return;
  }
  const key = `${enc}:${file}`;
  let body = cache.get(key);
  if (!body) {
    const raw = await readFile(file);
    body =
      enc === 'br'
        ? brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9 } })
        : gzipSync(raw, { level: 9 });
    cache.set(key, body);
  }
  res.setHeader('content-encoding', enc);
  res.setHeader('vary', 'Accept-Encoding');
  res.setHeader('content-length', body.length);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  let { pathname } = url;

  applyHeaders(pathname, res);

  // Scripts de Vercel Analytics / Speed Insights (los sirve la plataforma en producción).
  if (pathname.startsWith('/_vercel/')) {
    if (req.method === 'GET' && pathname.endsWith('.js')) {
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.end('/* stub local de Vercel: los eventos quedan en window.vaq */');
    } else {
      res.statusCode = 204;
      res.end();
    }
    return;
  }

  for (const rule of redirectRules) {
    if (rule.re.test(pathname)) {
      res.statusCode = rule.status;
      res.setHeader('location', rule.destination);
      res.end();
      return;
    }
  }

  // trailingSlash: false
  if (pathname.length > 1 && pathname.endsWith('/')) {
    res.statusCode = 308;
    res.setHeader('location', pathname.replace(/\/+$/, '') + url.search);
    res.end();
    return;
  }

  // cleanUrls: /pagina.html → /pagina
  if (pathname.endsWith('.html')) {
    res.statusCode = 308;
    res.setHeader('location', pathname.replace(/(\/index)?\.html$/, '') || '/');
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    handler(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end();
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const file = await fileFor(pathname);
  if (file) {
    await sendFile(req, res, file);
    return;
  }
  await sendFile(req, res, join(CLIENT, '404.html'), 404);
});

server.listen(PORT, HOST, () => {
  console.log(`QA server: http://${HOST}:${PORT} (LEAD_MOCK=${process.env.LEAD_MOCK ?? ''})`);
});
