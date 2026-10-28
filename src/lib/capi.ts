/**
 * API de conversiones de Meta (solo servidor). La usan /api/lead-capi (envíos con JS: el navegador
 * la llama justo después del OK de /api/lead) y /api/lead (envíos sin JS, tras guardar el lead).
 * - Un evento Lead por cada lead, haya aceptado o no las cookies, con el mismo event_id que el Lead
 *   del Pixel (Meta los deduplica).
 * - user_data: teléfono (ph), nombre (fn) y apellidos (ln) en SHA-256, external_id (hash del
 *   teléfono), país (hash de "es" con prefijo +34), user agent, IP, fbc y, con cookies de marketing
 *   aceptadas, fbp. Nunca la zona ni el detalle (datos de salud).
 * - fbc: la cookie _fbc (con consentimiento) o, si la visita llegó con fbclid, fb.1.<ms>.<fbclid>
 *   con el momento en que se vio el fbclid por primera vez.
 * - Firma: /api/lead devuelve sig = HMAC-SHA256(event_id + "." + telefono) con
 *   CAPI_SIGNING_SECRET (o, si no existe, LEAD_SECRET); /api/lead-capi solo envía si cuadra.
 * - test_event_code ("Probar eventos") solo fuera de producción.
 * - Sin META_CAPI_TOKEN no se envía nada; en el QA (CAPI_MOCK_FILE) se guarda el evento en un archivo.
 * Los logs no llevan datos personales.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  CAPI_SIGNING_SECRET,
  LEAD_SECRET,
  META_CAPI_TOKEN,
  META_TEST_EVENT_CODE,
} from 'astro:env/server';
import { CONFIG } from '../config';
import { readCookie } from './http';

const META_GRAPH_VERSION = 'v24.0';
export const CAPI_TIMEOUT_MS = 4000;

const FBC_RE = /^fb\.\d\.\d{10,13}\.[\w-]{6,500}$/;
const FBP_RE = /^fb\.\d\.\d{10,13}\.\d{5,25}$/;
const FBCLID_RE = /^[\w-]{6,500}$/;
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

export type CapiLead = {
  event_id: string;
  nombre: string;
  /** E.164, el mismo que se guarda en la hoja. */
  telefono: string;
  fbc?: string;
  fbp?: string;
  fbclid?: string;
  /** Milisegundos: primera vez que se vio el fbclid en esta sesión. */
  fbclid_ts?: number | null;
  event_source_url?: string;
  consent_marketing?: boolean;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Normalización de Meta para nombres: minúsculas, sin signos ni espacios. */
const normName = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}]/gu, '');

// ---------- Firma ----------

const signingSecret = () => CAPI_SIGNING_SECRET || LEAD_SECRET || '';

/** Firma del lead que /api/lead devuelve al navegador. null si no hay secreto configurado. */
export function signLead(eventId: string, telefono: string): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update(`${eventId}.${telefono}`).digest('hex');
}

