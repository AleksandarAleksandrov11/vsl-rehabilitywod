# RehabilityWOD · Landing de valoración

Landing de captación para **RehabilityWOD** (fisioterapia online para atletas de CrossFit) en
[vsl.rehabilitywod.com](https://vsl.rehabilitywod.com). Un solo objetivo: que el atleta rellene el
formulario de valoración.

- Secciones: hero con cinta de datos, vídeo, por qué, cómo funciona, opiniones y quién está detrás,
  formulario de valoración, preguntas frecuentes, banda de cierre y footer.
- Formulario de 4 pasos, uno por pantalla, que también funciona sin JavaScript.
- Cada solicitud se guarda en Google Sheets (`/api/lead` → Google Apps Script) y se avisa por email.
- Botón de WhatsApp fijo con el mensaje ya escrito, y barra fija de llamada a la acción en móvil.
- Meta Pixel solo tras el consentimiento de cookies (criterios de la AEPD).
- Vercel Web Analytics y Speed Insights, sin cookies.
- Aviso legal, privacidad (RGPD/LOPDGDD, datos de salud) y política de cookies.

| Pieza         | Elección                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| Framework     | Astro 5.18 (TypeScript `strict`), salida estática + `/api/lead` serverless |
| Estilos       | Tailwind CSS v4 (`@tailwindcss/vite`), tokens en `src/styles/global.css`   |
| Adaptador     | `@astrojs/vercel` (producción) · `@astrojs/node` (solo QA y preview local) |
| JS en cliente | TypeScript sin framework, ~12 KB con gzip (animación: 1,3 KB)              |
| Fuentes       | Big Shoulders Display 800 (titulares) y Work Sans variable, autoalojadas   |
| Imágenes      | `astro:assets` (AVIF y WebP con `srcset` y dimensiones explícitas)         |
| Calidad       | ESLint, Prettier, `astro check`, Playwright + axe-core, Lighthouse         |

---

## 1. Instalar y arrancar en local

Requisitos: Node.js 20.3 o superior (probado con Node 22).

```bash
npm install
npm run dev          # http://localhost:4321
```

| Comando                           | Qué hace                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run build`                   | Build de producción para Vercel                                                                          |
| `npm run preview`                 | Build con el adaptador de Node y servidor local que aplica `vercel.json` (CSP, cabeceras, redirecciones) |
| `npm run check`                   | `astro check` (tipos)                                                                                    |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                                        |
| `npm run qa`                      | Suite de QA con Playwright (12 viewports, capturas, accesibilidad, flujos)                               |
| `npm run qa:lighthouse`           | Lighthouse en móvil y escritorio                                                                         |
| `npm run qa:sheets`               | Prueba del guardado en Google Sheets con una hoja simulada                                               |
| `npm run qa:pixel`                | Prueba del Meta Pixel con la librería y la configuración reales de Meta                                  |

Copia `.env.example` a `.env` para probar variables en local.

> `@astrojs/vercel` no admite `astro preview`. Por eso `npm run preview` y el QA compilan el mismo
> código con `@astrojs/node` y lo sirven con `scripts/qa-server.mjs`, que emula Vercel: lee
> `vercel.json` (cabeceras, CSP, redirecciones, `cleanUrls`, `trailingSlash`), comprime con brotli y
> sirve `/_vercel/*`.

## 2. Google Sheets: guardar las solicitudes

Cada envío del formulario va a un Apps Script que escribe la fila en la hoja
[Leads RehabilityWOD](https://docs.google.com/spreadsheets/d/1yXt7gCggwLjPPN55o0Q9dlNhUlENz4gDpcd0NW4I3Kc/edit)
y manda el aviso a `aaswebmarketing@gmail.com`.

Instalación paso a paso: [`apps-script/README-apps-script.md`](apps-script/README-apps-script.md).

Columnas de la pestaña **Leads**: fecha y hora, nombre, teléfono, zona de dolor, qué le pasa,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content` y `utm_term`; después, estado
(desplegable con color), notas y datos técnicos del envío. La pestaña **Resumen** cuenta los leads
de hoy, de los últimos 7 días, los pendientes de contactar y los totales por zona, campaña, anuncio
y origen.

## 3. Variables de entorno en Vercel

En **Settings → Environment Variables** (Production y, si se usa, Preview):

| Variable               | Valor                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| `SITE_URL`             | `https://vsl.rehabilitywod.com` (sin barra final)                         |
| `GOOGLE_SCRIPT_URL`    | URL `/exec` de la aplicación web del Apps Script                          |
| `LEAD_SECRET`          | La misma cadena que la propiedad `LEAD_SECRET` del script                 |
| `META_CAPI_TOKEN`      | Opcional. Activa la API de conversiones de Meta (solo con consentimiento) |
| `PUBLIC_META_PIXEL_ID` | Opcional. Por defecto `1433154668778788`                                  |
| `LEAD_MOCK`            | No crearla (o `0`). Con `1` la API responde «ok» pero no guarda nada      |

Sin `GOOGLE_SCRIPT_URL` y `LEAD_SECRET` el formulario responde correctamente pero **el lead no se
guarda**: queda solo en los logs de Vercel con un aviso. Cada cambio de variables necesita
**Redeploy**.

Solo `/api/lead` es una función serverless; el resto de páginas son estáticas.

## 4. Analítica

En el proyecto de Vercel: pestaña **Analytics → Enable** y pestaña **Speed Insights → Enable**.
Los componentes ya están en el layout, así que no hay que tocar código.

Eventos personalizados en **Analytics → Events**: `cta_click` (con la posición del botón, incluidos
los de WhatsApp), `vsl_play`, `form_step`, `form_submit`, `lead`, `form_error` y
`lead_thankyou_view`. Requieren un plan de Vercel con eventos personalizados; en el plan gratuito no
se registran y no rompen nada. Vercel Analytics no usa cookies y por eso funciona sin
consentimiento.

## 5. Dominio

El dominio es `vsl.rehabilitywod.com`, apuntado a Vercel con un registro `CNAME`. `SITE_URL` debe
coincidir con él: de ahí salen la URL canónica, el sitemap y las etiquetas Open Graph.

Redirecciones incluidas: `/vsl` → `/#video` (301) y `/aviso-legal.html` → `/aviso-legal`.

## 6. Meta Pixel

El Pixel (`1433154668778788`) **no se carga hasta que el visitante acepta** las cookies de
marketing.

Con la extensión **Meta Pixel Helper** o con **Events Manager → Probar eventos**:

1. Abre la web en una ventana de incógnito: no debe detectarse nada.
2. Pulsa **Aceptar** en el banner de cookies → `PageView`, sin recargar.
3. Dale al play del vídeo → `ViewContent` (`content_name: VSL`).
4. Completa el paso 1 del formulario → `FormStart`.
5. Envía el formulario → `Lead` con un `eventID`, el mismo que aparece en la última columna de la
   hoja de leads.

Nunca se envían a Meta la zona, la descripción, el nombre ni el teléfono en claro. Los eventos
automáticos están desactivados (`autoConfig: false`), porque enviarían el texto de los botones
pulsados (por ejemplo, la zona del dolor). Si se configura `META_CAPI_TOKEN`, el `Lead` se envía
también desde el servidor y Meta lo deduplica con ese mismo `eventID`.

Para retirar el consentimiento: **Configurar cookies** en el pie → desactivar Marketing → Guardar.
Se borran `_fbp` y `_fbc` y dejan de enviarse eventos.

Para que cada lead indique de qué anuncio viene, los anuncios de Meta deben llevar los parámetros
de URL indicados en la guía del Apps Script.

## 7. Comprobar que todo funciona

1. Rellena el formulario desde el móvil con un teléfono real.
2. Debe aparecer la fila en la pestaña **Leads** y llegar el email «Nuevo lead: {nombre} · {zona}».
3. En Events Manager debe verse el evento `Lead`.
4. Si algo falla: Vercel → **Logs**, filtrando por `/api/lead`. Los logs no contienen datos
   personales; muestran `Apps Script no confirmó el guardado` si el secreto no coincide, o
   `MODO MOCK EN PRODUCCIÓN` si faltan las variables.

---

## Estructura

```
src/
  config.ts              Contacto, WhatsApp, redes, vídeo y datos legales
  layouts/Base.astro     <head>, fuentes y precargas, SEO, analítica, banner de cookies
  layouts/Legal.astro    Plantilla de las páginas legales
  pages/                 index, gracias (noindex), aviso-legal, privacidad, cookies, 404,
                         og.jpg (imagen OG generada en el build), robots.txt, api/lead.ts
  components/            Intro, Header, Hero, StatsTicker, VslSection, WhySection, HowItWorks,
                         Testimonials, AboutGerard, ValoracionSection, LeadForm, ZoneIcon, Faq,
                         ClosingBand, Footer, StickyCta, WhatsappButton, CookieBanner,
                         CtaButton, SectionCta, SplitWords, Wordmark, TitularData
  scripts/               boot, reveal, motion, marquee, dialogs, faq, consent, cookie-banner,
                         pixel, tracking, utm, form, vsl, sticky, home
  lib/                   lead.ts (validación compartida), images.ts (AVIF/WebP), hero.ts, intro.ts
  data/testimonials.ts   Testimonios (recorte y texto completo)
  styles/global.css      Tokens, tipografía, botones, texturas, reveals y marquees
  assets/photos/         Fotos de la web (créditos más abajo)
  assets/images/         Capturas de la app
  og/                    Fuentes para generar la imagen de Open Graph
apps-script/             Code.gs e instrucciones de instalación
tests/qa.spec.ts         Suite de QA (Playwright + axe-core)
scripts/                 qa.mjs, qa-server.mjs, preview.mjs, lighthouse.mjs, inp.mjs,
                         anim-size.mjs, csp-hash.mjs, sheets-e2e.mjs, pixel-check.mjs
qa/                      screenshots/ y lighthouse/ (resultados de la última ejecución)
public/textures/         grain.svg
vercel.json              Cabeceras de seguridad, CSP, caché y redirecciones
```

## Decisiones técnicas

- **CSP sin `'unsafe-inline'` en `script-src`.** Astro está configurado para no incrustar scripts.
  La única excepción es el script mínimo de la intro en el `<head>` de la home, permitido por su
  **hash sha256** en `vercel.json`. Si se cambia `src/lib/intro.ts` hay que actualizar el hash con
  `node scripts/csp-hash.mjs --write`; un test lo comprueba. `style-src-attr 'unsafe-inline'` se
  mantiene para los atributos `style` que escalonan las animaciones.
- **`security.checkOrigin: false` en Astro.** El `checkOrigin` de Astro 5 reconstruye la URL como
  `localhost` en Vercel y rechazaría el formulario sin JavaScript. `/api/lead` hace su propia
  comprobación de origen.
- **Antispam.** Honeypot oculto y medición del tiempo de relleno con los dos relojes del cliente
  (`started_at` y `submitted_at`), para no descartar envíos reales si el reloj del móvil va
  adelantado. Sin JavaScript solo se aplica el honeypot.
- **Vídeo**: reproductor de YouTube en modo de privacidad mejorada (`youtube-nocookie.com`). Para no
  cargarlo en la primera pintura, el iframe se inserta cuando el vídeo se acerca a la pantalla;
  hasta entonces se ve la portada servida desde la web, y un clic en ella arranca la reproducción.
  El play se detecta por `postMessage` y envía `vsl_play` y `ViewContent`.
- **Imágenes**: AVIF y WebP generados en el build, nunca por encima del tamaño natural. Los fondos
  que van bajo un velo usan menos calidad, y las fotos por debajo del pliegue se piden con
  `fetchpriority="low"` para no competir con el hero ni con las fuentes.
- **Hero con dirección de arte**: foto vertical hasta 1023 px y horizontal desde 1024 px, con
  precarga responsive (`imagesrcset` + `media`) de la versión AVIF.
- **Animación inicial**: CSS puro, 1,1 s como máximo, una vez por sesión y nunca con
  `prefers-reduced-motion`.
- **Marquees** (cinta de datos y testimonios): la copia del bucle lleva `aria-hidden` e `inert`.
- **WhatsApp**: burbuja fija en escritorio y botón junto al CTA en la barra fija de móvil, los dos
  con el mensaje ya escrito. El número y el texto están en `src/config.ts`.
- **Barra de Vercel en previews**: si se usan despliegues _Preview_ con la barra de comentarios de
  Vercel, la CSP la bloquea. Se desactiva en Settings → General → Vercel Toolbar.

## Fotos y créditos

Fotos propias de RehabilityWOD (sin retoques, solo recortadas): `gerard.jpg` (bloque «Quién está
detrás»), `closing.jpg` y `closing-m.jpg` (banda de cierre) y `vsl-cover.jpg` (portada del vídeo).
Las capturas de `assets/images/` son de la app real.

Las fotos de ambiente son de **Unsplash**, con la [Unsplash License](https://unsplash.com/license)
(uso comercial, sin atribución obligatoria):

| Hueco                | Archivo            | Foto                                                                       | Autor                             |
| -------------------- | ------------------ | -------------------------------------------------------------------------- | --------------------------------- |
| Hero móvil           | `hero-mobile.jpg`  | [unsplash.com/photos/03b61PY89hs](https://unsplash.com/photos/03b61PY89hs) | Ambitious Studio\* · Rick Barrett |
| Hero escritorio      | `hero-desktop.jpg` | [unsplash.com/photos/w7jYaN7GqyA](https://unsplash.com/photos/w7jYaN7GqyA) | Ambitious Studio\* · Rick Barrett |
| Fondo del formulario | `form-bg.jpg`      | [unsplash.com/photos/uH8JDWuxFX8](https://unsplash.com/photos/uH8JDWuxFX8) | Julien Dumas                      |

En CSS solo se aplica `contrast(1.03) saturate(.95)` para unificar la serie.

## Seguridad y dependencias

`npm audit` avisa de vulnerabilidades de **Astro 5** que solo se corrigen en Astro 6 o 7. Se han
revisado una a una y ninguna afecta a esta web:

- XSS en `define:vars`, en atributos por _spread_, en nombres de _slot_ y en View Transitions: no se
  usan esas funciones con datos de la persona que visita la web.
- _Server islands_, `base` y páginas de error prerenderizadas con cabecera `Host`: no se usan;
  `/api/lead` responde siempre JSON o una redirección propia.
- RCE en la optimización AVIF: las imágenes se optimizan en el build a partir de archivos del
  repositorio y el endpoint `/_image` solo acepta imágenes locales.
- `x-astro-path` del adaptador de Vercel: la única ruta dinámica es `/api/lead`.

Mitigado con `overrides` en `package.json` (`sharp`, `path-to-regexp`, `vite`, `playwright-core`).
Conviene migrar a Astro 7 y `@astrojs/vercel` 11 cuando sea posible: el código no usa APIs que
cambien de forma relevante.

## QA

`npm run qa` compila, levanta el servidor de QA y ejecuta `tests/qa.spec.ts`: 12 viewports, capturas
con y sin intro, scroll horizontal, consola y CSP, enlaces, imágenes, áreas táctiles, encabezados,
axe-core, contraste AA del texto sobre fotos, llamadas a la acción, recuento de palabras, altura de
la home, intro, marquees, reveals y parallax, estados hover, consentimiento y Pixel, vídeo,
formulario (camino feliz, casos límite y sin JavaScript), barra fija, páginas legales, cabeceras y
presupuesto de JavaScript. Las capturas quedan en `qa/screenshots/`.

`npm run qa:lighthouse` guarda los informes en `qa/lighthouse/` y `node scripts/inp.mjs` mide la
latencia de interacción. `npm run qa:sheets` y `npm run qa:pixel` comprueban las dos integraciones
externas (ver la tabla de comandos).

Última medición: Lighthouse 99 en móvil y 100 en escritorio (100 en accesibilidad, buenas prácticas
y SEO), LCP 2,1 s en móvil con 4G simulado, CLS 0 y peor interacción 104 ms.

## Contacto del titular

Gerard Barrantes Bautista · RehabilityWOD · info@rehabilitywod.com · +34 640 99 54 94
