# RehabilityWOD · Landing con VSL

Landing de captación para **RehabilityWOD** (fisioterapia online para atletas de CrossFit).
Un solo objetivo: que el atleta rellene el formulario de valoración.

- **Rediseño v2** (septiembre de 2026): animación inicial "pulso a movimiento", titulares en
  mayúsculas con Big Shoulders Display, fotos de box a sangre, texturas, cinta de stats en loop,
  reveals y parallax sutil. Informe en [`qa/REPORT-v2.md`](qa/REPORT-v2.md).
- 6 secciones (hero + cinta de stats, VSL, por qué, cómo funciona, opiniones + quién está detrás,
  valoración + FAQ), banda de cierre y footer.
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
| JS en cliente | TypeScript vanilla, ~12 KB con gzip en la home (animación: 1,3 KB)         |
| Fuentes       | Big Shoulders Display 800 (titulares) y Work Sans variable, autoalojadas   |
| Imágenes      | `astro:assets` (AVIF/WebP, `srcset`, dimensiones explícitas)               |
| Calidad       | ESLint, Prettier, `astro check`, Playwright + axe-core, Lighthouse         |

---

## Lista de `TODO(Gerard)`

Lo único que falta para publicar. Cada punto está marcado en el código con `TODO(Gerard)`.

