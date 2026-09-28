# Informe de QA · Landing RehabilityWOD

- Fecha: 28/09/2026.
- Build: Astro 5.18.2 compilado con `@astrojs/node` y servido por `scripts/qa-server.mjs`, que aplica
  `vercel.json` (cabeceras, CSP, redirecciones, `cleanUrls`, `trailingSlash`) y comprime con brotli,
  como Vercel. `LEAD_MOCK=1`.
- Navegador: Chromium 141 (Playwright 1.56.1) + axe-core 4.13 (`@axe-core/playwright` 4.13).
- Reproducir: `npm run qa` (tests y capturas) y `npm run qa:lighthouse` (Lighthouse).
  `node scripts/inp.mjs` mide la latencia de interacción.

**Resultado: 48/48 tests en verde.** Capturas en `qa/screenshots/{ancho}x{alto}/`, informes de
Lighthouse en `qa/lighthouse/`.

## 1. Viewports

En cada viewport se comprueban las 5 páginas (`/`, `/aviso-legal`, `/privacidad`, `/cookies`,
`/gracias`) con la CSP real y se guardan capturas: página completa, cada sección, primera pantalla,
barra CTA fija (móvil), banner de cookies en primera visita, banner sobre el formulario, panel
Configurar (móvil), pasos 1 y 4 del formulario y las páginas legales.

| Viewport                 | Scroll horizontal | Consola / CSP | axe serio o crítico | Enlaces y anclas | Imágenes y `alt` | Áreas táctiles ≥ 44 px | Un H1 | Viudas H1/H2 | Revisión visual |
| ------------------------ | ----------------- | ------------- | ------------------- | ---------------- | ---------------- | ---------------------- | ----- | ------------ | --------------- |
| 320x568                  | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 360x740                  | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 375x667                  | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 390x844                  | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 414x896                  | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 430x932                  | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 844x390 (móvil apaisado) | No                | 0             | 0                   | OK               | OK               | OK                     | OK    | 0            | OK              |
| 768x1024                 | No                | 0             | 0                   | OK               | OK               | n/a                    | OK    | 0            | OK              |
| 1024x768                 | No                | 0             | 0                   | OK               | OK               | n/a                    | OK    | 0            | OK              |
| 1280x800                 | No                | 0             | 0                   | OK               | OK               | n/a                    | OK    | 0            | OK              |
| 1440x900                 | No                | 0             | 0                   | OK               | OK               | n/a                    | OK    | 0            | OK              |
| 1920x1080                | No                | 0             | 0                   | OK               | OK               | n/a                    | OK    | 0            | OK              |

Las áreas táctiles se comprueban en los viewports móviles, también con el banner abierto, con el
panel Configurar y en el paso 4 del formulario. En cada viewport también se verifica que el banner
de cookies no impide llegar al botón del formulario.

## 2. Problemas encontrados y cómo se han arreglado