/** Comparación en tiempo constante. */
export function verifySig(eventId: string, telefono: string, sig: unknown): boolean {
  const expected = signLead(eventId, telefono);
  if (!expected || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

// ---------- Un solo envío por event_id (en la memoria de cada instancia, 30 min) ----------

const SEEN_TTL_MS = 30 * 60 * 1000;
const SEEN_MAX = 5000;
const seen = new Map<string, number>();

/** true la primera vez que llega este event_id; false si ya se envió. */
export function firstTime(eventId: string): boolean {
  const now = Date.now();
  for (const [id, expires] of seen) {
    if (expires > now && seen.size < SEEN_MAX) break; // ordenado por inserción: el resto es más nuevo
    seen.delete(id);
  }
  if (seen.has(eventId)) return false;
  seen.set(eventId, now + SEEN_TTL_MS);
  return true;
}

// ---------- Evento ----------

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip')?.trim() || '';
  return IP_RE.test(ip) ? ip : undefined;
}

function sourceUrl(value: string | undefined): string {
  try {
    const u = new URL(value ?? '');
    if (u.protocol === 'https:' || u.protocol === 'http:') return `${u.origin}${u.pathname}`;
  } catch {
    // URL no válida
  }
  return `${CONFIG.siteUrl}/`;
}

function fbcFor(lead: CapiLead, cookies: string | null, withCookies: boolean): string | undefined {
  const stored = withCookies ? [lead.fbc, readCookie(cookies, '_fbc')] : [];
  const fbc = stored.find((v) => v && FBC_RE.test(v));
  if (fbc) return fbc;
  if (!lead.fbclid || !FBCLID_RE.test(lead.fbclid)) return undefined;
  const ts = Number(lead.fbclid_ts);
  const valid = Number.isFinite(ts) && ts > 1.5e12 && ts <= Date.now() + 60_000;
  return `fb.1.${valid ? Math.round(ts) : Date.now()}.${lead.fbclid}`;
}

export function buildLeadEvent(lead: CapiLead, request: Request) {
  const cookies = request.headers.get('cookie');
  // Identificadores de cookies (fbp y la cookie _fbc) solo con las cookies de marketing aceptadas.
  const withCookies = lead.consent_marketing === true;
  const fbp = withCookies
    ? [lead.fbp, readCookie(cookies, '_fbp')].find((v) => v && FBP_RE.test(v))
    : undefined;
  const fbc = fbcFor(lead, cookies, withCookies);

  const phone = lead.telefono.replace(/\D/g, '');
  const [first = '', ...rest] = lead.nombre.trim().split(/\s+/);
  const fn = normName(first);
  const ln = normName(rest.join(''));
  const userData: Record<string, unknown> = {
    ph: [sha256(phone)],
    external_id: [sha256(phone)],
    client_user_agent: request.headers.get('user-agent') ?? undefined,
    client_ip_address: clientIp(request),
  };
  if (fn) userData.fn = [sha256(fn)];
  if (ln) userData.ln = [sha256(ln)];
  if (lead.telefono.startsWith('+34')) userData.country = [sha256('es')];
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  return {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: lead.event_id,
    event_source_url: sourceUrl(lead.event_source_url),
    action_source: 'website',
    user_data: userData,
  };
}

/** Envía el Lead a Meta (como mucho 4 s). Nunca lanza error. */
export async function sendLeadEvent(lead: CapiLead, request: Request): Promise<void> {
  try {
    const body: { data: unknown[]; test_event_code?: string } = {
      data: [buildLeadEvent(lead, request)],
    };
    // Si llegara a producción, los Lead irían a "Probar eventos" y Meta no los usaría para
    // optimizar la campaña.
    const testCode = META_TEST_EVENT_CODE?.trim();
    if (testCode && process.env.VERCEL_ENV !== 'production') body.test_event_code = testCode;

    const token = META_CAPI_TOKEN;
    if (!token) {
      // Solo para el QA local: guarda el evento que se enviaría.
      const mockFile = process.env.CAPI_MOCK_FILE;
      if (mockFile) {
        await mkdir(dirname(mockFile), { recursive: true });
        await appendFile(mockFile, `${JSON.stringify(body)}\n`, 'utf8');
      }
      return;
    }
    if (!CONFIG.pixelId) return;

    // CAPI_GRAPH_URL: solo para el QA (un Meta simulado). En Vercel no existe.
    const graph = process.env.CAPI_GRAPH_URL || 'https://graph.facebook.com';
    const res = await fetch(
      `${graph}/${META_GRAPH_VERSION}/${CONFIG.pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CAPI_TIMEOUT_MS),
      },
    );
    if (!res.ok) console.warn('[capi] Meta respondió', res.status);
  } catch (error) {
    console.warn('[capi] Meta no disponible', error instanceof Error ? error.name : 'error');
  }
}