1. **IMPORTANTE: FOTO DE GERARD PENDIENTE.** No llegó ninguna foto adjunta con el encargo de
   rediseño. El bloque "Quién está detrás" usa de forma provisional un recorte de
   `https://rehabilitywod.com/collage.png` (**150x188 px**, se muestra a 75 px para que se vea nítido).
   **Sustituir `src/assets/photos/gerard.jpg`** por una foto real de Gerard (retrato 4:5, cara en el
   tercio superior, **1600 px de ancho o más**), sin filtros. Con una foto de 1600 px o más el bloque
   cambia solo al diseño grande (foto de hasta 480 px a la izquierda con el chip "+120 atletas
   recuperados" encima). **Nunca una foto de stock de otra persona.**
   - Opcional: `src/assets/images/app-1.jpg`, `app-3.jpg`, `app-4.jpg` si hay capturas más recientes
     de la app (1080x2340).
2. **Número de WhatsApp** (`src/config.ts`, `whatsapp`). La web actual enlaza `wa.me/640995494`
   (sin prefijo 34, no funciona) y el aviso legal da el 636 748 147. Ahora está `34640995494`.
3. **URL del script de Google.** Crear el Apps Script y poner `GOOGLE_SCRIPT_URL` y `LEAD_SECRET` en
   Vercel. **Sin ellos la API funciona en modo mock: responde "ok" pero el lead no se guarda** (solo
   queda en el log de Vercel con un aviso). Pasos: [`apps-script/README-apps-script.md`](apps-script/README-apps-script.md).
4. **Revisión legal.** Que un profesional (abogado o consultor RGPD) revise `/aviso-legal`,
   `/privacidad` y `/cookies` antes de publicar. Se tratan datos de salud (art. 9 RGPD).
5. **Dominio.** Apuntar `rehabilitywod.com` a Vercel y confirmar `SITE_URL` (ver más abajo).

---

## Fotos y créditos de imágenes

Las 6 fotos de ambiente son de **Unsplash**, con la [Unsplash License](https://unsplash.com/license)
(uso comercial permitido, sin atribución obligatoria; ninguna es Unsplash+). La licencia de cada una
se comprobó en su página. Se eligieron con una hoja de miniaturas por hueco (8 a 12 candidatas cada
una) que está en [`qa/photo-sheets/`](qa/photo-sheets/), y la hoja final de la serie en
[`qa/photo-sheets/final-series.jpg`](qa/photo-sheets/final-series.jpg).

| Hueco              | Archivo (`src/assets/photos/`)                | Foto                                                                       | Autor                             | Por qué esta                                                                                                                |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1 Hero móvil       | `hero-mobile.jpg` (2000x2999)                 | [unsplash.com/photos/03b61PY89hs](https://unsplash.com/photos/03b61PY89hs) | Ambitious Studio\* · Rick Barrett | Rig, barra y discos de un box real, sin personas; mitad inferior oscura para el texto.                                      |
| 2 Hero escritorio  | `hero-desktop.jpg` (3200x2134)                | [unsplash.com/photos/w7jYaN7GqyA](https://unsplash.com/photos/w7jYaN7GqyA) | Ambitious Studio\* · Rick Barrett | Mismo box y misma sesión que la 1 (misma luz y revelado); suelo oscuro abajo y centro limpio.                               |
| 3 Banda 3B         | `band-statement.jpg` + `band-statement-m.jpg` | [unsplash.com/photos/gNvNsHIckSc](https://unsplash.com/photos/gNvNsHIckSc) | HamZa NOUASRIA                    | Mano con magnesio agarrando la barra, poca luz, sin logos; admite el recorte vertical para móvil.                           |
| 4 Póster VSL       | `vsl-poster.jpg` (2560x1440)                  | [unsplash.com/photos/9dzWZQWZMdE](https://unsplash.com/photos/9dzWZQWZMdE) | Anastase Maragos                  | Box oscuro, atleta preparando un peso muerto sin cara visible; recortada para dejar el motivo a la derecha.                 |
| 5 Fondo formulario | `form-bg.jpg` (2400x1800)                     | [unsplash.com/photos/uH8JDWuxFX8](https://unsplash.com/photos/uH8JDWuxFX8) | Julien Dumas                      | Anillas bajo la estructura del box: textura tranquila y neutra que aguanta el velo al 88 %.                                 |
| 6 Cierre           | `closing.jpg` + `closing-m.jpg`               | [unsplash.com/photos/h4i9G-de7Po](https://unsplash.com/photos/h4i9G-de7Po) | John Arano                        | Atleta de espaldas en posición de press bajo el rig: vuelta al rendimiento, sin cara. El rótulo del rig queda bajo el velo. |

- Descargadas del original a máxima resolución y reducidas (sin filtros ni retoques). Los archivos
  `-m` son recortes verticales de la misma foto para móvil; el póster es un recorte 16:9.
- En la web se sirven por `astro:assets` en AVIF (calidad 60) y WebP (78): verticales a 480, 768,
  1080 y 1440 px y horizontales a 768, 1280, 1920 y 2560 px, nunca por encima del tamaño natural.
  El hero pesa 89 KB en AVIF a 1080 px.
- Solo se aplica `contrast(1.03) saturate(.95)` en CSS para unificar la serie.
- La foto de Gerard **no es de stock**: es el recorte provisional de su web (ver `TODO(Gerard)`).

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
  config.ts              IDs, WhatsApp, email, datos legales, TODO(Gerard)
  layouts/Base.astro     <head>, fuentes y precargas, SEO, analytics, banner de cookies,
                         script en línea de la intro (solo la home)
  layouts/Legal.astro    Plantilla de las páginas legales
  pages/                 index, gracias (noindex), aviso-legal, privacidad, cookies, 404,
                         og.jpg (imagen OG generada en build), robots.txt, api/lead.ts
  components/            Intro, Header, Hero, StatsTicker, VslSection, WhySection (3A/3B/3C),
                         HowItWorks, Testimonials, AboutGerard, ValoracionSection, LeadForm,
                         ZoneIcon, Faq, ClosingBand, Footer, StickyCta, CookieBanner,
                         CtaButton, SectionCta, SplitWords (word-up en build), Wordmark, TitularData
  scripts/               boot, reveal, motion, marquee, dialogs, faq, consent, cookie-banner,
                         pixel, tracking, utm, form, vsl, sticky, home
  lib/                   lead.ts (validación compartida), images.ts (AVIF/WebP), hero.ts,
                         intro.ts (script en línea de la intro y su hash)
  data/testimonials.ts   Testimonios (recorte + texto completo)
  styles/global.css      Tokens, tipografía, botones, texturas, reveals y marquees
  assets/photos/         Fotos de ambiente (ver créditos) y gerard.jpg (ver TODO)
  assets/images/         Capturas de la app
  og/                    Fuentes estáticas para generar la imagen OG
apps-script/             Code.gs + instrucciones para Gerard
tests/qa.spec.ts         QA con Playwright + axe-core
scripts/                 qa.mjs, qa-server.mjs, preview.mjs, lighthouse.mjs, inp.mjs,
                         anim-size.mjs (peso del JS de animación), csp-hash.mjs
qa/                      REPORT-v2.md, screenshots-v2/, lighthouse-v2/, photo-sheets/
                         (y el QA de la primera versión: REPORT.md, screenshots/, lighthouse/)
public/textures/         grain.svg (grano con feTurbulence)
vercel.json              Cabeceras de seguridad, CSP, caché y redirecciones
.env.example
```

## Decisiones técnicas y desviaciones

- **`astro preview` no existe con `@astrojs/vercel`.** QA y preview usan `@astrojs/node` con el
  mismo código (ver sección 1). Es un bloqueo técnico del adaptador, no del código.
- **CSP sin `'unsafe-inline'` en `script-src`.** Astro está configurado para no incrustar scripts
  (`vite.build.assetsInlineLimit: 0`). La única excepción es el script mínimo de la intro en el
  `<head>` de la home (decide antes del primer pintado si se muestra la animación), permitido por su
  **hash sha256** en `vercel.json`. Si se cambia `src/lib/intro.ts`, hay que actualizar el hash con
  `node scripts/csp-hash.mjs --write` (un test lo comprueba). El JSON-LD no es ejecutable y la CSP no
  lo bloquea. `style-src-attr 'unsafe-inline'` se mantiene para los atributos `style` (escalonado
  `--i` de las animaciones y tamaño de la foto de Gerard).
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
- **Póster propio de la VSL** (foto de ambiente, no la miniatura de YouTube): antes del clic no hay
  ninguna petición a YouTube; al hacer clic se carga `youtube-nocookie` con un fundido de 250 ms.
- **Hero con dirección de arte**: foto vertical hasta 1023 px y horizontal desde 1024 px, con
  precarga responsive (`imagesrcset` + `media`) de la AVIF. En pantallas bajas y en tablet el velo es
  algo más denso que el del encargo para mantener el contraste AA en el peor punto (el texto sube
  hacia las ventanas claras de la foto).
- **Animación inicial**: CSS puro (≤ 1,1 s, una vez por sesión con `sessionStorage`, nunca con
  `prefers-reduced-motion`, `pointer-events: none`). Sin JS no se muestra.
- **Marquees** (cinta de stats y testimonios): la copia del bucle lleva `aria-hidden` e `inert`;
  como `inert` también bloquea los clics, un clic en "Leer más" de la copia abre el mismo testimonio.
- **Altura de la home**: el límite de 7200 px en 390x844 obliga a espaciados compactos en móvil
  (secciones de 34 px de padding vertical, citas de 3 líneas en las tarjetas). En escritorio el aire
  es mayor.
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
  endpoint `/_image` solo acepta imágenes locales.
- `x-astro-path` del adaptador de Vercel: afecta al enrutado del render serverless; aquí la única
  ruta dinámica es `/api/lead`.

Mitigado con `overrides` en `package.json` (`sharp`, `path-to-regexp`, `vite`, `playwright-core`).
**Recomendación:** migrar a Astro 7 y `@astrojs/vercel` 11 cuando se pueda (el código no usa APIs
que cambien de forma relevante).

## QA

`npm run qa` compila, levanta el servidor de QA con `LEAD_MOCK=1` y ejecuta `tests/qa.spec.ts`:
12 viewports, capturas con y sin intro, scroll horizontal, consola y CSP, enlaces, imágenes, áreas
táctiles, H1, viudas en H1/H2, axe-core, contraste AA del texto sobre fotos, CTAs centrados y a
`#valoracion`, recuento de palabras, altura de la home, intro, marquees, reveals y parallax, hovers,
flujos de consentimiento y Pixel, VSL, formulario (camino feliz, casos límite, sin JS), barra fija,
páginas legales, cabeceras y presupuesto de JS. `npm run qa:lighthouse` guarda los informes en
`qa/lighthouse-v2/` y `node scripts/inp.mjs` mide la latencia de interacción.
Resultados en [`qa/REPORT-v2.md`](qa/REPORT-v2.md).

## Contacto del titular

Gerard Barrantes Bautista · RehabilityWOD · info@rehabilitywod.com