| #   | Problema                                                                                 | Dónde                               | Arreglo                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Scroll horizontal en móvil (la página se ensanchaba a 792 px)                            | Cómo funciona                       | El grid tomaba el ancho mínimo de la fila de capturas: `grid-template-columns: minmax(0, 1fr)` y `min-width: 0`                                                                                                    |
| 2   | El H1 y el eyebrow tapaban la cara de Gerard en móvil vertical                           | Hero                                | La foto ocupa el hueco que deja el texto y se funde en negro bajo él; el CTA sigue en la primera pantalla incluso a 320x568                                                                                        |
| 3   | En móvil apaisado el H1 (60 px por el `clamp`) tapaba la cara                            | Hero 844x390                        | Foto al 62 % derecho con fundido a la izquierda y H1 a 42 px                                                                                                                                                       |
| 4   | Eyebrow y textos poco legibles sobre la foto                                             | Hero                                | Sombra de texto neutra y sutil                                                                                                                                                                                     |
| 5   | La línea de confianza empezaba una línea con "·"                                         | Hero                                | Separadores que se recortan al inicio de cada línea                                                                                                                                                                |
| 6   | Navegación del formulario no anclada abajo y hueco sobrante                              | Formulario                          | Barra común Atrás/Continuar/Enviar al final del `<form>` (el `<fieldset>` en flex no estira su caja interna) y altura mínima medida con el paso más alto: la tarjeta no cambia de alto entre pasos en ningún ancho |
| 7   | "Enviar y valorar mi caso" partido en dos líneas a 320 px                                | Paso 4                              | Por debajo de 360 px el botón ocupa la fila y "Atrás" va debajo                                                                                                                                                    |
| 8   | Capturas de la app pisando el texto de los pasos                                         | Cómo funciona ≥ 1024                | Marcos que encogen para caber en su columna                                                                                                                                                                        |
| 9   | La línea de la lista quedaba pegada al H2                                                | Por qué, Cómo funciona              | Un `margin: 0` con ámbito anulaba `mt-10`: márgenes corregidos                                                                                                                                                     |
| 10  | Tercer "dolor" desalineado en la fila de 3                                               | Por qué ≥ 768                       | `align-content: start` en cada elemento                                                                                                                                                                            |
| 11  | axe `scrollable-region-focusable`                                                        | Capturas en móvil, tabla de cookies | Regiones con scroll enfocables por teclado (`tabindex="0"` cuando hay scroll)                                                                                                                                      |
| 12  | Enlaces en línea de 20–42 px de alto                                                     | Páginas legales, banner, casilla    | `padding-block: 13px` en enlaces en línea: 44 px de área sin mover el texto                                                                                                                                        |
| 13  | Viudas: "Política de / privacidad", "Transferencias / internacionales"                   | Legales                             | Espacio de no separación y título "Transferencias internacionales de datos"                                                                                                                                        |
| 14  | Aceptar (99 px) y Rechazar (110 px) con distinto ancho en escritorio                     | Banner                              | Columnas iguales de 120 px                                                                                                                                                                                         |
| 15  | Aviso de Chromium `Unrecognized feature: 'web-share'` al reproducir                      | VSL                                 | Quitado de `allow` del iframe                                                                                                                                                                                      |
| 16  | Header justo a 320 px                                                                    | Header                              | Wordmark y botón algo más compactos por debajo de 360 px                                                                                                                                                           |
| 17  | "·" al inicio de línea en el ©                                                           | Footer                              | Espacio de no separación                                                                                                                                                                                           |
| 18  | **POST sin JavaScript rechazado con 403** (habría fallado en producción)                 | API                                 | El `checkOrigin` de Astro reconstruye la URL como `localhost` en Vercel; desactivado y sustituido por una comprobación de origen propia                                                                            |
| 19  | **Iconos con trazo 2 px** en lugar de 1,5                                                | Iconos Lucide                       | La prop correcta de `@lucide/astro` es `stroke-width` (detectado por `astro check`)                                                                                                                                |
| 20  | Riesgo: los eventos automáticos de Meta envían el texto de los botones (p. ej. "Hombro") | Pixel                               | `fbq('set', 'autoConfig', false, id)` antes de `init`                                                                                                                                                              |
| 21  | Riesgo: en producción sin `GOOGLE_SCRIPT_URL` el modo mock "acepta" leads                | API                                 | Aviso explícito en los logs de Vercel y en el README                                                                                                                                                               |
| 22  | 14 módulos JS compitiendo con la imagen LCP                                              | Home                                | Scripts agrupados en dos entradas: 7 archivos, 10,5 KB comprimidos                                                                                                                                                 |
| 23  | Anillo de foco muy llamativo al enfocar el banner en la primera visita                   | Banner                              | Anillo visible pero más discreto                                                                                                                                                                                   |
| 24  | Tipos: dos versiones de Vite y de `playwright-core`                                      | Dependencias                        | `overrides` en `package.json`                                                                                                                                                                                      |

Problemas del propio arnés de QA, corregidos en los tests (no en la web): secciones en blanco en las
primeras capturas (el scroll suave impedía disparar las animaciones de entrada), capturas de sección
con elementos fijos encima (la CSP bloqueaba el estilo inyectado por Playwright: las capturas usan un
contexto aparte con `bypassCSP`; las comprobaciones de CSP se hacen en otro sin él) y selectores
ambiguos por los chips de zona de los testimonios.

## 3. Lighthouse (`qa/lighthouse/`)

Lighthouse 13.5, 3 ejecuciones por perfil; se guarda la mediana.

| Perfil                      | Performance          | Accessibility | Best Practices | SEO     | FCP    | LCP        | TBT  | CLS   | Peso   |
| --------------------------- | -------------------- | ------------- | -------------- | ------- | ------ | ---------- | ---- | ----- | ------ |
| Móvil (4G simulado, CPU 4x) | **99** (99, 99, 100) | **100**       | **100**        | **100** | 1,19 s | **1,80 s** | 0 ms | **0** | 136 KB |
| Escritorio                  | **100**              | **100**       | **100**        | **100** | 0,27 s | 0,42 s     | 0 ms | 0     | 146 KB |

