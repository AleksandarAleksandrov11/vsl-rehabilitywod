# RehabilityWOD · Landing con VSL

Landing de captación para **RehabilityWOD** (fisioterapia online para atletas de CrossFit).
Un solo objetivo: que el atleta rellene el formulario de valoración.

- 6 secciones (hero + stats, VSL, por qué, cómo funciona, opiniones + quién está detrás, valoración + FAQ).
- Formulario de 4 pasos, uno por pantalla, que funciona también sin JavaScript.
- Leads a Google Sheets vía `/api/lead` → Google Apps Script, con aviso por email.
- Meta Pixel solo tras el consentimiento de cookies (criterios AEPD).
- Vercel Web Analytics y Speed Insights con eventos personalizados.
- Aviso legal, privacidad (RGPD/LOPDGDD, datos de salud) y cookies.

| Pieza         | Elección                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| Framework     | Astro 5.18 (TypeScript `strict`), salida estática + `/api/lead` serverless |
| Estilos       | Tailwind CSS v4 (`@tailwindcss/vite`), tokens en `src/styles/global.css`   |
| Adaptador     | `@astrojs/vercel` (producción) · `@astrojs/node` (solo QA/preview local)   |
| JS en cliente | TypeScript vanilla, ~11 KB comprimidos en la home                          |
| Fuente        | Work Sans variable autoalojada (`@fontsource-variable/work-sans`)          |
| Imágenes      | `astro:assets` (AVIF/WebP, `srcset`, dimensiones explícitas)               |
| Calidad       | ESLint, Prettier, `astro check`, Playwright + axe-core, Lighthouse         |

---

## Lista de `TODO(Gerard)`

Lo único que falta para publicar. Cada punto está marcado en el código con `TODO(Gerard)`.

1. **Fotos definitivas.** Sustituir, con estos mismos nombres, en `src/assets/images/`:
   - `gerard-hero.jpg`: foto horizontal, **1920 px de ancho como mínimo**. Si la cara no queda bien
     encuadrada, ajustar `heroFocal` en `src/config.ts` (0 = izquierda/arriba, 1 = derecha/abajo).
   - `gerard-about.jpg`: retrato vertical 4:5, 1000 px de ancho como mínimo.
   - Opcional: `app-1.jpg` … `app-5.jpg` si hay capturas más recientes de la app (1080x2340).
   - Ahora mismo son **fotogramas reales de la VSL de Gerard** (1280x720) porque el collage de la web
     actual tiene muy poca resolución (unos 220 px por foto) y se veía pixelado a pantalla completa.
     La imagen Open Graph (`/og.jpg`) se regenera sola en cada despliegue a partir de `gerard-hero.jpg`.
2. **Número de WhatsApp** (`src/config.ts`, `whatsapp`). La web actual enlaza `wa.me/640995494`
   (sin prefijo 34, no funciona) y el aviso legal da el 636 748 147. Ahora está `34640995494`.
3. **URL del script de Google.** Crear el Apps Script y poner `GOOGLE_SCRIPT_URL` y `LEAD_SECRET` en
   Vercel. **Sin ellos la API funciona en modo mock: responde "ok" pero el lead no se guarda** (solo
   queda en el log de Vercel con un aviso). Pasos: [`apps-script/README-apps-script.md`](apps-script/README-apps-script.md).
4. **Revisión legal.** Que un profesional (abogado o consultor RGPD) revise `/aviso-legal`,
   `/privacidad` y `/cookies` antes de publicar. Se tratan datos de salud (art. 9 RGPD).
5. **Dominio.** Apuntar `rehabilitywod.com` a Vercel y confirmar `SITE_URL` (ver más abajo).

---

## 1. Instalar y arrancar en local

Requisitos: Node.js 20.3 o superior (probado con Node 22).

```bash
npm install
npm run dev          # http://localhost:4321 (modo desarrollo, API en modo mock)
```

Otros comandos:

| Comando                           | Qué hace                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                   | Build de producción para Vercel (`.vercel/output`)                                                                          |
| `npm run preview`                 | Build con el adaptador de Node y servidor local que aplica `vercel.json` (CSP, cabeceras, redirecciones), con `LEAD_MOCK=1` |
| `npm run check`                   | `astro check` (tipos)                                                                                                       |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                                                           |
| `npm run qa`                      | QA completo con Playwright (ver `qa/REPORT.md`)                                                                             |
| `npm run qa:lighthouse`           | Lighthouse móvil y escritorio (tras `npm run qa`)                                                                           |

Copia `.env.example` a `.env` si quieres probar variables en local.

> `@astrojs/vercel` no admite `astro preview`. Por eso `npm run preview` y el QA compilan el mismo
> código con `@astrojs/node` y lo sirven con `scripts/qa-server.mjs`, que emula Vercel: lee
> `vercel.json` (cabeceras, CSP, redirecciones, `cleanUrls`, `trailingSlash`), comprime con brotli y
> sirve `/_vercel/*`.

## 2. Publicar en Vercel

1. Sube el repositorio a GitHub (ya lo está) y en [vercel.com](https://vercel.com) pulsa
   **Add New… → Project → Import** sobre este repositorio.
2. Vercel detecta **Astro**. No cambies el comando de build (`npm run build`) ni el directorio de
   salida (lo gestiona el adaptador).
3. En **Environment Variables** crea (para _Production_ y, si quieres, _Preview_):

   | Variable               | Valor                                                                 |
   | ---------------------- | --------------------------------------------------------------------- |
   | `SITE_URL`             | `https://rehabilitywod.com` (sin barra final)                         |
   | `GOOGLE_SCRIPT_URL`    | URL `/exec` del Apps Script                                           |
   | `LEAD_SECRET`          | La misma cadena que la propiedad `LEAD_SECRET` del script             |
   | `PUBLIC_META_PIXEL_ID` | Opcional. Por defecto `1433154668778788`                              |
   | `LEAD_MOCK`            | No la crees (o pon `0`). `1` desactiva el guardado                    |
   | `META_CAPI_TOKEN`      | Opcional. Activa la Conversions API de Meta (solo con consentimiento) |

4. **Deploy**. Cada cambio de variables necesita **Redeploy** (Deployments → ⋯ → Redeploy).

Solo `/api/lead` es una función serverless; el resto de páginas son estáticas.

## 3. Activar Web Analytics y Speed Insights

1. En el proyecto de Vercel, pestaña **Analytics → Enable**.
2. Pestaña **Speed Insights → Enable**.
3. Redeploy.

Los componentes ya están en el layout (`@vercel/analytics/astro` y `@vercel/speed-insights/astro`).
Los eventos personalizados (`cta_click`, `vsl_play`, `form_step`, `form_submit`, `lead`,
`form_error`, `lead_thankyou_view`) aparecen en **Analytics → Events**. Requieren un plan de Vercel
que incluya eventos personalizados (Pro); en el plan gratuito simplemente no se registran y no
rompen nada. Vercel Analytics no usa cookies, por eso funciona sin consentimiento.

## 4. Apuntar el dominio

1. Vercel → proyecto → **Settings → Domains → Add**: `rehabilitywod.com` y `www.rehabilitywod.com`
   (marca una como principal y la otra redirige).
2. Vercel te muestra los registros DNS exactos (normalmente un registro `A` para el dominio raíz y un
   `CNAME` para `www`). Créalos en el proveedor del dominio y espera a que Vercel los dé por válidos.
3. Comprueba que `SITE_URL` coincide con el dominio principal y haz Redeploy (canonical, sitemap y
   Open Graph lo usan).

Redirecciones incluidas para sustituir la web actual: `/vsl` → `/#video` (301) y
`/aviso-legal.html` → `/aviso-legal`.

## 5. Verificar el Pixel de Meta

El Pixel **no se carga hasta que el visitante acepta** las cookies de marketing.

**Con Meta Pixel Helper** (extensión de Chrome):

1. Abre la web en una ventana de incógnito. Pixel Helper no debe detectar nada.
2. Pulsa **Aceptar** en el banner → aparece `PageView` (sin recargar).
3. Pulsa play en el vídeo → `ViewContent` (`content_name: VSL`).
4. Envía el formulario → `Lead`, con un `eventID` (el mismo `event_id` que llega a la hoja).

**Con Events Manager → Probar eventos:** introduce la URL de la web, repite los pasos anteriores y
comprueba que llegan `PageView`, `ViewContent` y `Lead`. Si activas `META_CAPI_TOKEN`, verás el
`Lead` también desde el servidor, deduplicado por el mismo `event_id`.

Nunca se envían a Meta la zona, el detalle, el nombre ni el teléfono en claro. Los eventos
automáticos de Meta están desactivados (`autoConfig: false`), porque enviarían el texto de los
botones pulsados (por ejemplo, la zona del dolor).

Para retirar el consentimiento: enlace **Configurar cookies** del pie → desactivar Marketing →
Guardar. Se borran `_fbp` y `_fbc` y no salen más eventos.

## 6. Comprobar que la fila llega a la hoja

1. Rellena el formulario de la web con tu teléfono.
2. En la hoja **Leads RehabilityWOD** → pestaña **Leads** aparece una fila nueva con Estado
   «Nuevo», y te llega el email «Nuevo lead: {nombre} · {zona}».
3. Si no llega: Vercel → proyecto → **Logs** (filtra por `/api/lead`). Los logs no llevan datos
   personales; verás `Apps Script no confirmó el guardado` si el secreto no coincide o
   `MODO MOCK EN PRODUCCIÓN` si faltan las variables.

---

## Estructura

```
src/
  config.ts              IDs, WhatsApp, email, datos legales, encuadre del hero, TODO(Gerard)
  layouts/Base.astro     <head>, fuente, SEO, analytics, banner de cookies
  layouts/Legal.astro    Plantilla de las páginas legales
  pages/                 index, gracias (noindex), aviso-legal, privacidad, cookies, 404,
                         og.jpg (imagen OG generada en build), robots.txt, api/lead.ts
  components/            Header, Hero, StatsStrip, VslSection, WhySection, HowItWorks,
                         Testimonials, AboutGerard, ValoracionSection, LeadForm, Faq, Footer,
                         StickyCta, CookieBanner, CtaButton, SectionCta, Wordmark, TitularData
  scripts/               boot, consent, cookie-banner, pixel, tracking, utm, form, vsl,
                         marquee, counter, sticky, home
  lib/lead.ts            Validación compartida cliente/servidor (teléfono E.164, etc.)
  data/testimonials.ts   Testimonios (recorte + texto completo)
  styles/global.css      Tokens de diseño
  assets/images/         Fotos (ver TODO)
  og/                    Work Sans estática para generar la imagen OG
apps-script/             Code.gs + instrucciones para Gerard
tests/qa.spec.ts         QA con Playwright + axe-core
scripts/                 qa.mjs, qa-server.mjs, preview.mjs, lighthouse.mjs, inp.mjs
qa/                      REPORT.md, screenshots/, lighthouse/
vercel.json              Cabeceras de seguridad, CSP, caché y redirecciones
.env.example
```

## Decisiones técnicas y desviaciones

- **`astro preview` no existe con `@astrojs/vercel`.** QA y preview usan `@astrojs/node` con el
  mismo código (ver sección 1). Es un bloqueo técnico del adaptador, no del código.
- **CSP sin `'unsafe-inline'` en `script-src`.** Astro está configurado para no incrustar scripts
  (`vite.build.assetsInlineLimit: 0`), así que no hay scripts en línea y no hacen falta hashes. El
  JSON-LD no es ejecutable y la CSP no lo bloquea. Única concesión: `style-src-attr 'unsafe-inline'`
  para el atributo `style` del encuadre del hero (`object-position` configurable).
- **Barra de Vercel en previews.** Si usas despliegues _Preview_ con la barra de comentarios de
  Vercel (`vercel.live`), la CSP la bloquea. Desactívala en Settings → General → Vercel Toolbar, o
  añade `https://vercel.live` a la CSP solo para previews.
- **`security.checkOrigin: false` en Astro.** El `checkOrigin` de Astro 5 reconstruye la URL como
  `localhost` en Vercel (sin `allowedDomains`) y rechazaría el formulario sin JavaScript. `/api/lead`
  hace su propia comprobación de origen (`Origin` = host de la petición o dominio del sitio).
- **Antispam por tiempo.** Además de `started_at`, el cliente envía `submitted_at`; el servidor mide
  el tiempo con los dos relojes del cliente, para no descartar leads reales si el reloj del móvil va
  adelantado. Sin JS no se puede medir y solo se aplica el honeypot.
- **Prefijo telefónico** en un campo aparte (+34 por defecto, editable). Si el número empieza por
  `+` se ignora el prefijo.
- **Miniatura de la VSL** descargada y optimizada en build desde `i.ytimg.com` (`maxresdefault`,
  con `hqdefault` como alternativa): así no hay ninguna petición a YouTube antes del clic.
- **Hero en móvil.** Con la foto temporal (horizontal) el texto tapaba la cara. En móvil vertical la
  foto ocupa la parte de arriba y se funde en negro bajo el texto; en móvil apaisado va a la
  derecha. Con una foto vertical compuesta con aire abajo, esas reglas (en `Hero.astro`) se pueden
  quitar.
- **`srcset` del hero**: 640/960/1280 ahora; el ancho 1920 aparece solo cuando la foto fuente lo
  tenga (Astro no amplía imágenes).
- **Carrusel**: la copia del bucle lleva `aria-hidden` e `inert`; como `inert` también bloquea los
  clics, un clic en "Leer más" de la copia abre el mismo testimonio.
- **Textos añadidos** (no son copy de venta): etiquetas de campos ("Nombre", "Teléfono móvil",
  "Tu caso (opcional)"), el título "Preguntas frecuentes.", las descripciones del panel de cookies y
  una línea de ayuda con el email en el formulario sin JavaScript.
- **Testimonios completos** (diálogo "Leer más"): solo se han corregido tildes y la grafía de la
  marca.

## Seguridad y dependencias

`npm audit` avisa de vulnerabilidades en **Astro 5** que solo se corrigen en Astro 6/7 (el encargo
pide Astro 5). Se han revisado:

- XSS en `define:vars`, en atributos por _spread_, en nombres de _slot_ y en View Transitions: no se
  usan esas funciones con datos del usuario (ni `define:vars` ni View Transitions).
- _Server islands_, `base` y páginas de error prerenderizadas con cabecera `Host`: no se usan
  server islands ni `base`; `/api/lead` responde siempre JSON o redirección propia.
- RCE en la optimización AVIF: las imágenes se optimizan en build a partir de archivos propios; el
  endpoint `/_image` solo acepta imágenes locales y de `i.ytimg.com`.
- `x-astro-path` del adaptador de Vercel: afecta al enrutado del render serverless; aquí la única
  ruta dinámica es `/api/lead`.

Mitigado con `overrides` en `package.json` (`sharp`, `path-to-regexp`, `vite`, `playwright-core`).
**Recomendación:** migrar a Astro 7 y `@astrojs/vercel` 11 cuando se pueda (el código no usa APIs
que cambien de forma relevante).

## QA

`npm run qa` compila, levanta el servidor de QA con `LEAD_MOCK=1` y ejecuta `tests/qa.spec.ts`:
12 viewports, capturas, scroll horizontal, consola y CSP, enlaces, imágenes, áreas táctiles, H1,
viudas en H1/H2, axe-core, flujos de consentimiento y Pixel, VSL, formulario (camino feliz, casos
límite, sin JS), barra fija, marquee, páginas legales, cabeceras y presupuesto de JS.
Resultados en [`qa/REPORT.md`](qa/REPORT.md).

## Contacto del titular

Gerard Barrantes Bautista · RehabilityWOD · info@rehabilitywod.com
