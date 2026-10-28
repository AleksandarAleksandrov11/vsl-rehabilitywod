# RehabilityWOD · Landing de valoración

Landing de captación para **RehabilityWOD** (fisioterapia online para atletas de CrossFit) en
[vsl.rehabilitywod.com](https://vsl.rehabilitywod.com). Un solo objetivo: que el atleta rellene el
formulario de valoración.

- Secciones: hero con cinta de datos, vídeo, por qué, cómo funciona, opiniones y quién está detrás,
  formulario de valoración, preguntas frecuentes, banda de cierre y footer.
- Formulario de 4 pasos, uno por pantalla, que también funciona sin JavaScript.
- Cada solicitud se guarda en Google Sheets (`/api/lead` → Google Apps Script) y se avisa por email.
- Sin salidas antes de enviar: ni WhatsApp, ni redes, ni email en la home. Tras enviar, la gracias
  sale en la propia tarjeta y WhatsApp se abre con el mensaje ya escrito (solo en móvil; en
  escritorio, con un botón). Barra fija de llamada a la acción en móvil.
- Meta Pixel solo tras el consentimiento de cookies (criterios de la AEPD). API de conversiones de
  Meta para todos los leads (`/api/lead-capi`), con los datos de contacto cifrados y nunca datos de
  salud.
- Vercel Web Analytics y Speed Insights, sin cookies.
- Aviso legal, privacidad (RGPD/LOPDGDD, datos de salud) y política de cookies.

| Pieza         | Elección                                                                    |
| ------------- | --------------------------------------------------------------------------- |
| Framework     | Astro 5.18 (TypeScript `strict`), estática + `/api/lead` y `/api/lead-capi` |
| Estilos       | Tailwind CSS v4 (`@tailwindcss/vite`), tokens en `src/styles/global.css`    |
| Adaptador     | `@astrojs/vercel` (producción) · `@astrojs/node` (solo QA y preview local)  |
| JS en cliente | TypeScript sin framework, ~14 KB con gzip (animación: 1,3 KB)               |
| Fuentes       | Big Shoulders Display 800 (titulares) y Work Sans variable, autoalojadas    |
| Imágenes      | `astro:assets` (AVIF y WebP con `srcset` y dimensiones explícitas)          |
| Calidad       | ESLint, Prettier, `astro check`, Playwright + axe-core, Lighthouse          |

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
| `npm run qa:browsers`             | Banner, Pixel y formulario en Safari de iOS y en el navegador de Instagram (iOS y Android)               |
| `npm run qa:nav`                  | Botones y enlaces: a dónde llevan, dónde queda la pantalla, que ninguno tape a otro y sin fugas          |

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

| Variable               | Valor                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `SITE_URL`             | `https://vsl.rehabilitywod.com` (sin barra final)                           |
| `GOOGLE_SCRIPT_URL`    | URL `/exec` de la aplicación web del Apps Script                            |
| `LEAD_SECRET`          | La misma cadena que la propiedad `LEAD_SECRET` del script                   |
| `META_CAPI_TOKEN`      | Opcional. Activa la API de conversiones de Meta (todos los leads)           |
| `CAPI_SIGNING_SECRET`  | Opcional. Firma del lead para `/api/lead-capi`; sin ella se usa LEAD_SECRET |
| `PUBLIC_META_PIXEL_ID` | Opcional. Por defecto `1433154668778788`                                    |
| `LEAD_MOCK`            | No crearla (o `0`). Con `1` la API responde «ok» pero no guarda nada        |
| `META_TEST_EVENT_CODE` | Solo en Preview. Código de «Probar eventos»; en producción se ignora        |

Sin `GOOGLE_SCRIPT_URL` y `LEAD_SECRET` el formulario responde correctamente pero **el lead no se
guarda**: queda solo en los logs de Vercel con un aviso. Cada cambio de variables necesita
**Redeploy**.

Solo `/api/lead` y `/api/lead-capi` son funciones serverless; el resto de páginas son estáticas.
Sin `META_CAPI_TOKEN` (o sin `CAPI_SIGNING_SECRET` ni `LEAD_SECRET`) la web funciona igual: solo
se deja de enviar el Lead de servidor a Meta.

## 4. Analítica

En el proyecto de Vercel: pestaña **Analytics → Enable** y pestaña **Speed Insights → Enable**.
Los componentes ya están en el layout, así que no hay que tocar código.

Eventos personalizados en **Analytics → Events** (requieren un plan de Vercel con eventos
personalizados; en el plan gratuito no se registran y no rompen nada):

| Evento               | Cuándo                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `cta_click`          | Botón de valoración, con `location` (header, hero, sticky, footer…)        |
| `vsl_play`           | Play del vídeo                                                             |
| `form_step`          | Cada paso del formulario completado (`step`)                               |
| `form_submit`        | Pulsar enviar                                                              |
| `form_error`         | Error de validación o de envío (`step`, `field`; `reason` en los de envío) |
| `lead`               | `/api/lead` responde OK                                                    |
| `lead_thankyou_view` | Se ve la gracias (en la tarjeta o en `/gracias`)                           |
| `whatsapp_auto`      | WhatsApp se abre solo tras enviar (móvil)                                  |
| `whatsapp_button`    | Se pulsa «Abrir WhatsApp» en la gracias                                    |

Vercel Analytics no usa cookies y por eso funciona sin consentimiento.

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
3. Dale al play del vídeo → `VideoPlay` (evento personalizado).
4. Toca el formulario o una tarjeta de «¿Qué te duele?» → `FormStart` (una vez por sesión).
5. Completa el paso 1 → `ViewContent` (`content_name: Formulario`) y `FormStep` (`step: 1`); cada
   paso, su `FormStep` una vez por sesión. Un error de validación → `FormError` (`step`, `field`).
6. Envía el formulario → `Lead` con un `eventID`, el mismo que aparece en la última columna de la
   hoja de leads, y con advanced matching (teléfono, nombre y país cifrados). Si el servidor
   responde con error, no se envía `Lead`.
7. En móvil, WhatsApp se abre solo → `Contact` (`content_category: gracias-auto`); con el botón
   «Abrir WhatsApp» → `Contact` (`gracias-boton`).

Si la visita llega de un anuncio con `fbclid`, al aceptar se guarda en la cookie `_fbc` (aunque ya no
esté en la URL), para que el Pixel y la API de conversiones atribuyan mejor el lead.

Nunca se envían a Meta la zona ni la descripción (datos de salud), ni el nombre o el teléfono en
claro. Los eventos automáticos están desactivados (`autoConfig: false`), porque enviarían el texto
de los botones pulsados (por ejemplo, la zona del dolor).

**API de conversiones (todos los leads, con o sin cookies).** Si `META_CAPI_TOKEN` está
configurado, cada lead llega también a Meta desde el servidor:

- Con JS: `/api/lead` responde con `sig` (HMAC-SHA256 de `event_id.telefono` con
  `CAPI_SIGNING_SECRET` o, si no existe, `LEAD_SECRET`) y el navegador llama a `/api/lead-capi`
  con `sendBeacon` (o `fetch` con `keepalive`), sin esperar: la gracias no depende de Meta.
  `/api/lead-capi` comprueba la firma (en tiempo constante), el origen y que ese `event_id` no se
  haya enviado ya.
- Sin JS: `/api/lead` lo envía tras guardar el lead, esperando como mucho 4 s antes de ir a
  `/gracias` (el `fbclid` sale de la URL de la que viene el formulario).
- El evento: `event_name: Lead`, `event_time`, `event_id` (el mismo que el del Pixel, para
  deduplicar), `event_source_url` (sin parámetros), `action_source: website` y en `user_data`:
  teléfono (`ph`), nombre (`fn`) y apellidos (`ln`) en SHA-256, `external_id` (hash del teléfono),
  país (`country`, hash de `es` con prefijo +34), user agent, IP (primera de `x-forwarded-for`),
  `fbc` (la cookie `_fbc` o, si se llegó con `fbclid`, `fb.1.<momento del primer clic>.<fbclid>`) y
  `fbp` solo con las cookies de marketing aceptadas.
- `test_event_code` solo fuera de producción. Tiempo máximo con Meta: 4 s. Los logs no llevan datos
  personales (`[capi] Meta respondió 400`, por ejemplo).
- El cuerpo que recibe el Apps Script no cambia (un test congela sus campos y tipos).

Para retirar el consentimiento: **Configurar cookies** en el pie → desactivar Marketing → Guardar.
Se borran `_fbp` y `_fbc` y dejan de enviarse eventos.

Para que cada lead indique de qué anuncio viene, los anuncios de Meta deben llevar los parámetros
de URL indicados en la guía del Apps Script.

## 7. Comprobar que todo funciona

1. Rellena el formulario desde el móvil con un teléfono real.
2. Debe aparecer la fila en la pestaña **Leads** y llegar el email «Nuevo lead: {nombre} · {zona}».
3. En Events Manager debe verse el evento `Lead`.
4. Si algo falla: Vercel → **Logs**, filtrando por `/api/lead` o `/api/lead-capi`. Los logs no
   contienen datos personales; muestran `Apps Script no confirmó el guardado` si el secreto no
   coincide, `MODO MOCK EN PRODUCCIÓN` si faltan las variables, o `[capi] Meta respondió …` si Meta
   rechaza el evento.

---

## Estructura

```
src/
  config.ts              Contacto, WhatsApp, redes, vídeo y datos legales
  layouts/Base.astro     <head>, fuentes y precargas, SEO, analítica, banner de cookies
  layouts/Legal.astro    Plantilla de las páginas legales
  pages/                 index, gracias (noindex; solo para el envío sin JS), aviso-legal,
                         privacidad y cookies (noindex, follow; fuera del sitemap), 404,
                         og.jpg (imagen OG generada en el build), robots.txt, api/lead.ts,
                         api/lead-capi.ts
  components/            Header, Hero, ZonesSection, StatsTicker, VslSection, WhySection, HowItWorks,
                         Testimonials, AboutGerard, ValoracionSection, LeadForm, ZoneIcon, Faq,
                         ClosingBand, Footer, StickyCta, CookieBanner,
                         CtaButton, SectionCta, SplitWords, Wordmark, TitularData
  scripts/               boot, reveal, motion, marquee, dialogs, faq, consent, cookie-banner,
                         pixel, tracking, insights, utm, form, vsl, sticky, home
  lib/                   lead.ts (validación compartida), images.ts (AVIF/WebP), hero.ts,
                         ad-script.ts (script en línea del hero según el anuncio),
                         capi.ts (API de conversiones y firma), http.ts (utilidades de /api)
  data/testimonials.ts   Testimonios (recorte y texto completo); para añadir uno, otra entrada
  data/ad-variants.ts    Antetítulo y subtítulo del hero según el anuncio (utm_content o
                         utm_campaign)
  styles/global.css      Tokens, tipografía, botones, texturas, reveals y marquees
  assets/photos/         Fotos de la web (créditos más abajo)
  assets/images/         Capturas de la app
  assets/fonts/          Work Sans variable recortada a los pesos 400 a 800
  assets/textures/       grain.svg (grano de las secciones oscuras)
  og/                    Fuentes para generar la imagen de Open Graph
apps-script/             Code.gs e instrucciones de instalación
tests/qa.spec.ts         Suite de QA (Playwright + axe-core)
tests/leads.spec.ts      Pruebas de la optimización para leads (CAPI, fugas, WhatsApp, variantes,
                         contrato con el Apps Script); helpers comunes en tests/helpers.ts
scripts/                 qa.mjs, qa-server.mjs, preview.mjs, lighthouse.mjs, inp.mjs,
                         anim-size.mjs, sheets-e2e.mjs, pixel-check.mjs, mobile-browsers.mjs,
                         csp-hash.mjs
qa/                      screenshots/ y lighthouse/ (resultados de la última ejecución)
vercel.json              Cabeceras de seguridad, CSP, caché y redirecciones
```

## Decisiones técnicas

- **CSP sin `'unsafe-inline'` en `script-src`.** Astro está configurado para no incrustar scripts:
  todos son archivos propios o el de Meta, salvo el script mínimo del hero según el anuncio (en el
  `<head>` de la home), permitido por su **hash sha256** en `vercel.json`. Si se cambia
  `src/lib/ad-script.ts` o `src/data/ad-variants.ts`, hay que actualizar el hash con
  `npm run build && node scripts/csp-hash.mjs --write`; un test lo comprueba.
  `style-src-attr 'unsafe-inline'` se mantiene para los atributos `style` que escalonan las
  animaciones.
- **Hero según el anuncio**: el script del `<head>` marca `<html data-ad>` antes de pintar el
  hero y el CSS muestra el antetítulo y el subtítulo de esa variante (`src/data/ad-variants.ts`,
  una regla CSS por variante; un test falla si falta alguna). Prioridad: `utm_content` reconocido
  (minúsculas, sin espacios, `mofu3.0` → `mofu3`; `mofu10` no es `mofu1`) > `utm_campaign`
  (`descubrir` o `tofu` → «Fisioterapia online para atletas de CrossFit»; `mofu`, `bofu` o
  `cierre` → «Reserva tu valoración») > lo guardado en `sessionStorage` (`rw_ad`) > el hero de
  siempre. Un `utm_content` desconocido no anula una campaña reconocida. Sin parpadeo ni
  renderizado en servidor; los antetítulos largos caben en una línea a 390 px. Con `mofu3.0`
  además queda marcado «Hombro» en el paso 1.
- **Sección «¿Qué te duele?»** (`ZonesSection.astro`, justo después del hero): 8 tarjetas grandes,
  una por zona del formulario (2 columnas en móvil, 4 × 2 en escritorio) con la figura de
  `ZoneIcon`. Al pulsar una, el formulario la marca y abre el paso 2 (cuenta como paso 1
  completado). El cierre, «¿Otra duda? Déjame tu WhatsApp y te la resuelvo», lleva al formulario
  con «Otro» y el paso 2 abierto. Con `mofu3.0`, «Hombro» aparece destacado con «Tu zona». En el
  hero, junto a los botones, «+120 atletas recuperados» (también en la cinta de datos).
- **`security.checkOrigin: false` en Astro.** El `checkOrigin` de Astro 5 reconstruye la URL como
  `localhost` en Vercel y rechazaría el formulario sin JavaScript. `/api/lead` y `/api/lead-capi`
  hacen su propia comprobación de origen.
- **Antispam.** Honeypot oculto y medición del tiempo de relleno con los dos relojes del cliente
  (`started_at` y `submitted_at`), para no descartar envíos reales si el reloj del móvil va
  adelantado. Sin JavaScript solo se aplica el honeypot.
- **Vídeo (facade)**: reproductor de YouTube en modo de privacidad mejorada
  (`youtube-nocookie.com`). Hasta pulsar play solo se ve la portada servida desde la web con el
  botón de play de YouTube; no se descarga nada de YouTube. Al pulsar se inserta el iframe con
  autoplay y se envían `vsl_play` y `VideoPlay`. Sin JavaScript, un aviso en texto (sin enlace a
  YouTube).
- **Imágenes**: AVIF y WebP generados en el build, nunca por encima del tamaño natural. Los fondos
  que van bajo un velo usan menos calidad, y las fotos por debajo del pliegue se piden con
  `fetchpriority="low"` para no competir con el hero ni con las fuentes.
- **Hero con dirección de arte**: foto vertical hasta 1023 px y horizontal desde 1024 px, con
  precarga responsive (`imagesrcset` + `media`) de la versión AVIF.
- **Hero sin animación de entrada**: titular, subtítulo y botones se pintan en el primer render.
  Las entradas al hacer scroll (`.reveal`) solo se arman en lo que queda por debajo del pliegue.
- **Fuentes**: Work Sans (variable, recortada a los pesos 400 a 800 con
  `fontTools.varLib.instancer`) y Big Shoulders Display 800, las dos con `font-display: swap`,
  precargadas (se usan en el hero) y con fallbacks de métrica ajustada para que el cambio de fuente
  no mueva nada.
- **Scripts no críticos**: todos los scripts son módulos (diferidos). La analítica de Vercel se
  carga tras el evento `load`, en un momento libre del navegador. El Pixel de Meta se carga en
  cuanto hay consentimiento de marketing (al instante en visitas que ya lo dieron).
- **Eventos de Meta**: `PageView` al cargar el Pixel (en el mismo momento de aceptar), un solo
  `ViewContent` (paso 1 del formulario), los personalizados `FormStart` (primer toque, una vez por
  sesión), `FormStep` (`step`, una vez por paso y sesión), `FormError` (`step`, `field`) y
  `VideoPlay`, `Contact` (`gracias-auto` o `gracias-boton`) y `Lead` solo cuando `/api/lead`
  responde OK: una vez por `event_id` (`sessionStorage` `rw_lead_<event_id>`), con el mismo
  `event_id` que la API de conversiones y con advanced matching manual (`fbq('init')` con teléfono,
  nombre y país cifrados en el navegador, justo antes del `Lead`). Parámetros cerrados: nada de
  salud.
- **Barra CTA fija (móvil)**: un solo botón (sin WhatsApp). Aparece en cuanto el CTA del hero queda
  fuera de pantalla (o detrás de la cabecera) y se oculta con el formulario en pantalla. Con el
  banner de cookies abierto se coloca justo encima de él, sin taparlo.
- **Banner de cookies**: barra compacta abajo (unos 93 px en móvil) con Aceptar y Rechazar del
  mismo tamaño y estilo y el enlace Configurar. No es modal: no bloquea el scroll ni los clics y
  deja a la vista los dos botones del hero.
- **SEO**: el sitemap solo lleva la home (`/sitemap.xml` redirige con 301 a `/sitemap-index.xml`);
  la canonical y `og:url` de la home llevan barra final (`https://vsl.rehabilitywod.com/`).
- **Caché**: los archivos con hash (`/_astro/*`) con `max-age` de un año e `immutable`; el HTML y el
  resto con `max-age=0, must-revalidate`.
- **Formulario**: `autocomplete` `given-name` en el nombre y `tel-country-code` + `tel-national` en
  el teléfono (prefijo +34 por defecto, validado: «+» y de 1 a 4 cifras; los prefijos extranjeros
  valen), con `inputmode="tel"`. Un número pegado con +34 pasa el prefijo a su casilla. Errores con
  `aria-describedby`, foco en el campo y aviso en la región `data-live`. Si falla la red se muestra
  el error, se conserva todo lo escrito para reintentar y el enlace de WhatsApp lleva todos los
  datos. En móvil el botón dice «Enviar y abrir WhatsApp».
- **Gracias y WhatsApp**: con JS, la gracias sale en la propia tarjeta («Gracias, {nombre}.»,
  `role="status"`, foco en el título). En móvil, a los 1,5 s (y al menos 800 ms después del `Lead`)
  se abre WhatsApp en la misma pestaña (`window.location`, nunca `window.open`) con «Hola Gerard,
  soy {nombre}. Acabo de pedir la valoración en la web. Zona: {zona}. {detalle}» (máximo 600
  caracteres), y queda el botón «Abrir WhatsApp» por si no se abre. En escritorio, solo el botón.
  Sin JS, `/gracias` con el botón en la misma pestaña. Sin número en `src/config.ts`, no hay ni
  apertura ni botón.
- **Sin salidas antes de enviar**: la home no enlaza a WhatsApp, teléfono, email, redes ni a ningún
  otro dominio (el vídeo es el reproductor de YouTube en la propia página). Las legales se abren en
  una pestaña nueva. Solo hay salidas en el error de envío (WhatsApp con los datos), en la gracias y
  en las páginas legales (teléfono, email y AEPD). Las redes de `src/config.ts` solo van en el
  JSON-LD (`sameAs`). Lo comprueban `tests/leads.spec.ts` y `npm run qa:nav`.
- **Footer**: marca, un CTA al formulario, enlaces legales, «Configurar cookies» y el ©.
- **Marquees** (cinta de datos y testimonios): la copia del bucle lleva `aria-hidden`; la de la
  cinta además `inert`. La de testimonios no lleva `inert` (en Safari de iPhone su «Leer más» no
  respondería) y sus botones van con `tabindex="-1"`.
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

`npm run qa` compila, levanta el servidor de QA y ejecuta `tests/qa.spec.ts` y
`tests/leads.spec.ts`: 12 viewports, capturas
(también del primer render del hero), scroll horizontal, consola y CSP, enlaces, imágenes, áreas táctiles, encabezados,
axe-core, contraste AA del texto sobre fotos, llamadas a la acción, recuento de palabras, altura de
la home, hero sin animación de entrada, marquees, reveals y parallax, estados hover, consentimiento y Pixel, vídeo,
formulario (camino feliz, casos límite y sin JavaScript), barra fija, páginas legales, cabeceras y
presupuesto de JavaScript. `tests/leads.spec.ts` prueba el contrato con el Apps Script (campos y
tipos exactos del cuerpo), las fugas (390 con Instagram de iPhone y 1440, con y sin JS),
`/api/lead-capi` (firma, origen, repetidos, token falso y Meta caído), el envío sin JS, el `Lead`
una vez con advanced matching, el embudo sin repeticiones, la gracias con WhatsApp, el error con
los datos en WhatsApp y las variantes del hero. Las capturas quedan en `qa/screenshots/` (las de
la optimización para leads, en `qa/screenshots/optimizacion-leads/`).

`npm run qa:lighthouse` guarda los informes en `qa/lighthouse/` y `node scripts/inp.mjs` mide la
latencia de interacción. `npm run qa:sheets` y `npm run qa:pixel` comprueban las dos integraciones
externas (ver la tabla de comandos); `qa:sheets` también congela el contrato con el Apps Script.
`npm run qa:browsers` repite el embudo (con y sin anuncio, gracias y apertura de WhatsApp,
capturas en `qa/screenshots/anuncios/`) en Safari de iOS y en el
navegador integrado de Instagram (necesita WebKit: `npx playwright install webkit` y
`npx playwright install-deps webkit`; sin él solo prueba Instagram en Android).

Última medición (28 de octubre de 2026, 5 pasadas): Lighthouse 99 en móvil y 100 en escritorio
(100 en accesibilidad, buenas prácticas y SEO), LCP 1,9 s en móvil con 4G lenta simulada, CLS 0 y
TBT entre 10 y 40 ms según la pasada (el mismo rango que la versión anterior medida en la misma
máquina). Latencia de interacción con la CPU 4 veces más lenta (`node scripts/inp.mjs`): la peor,
152 ms (tocar una zona del formulario). Los informes anteriores al banner compacto están en
`qa/lighthouse/antes/` y las capturas del banner antes y después en
`qa/screenshots/banner-antes-despues/`.

## Contacto del titular

Gerard Barrantes Bautista · RehabilityWOD · info@rehabilitywod.com · +34 640 99 54 94