| Objetivo (sección 12)                             | Resultado                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Performance móvil ≥ 95                            | 99                                                                                                                      |
| Accessibility, Best Practices, SEO = 100          | 100 / 100 / 100                                                                                                         |
| LCP < 2,0 s (4G simulado)                         | 1,80 s (mediana; 1,66–1,81 s)                                                                                           |
| CLS < 0,02                                        | 0                                                                                                                       |
| INP < 150 ms                                      | Peor interacción 80 ms con CPU 4x (`qa/lighthouse/inp.json`: banner, CTA, chip, saltar, escribir, continuar, FAQ, play) |
| JS home < 30 KB comprimido (sin Pixel ni YouTube) | 10,5 KB en 7 archivos (+ los dos scripts de Vercel, que sirve la plataforma)                                            |
| Hero AVIF < 180 KB a 960 px                       | 15,7 KB (640: 9,3 KB · 1280: 24,3 KB)                                                                                   |

## 4. Flujos (sección 15.3)

| Flujo                                                                                                                                                                                                                                                           | Resultado |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Sin decidir: ninguna petición a `facebook.net`/`facebook.com`, sin `_fbp`, foco en el banner                                                                                                                                                                    | OK        |
| Esc cierra sin decidir y el banner vuelve en la siguiente página                                                                                                                                                                                                | OK        |
| Aceptar y Rechazar con el mismo tamaño, color y peso (móvil y escritorio), ≥ 44 px                                                                                                                                                                              | OK        |
| Rechazar: sin peticiones tras recargar                                                                                                                                                                                                                          | OK        |
| Aceptar: `fbevents.js` y `tr?ev=PageView` en la misma visita, sin datos de salud, sin errores ni CSP                                                                                                                                                            | OK        |
| Configurar → Marketing → Guardar: igual que Aceptar (Técnicas activo y deshabilitado)                                                                                                                                                                           | OK        |
| Visita siguiente con consentimiento: Pixel al inicio                                                                                                                                                                                                            | OK        |
| Retirar desde el footer: se borran `_fbp` y `_fbc` y no sale ningún evento más (ni `ViewContent` al dar a play)                                                                                                                                                 | OK        |
| VSL: antes del clic ni iframe ni peticiones a YouTube; después iframe `youtube-nocookie` con `autoplay=1`; `vsl_play` y `ViewContent` (VSL); sin errores ni CSP con el vídeo en marcha                                                                          | OK        |
| Formulario, camino feliz (Hombro → saltar → Ana → 612345678 → casilla): la API recibe `+34612345678` y un `event_id` v4, se guarda, `/gracias` muestra "Recibido, Ana." (el nombre no va en la URL) y sale `Lead` con `eid` = `event_id` y sin datos personales | OK        |
| "Otro" sin detalle: no avanza, error con `aria-invalid`, título "¿Qué te pasa?", sin "Saltar"                                                                                                                                                                   | OK        |
| Teléfono de 8 dígitos: falla · `+44 7700 900123`: pasa (`+447700900123`)                                                                                                                                                                                        | OK        |
| Sin casilla: no envía · Nombre de 1 carácter: falla                                                                                                                                                                                                             | OK        |
| Volver atrás conserva zona, detalle y nombre; sin "Atrás" en el paso 1                                                                                                                                                                                          | OK        |
| Solo teclado: Tab, flechas en los chips (sin autoavance), Enter avanza, foco al título de cada paso                                                                                                                                                             | OK        |
| Honeypot relleno (desde la interfaz y contra la API): responde ok y no guarda                                                                                                                                                                                   | OK        |
| Envío en menos de 3 s: responde ok y no guarda                                                                                                                                                                                                                  | OK        |
| Validación en servidor (422 con los campos) y `GET /api/lead` → 405                                                                                                                                                                                             | OK        |
| Sin JavaScript: se ven los 4 pasos, POST nativo a `/api/lead` → 303 → `/gracias`, lead guardado                                                                                                                                                                 | OK        |
| Barra CTA fija: aparece al pasar el hero, desaparece en `#valoracion`, en el footer no tapa nada                                                                                                                                                                | OK        |
| Barra CTA fija: nunca coincide con el banner (ni al abrirlo desde el footer)                                                                                                                                                                                    | OK        |
| Safe area del iPhone (390x844, `hasTouch`, `isMobile`): con insets emulados por CDP el `padding-bottom` crece 34 px; `viewport-fit=cover`                                                                                                                       | OK        |
| Marquee: se mueve a la izquierda, 52 s lineal e infinito, copia `aria-hidden` + `inert`, empalme sin salto (< 1,5 px), pausa con hover                                                                                                                          | OK        |
| Marquee con `reducedMotion: 'reduce'`: sin animación, scroll manual con snap, sin copia; contador muestra +120                                                                                                                                                  | OK        |
| "Leer más": `<dialog>` modal con el texto completo, Esc cierra y devuelve el foco                                                                                                                                                                               | OK        |
| Estructura: 6 secciones en orden (`inicio`, `video`, `por-que`, `como-funciona`, `opiniones`, `valoracion`), CTA al final de cada una salvo la 6, CTA en header y barra fija                                                                                    | OK        |
| Copy de la sección 4 literal (76 textos comprobados, más zonas, placeholder y casilla sin marcar)                                                                                                                                                               | OK        |
| Legales: datos del titular en las tres páginas, transferencias corregidas, "Última actualización"                                                                                                                                                               | OK        |
| `/vsl` → 301 `/#video` · `/gracias` noindex y fuera del sitemap · cabeceras de seguridad · sin `unsafe-inline` en `script-src`                                                                                                                                  | OK        |
| Sin guiones largos, emojis ni estrellas en ninguna página                                                                                                                                                                                                       | OK        |

Pruebas adicionales fuera de Playwright:

- **Reenvío a Apps Script**: `/api/lead` con un Apps Script simulado que responde con la redirección
  302 típica de Google: sigue la redirección, envía `secret` y el teléfono en E.164, y responde 502
  (sin datos personales en el log) si el secreto no coincide.
- **`Code.gs`** ejecutado en Node con dobles de `SpreadsheetApp`, `LockService`, `MailApp`, etc.:
  secreto incorrecto → `{ok:false}`; cabecera exacta; Estado "Nuevo" con desplegable; saneado de
  fórmulas (`'=HYPERLINK…`, `'@Ana`, `'-ig`, teléfono `'+34…` como texto); email con asunto
  "Nuevo lead: {nombre} · {zona}" y enlace `wa.me/34…`; `doGet` → `{ok:true,status:'up'}`; `testLead`.
- **Build de Vercel**: `.vercel/output/config.json` enruta solo `/api/lead` (y las rutas internas de
  Astro) a la función; todas las páginas son estáticas.
- `astro check` 0 errores, ESLint 0 errores, Prettier OK.

## 5. Lo que no se ha podido verificar en local

| Qué                                               | Por qué                                                                                                                                                       | Cómo se ha cubierto                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Envío real a Apps Script, fila en la hoja y email | No hay `GOOGLE_SCRIPT_URL` ni cuenta de Google                                                                                                                | Apps Script simulado con redirección 302 y `Code.gs` probado con dobles. Gerard debe hacer la prueba real (README, paso 6)                       |
| Pixel en Meta Pixel Helper y Events Manager       | Requiere cuenta de Meta y navegador con extensión                                                                                                             | Se ejecuta el `fbevents.js` real de Meta (servido desde caché) y se comprueban las peticiones `tr` (`PageView`, `ViewContent`, `Lead` con `eid`) |
| Red real hacia Meta                               | El proxy de salida de este entorno reemite TLS y hace las peticiones de Chromium lentas e intermitentes; además Meta descarta los eventos de `HeadlessChrome` | `fbevents.js` real desde caché, peticiones `tr` interceptadas y user agent de Chrome normal. `QA_LIVE_META=1` usa la red real                    |
| Conversions API                                   | No hay `META_CAPI_TOKEN` (desactivada por defecto)                                                                                                            | Código revisado: solo con consentimiento, `event_id` compartido, teléfono con SHA-256, sin zona ni detalle                                       |
| Recepción en Vercel Analytics y Speed Insights    | Los scripts de `/_vercel/*` solo existen en Vercel                                                                                                            | Servidor de QA con stub; los eventos quedan en `window.vaq` y se comprueban (`cta_click`, `vsl_play`, `form_step`…)                              |
| Cabeceras aplicadas por Vercel                    | No hay despliegue                                                                                                                                             | `qa-server.mjs` aplica `vercel.json` tal cual; se revisó el `config.json` del build de Vercel                                                    |
| Safe area en un iPhone real                       | Sin dispositivo                                                                                                                                               | Insets emulados por CDP (`Emulation.setSafeAreaInsetsOverride`)                                                                                  |
| Safari y Firefox                                  | Solo hay Chromium en el entorno                                                                                                                               | CSS estándar con alternativas (`svh`, `:has`, `text-wrap` degradan bien). Recomendado probar en un iPhone antes de lanzar                        |
| Reproducción del vídeo                            | Se verifica la carga del iframe y el autoplay en la URL, no el streaming de YouTube                                                                           | —                                                                                                                                                |
| Dominio, DNS, HTTPS y HSTS                        | Sin despliegue                                                                                                                                                | Pasos en el README                                                                                                                               |

## 6. Imágenes temporales

Hero y "Quién está detrás" usan fotogramas reales de la VSL de Gerard (1280x720). El collage de la
web actual (`collage.png`, unos 220 px por foto) se descartó porque se veía pixelado a pantalla
completa, que es uno de los criterios de esta revisión. Las capturas de la app son las reales de la
web actual (1080x2340). No se ha usado `portada-CG-oTVwW.jpg` (imagen generada por IA con la marca
CrossFit). Ver `TODO(Gerard)` en el README.
