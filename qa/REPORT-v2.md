# Informe de QA · Rediseño v2 de la landing RehabilityWOD

- Fecha: 28/09/2026.
- Build: Astro 5.18.2 compilado con `@astrojs/node` (`ASTRO_ADAPTER=node`) y servido por
  `scripts/qa-server.mjs`, que aplica `vercel.json` (cabeceras, CSP, redirecciones, `cleanUrls`,
  `trailingSlash`) y comprime con brotli, como Vercel. `LEAD_MOCK=1`.
- Navegador: Chromium 141 (Playwright 1.56.1) + axe-core 4.13. Lighthouse 13.5.
- Reproducir: `npm run qa` (tests y capturas), `npm run qa:lighthouse` (Lighthouse, 3 pasadas por
  perfil, mediana), `node scripts/inp.mjs` (latencia de interacción con CPU x4) y
  `node scripts/anim-size.mjs` (peso del JS de animación).

**Resultado: 59/59 tests en verde**, `astro check` sin errores ni avisos, ESLint y Prettier
limpios. Capturas en `qa/screenshots-v2/{ancho}x{alto}/`, informes de Lighthouse en
`qa/lighthouse-v2/`, hojas de miniaturas de fotos en `qa/photo-sheets/`.

## 1. Viewports

En cada viewport se comprueban las 5 páginas (`/`, `/aviso-legal`, `/privacidad`, `/cookies`,
`/gracias`) con la CSP real y se guardan capturas en JPEG: página completa, primera pantalla, cada
bloque de la home (`home-01-hero` … `home-08-footer`), la animación inicial en tres momentos
(`intro-1-pulso`, `intro-2-apertura`, `intro-3-hero`), barra CTA fija (móvil), banner de cookies en
primera visita y sobre el formulario, panel Configurar (móvil), pasos 1 y 4 del formulario y las
páginas legales. Las capturas "sin intro" son todas las de página y sección (se marcan como vista la
intro en la sesión); las "con intro" son las tres `intro-*`. Los estados hover de escritorio están
en `qa/screenshots-v2/hover/`.

| Viewport                 | Scroll horizontal | Consola / CSP | axe serio o crítico | Un H1 | CTAs a `#valoracion` y centrados | Contraste AA sobre fotos | Viudas H1/H2 | Revisión visual |
| ------------------------ | ----------------- | ------------- | ------------------- | ----- | -------------------------------- | ------------------------ | ------------ | --------------- |
| 320x568                  | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 360x740                  | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 375x667                  | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 390x844                  | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 414x896                  | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 430x932                  | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 844x390 (móvil apaisado) | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 768x1024                 | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 1024x768                 | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 1280x800                 | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 1440x900                 | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |
| 1920x1080                | No                | 0             | 0                   | OK    | OK                               | OK                       | 0            | OK              |

También en cada viewport: enlaces y anclas, `alt` e imágenes cargadas, áreas táctiles ≥ 44 px (en
móvil, también con el banner, el panel Configurar y el paso 4), que el banner de cookies no impide
llegar al botón del formulario, y que el único CTA que no va a `#valoracion` es "Ver el vídeo".

**Contraste del texto sobre fotos** (medido sobre el fondo real: se oculta el texto y se toma el
percentil 99 de luminancia de los píxeles bajo cada línea): en los 12 viewports todo cumple AA. Titulares
(texto grande, mínimo 3:1): peor punto el acento verde de la frase de cierre, **3,33:1** (390 a
430 px); el acento del H1 no baja de **3,49:1** (320x568). Texto normal (mínimo 4,5:1): peor punto
la entradilla del formulario, **5,32:1**; el subtítulo del hero no baja de **7,27:1** (1024x768).
El detalle por viewport está en las anotaciones del test (`qa/.tmp/results.json` al ejecutar
`npm run qa`).

## 2. Revisión de capturas, hovers y animaciones

- Capturas revisadas una a una en los 12 viewports (titulares, legibilidad, encuadres, nitidez, CTAs,
  solapes con la barra fija o el banner, ritmo entre secciones, alturas de tarjetas, marquees y
  desbordes). Los problemas encontrados están en la sección 3.
- **Intro**: sale una vez por sesión (`sessionStorage`), el panel queda oculto a los ≤ 1,1 s, no
  recibe clics, no sale con `prefers-reduced-motion` ni sin JS.
- **Word-up del H1**: empieza a los 650 ms con intro (cuando se abre el panel) y a los 100 ms sin
  ella.
- **Marquees** (cinta de stats y testimonios): se comparan posiciones en el tiempo; avanzan hacia la
  izquierda, sin salto en la costura del bucle (la copia mide exactamente lo mismo), se paran con
  hover, con foco y al mantener pulsado, y con `reduced-motion` pasan a scroll manual.
- **Reveals, parallax y barra de progreso**: los elementos visibles al cargar no se animan, los de
  abajo entran al 15 % de visibilidad; el parallax mueve las bandas ±40 px como máximo; la barra de
  progreso sigue el scroll. Ningún titular lleva `clip-path` (recortaría las tildes).
- **Hovers** capturados en escritorio (1440x900, `qa/screenshots-v2/hover/`): botón primario, botón
  secundario, botón del header, póster de la VSL, tarjeta de "Te suena", paso de "Cómo funciona",
  capturas de la app, tarjeta de testimonio (sube 6 px), opción del formulario y letras del footer.

## 3. Problemas encontrados y cómo se han arreglado

| #   | Problema                                                                                             | Dónde          | Arreglo                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Frases de la banda, de Gerard y del cierre en Work Sans pequeña                                      | 3B, 5B, cierre | Los estilos con ámbito del padre no llegaban a `SplitWords`: el componente pasa sus atributos al elemento raíz                                                                       |
| 2   | Home de 8656 px en 390x844 (límite 7200)                                                             | Toda la home   | Espaciado compacto en móvil (34 px de padding vertical por sección), capturas de la app al 30 vw, citas de 3 líneas, H2 a 12,31 vw y enlaces legales en una fila: 7160 px            |
| 3   | El título del póster pisaba el botón de play en móvil                                                | VSL            | Play al 71 % del ancho por debajo de 640 px y saltos de línea fijos en el título                                                                                                     |
| 4   | "VUELTA REAL AL / BOX." con una palabra sola                                                         | Opiniones      | "al box." sin partir y tamaño del H2 ajustado para que quepa en 2 líneas a 390 px                                                                                                    |
| 5   | El número "01" pisaba la frase de la tarjeta                                                         | 3A             | Más padding superior en la tarjeta                                                                                                                                                   |
| 6   | Datos de Gerard solapados y chip pegado al borde a 320 px                                            | 5B             | Por debajo de 360 px los datos van en columna y el chip es más compacto                                                                                                              |
| 7   | Subtítulo del hero a 2,41:1 en escritorio y acento del H1 justo                                      | Hero           | Subtítulo en `#e2e2de` y velo algo más denso (radial detrás del texto); también en pantallas bajas, tablet y apaisado                                                                |
| 8   | Viuda en un H2 legal a 320 px                                                                        | Legales        | Tamaño del H2 con `clamp`                                                                                                                                                            |
| 9   | Los bloques con `reveal-clip` no aparecían nunca                                                     | Varias         | `IntersectionObserver` tiene en cuenta el `clip-path` del propio elemento: se observa su contenedor                                                                                  |
| 10  | Tildes recortadas en la primera línea de H2 ("¿POR QUÉ", "CUÉNTAME", "ASÍ", "LESIÓN" a 1920)         | H2 con reveal  | El `clip-path: inset(0)` se aplicaba a todo reveal terminado: ahora solo a `reveal-clip`, y la máscara del word-up tiene más margen. Test de regresión                               |
| 11  | "Enviar y valorar mi caso" partido en dos líneas a 390 px                                            | Paso 4         | Por debajo de 440 px el envío ocupa la fila y "Atrás" va debajo                                                                                                                      |
| 12  | La tarjeta del formulario cambiaba de alto entre pasos (535/551 px) a 390 y 430 con `reduced-motion` | Formulario     | La regla de `reduced-motion` ponía transiciones de 0,01 ms en todo, y al medir los pasos se leía el valor anterior al cambio: ahora 0 s. La barra usa una clase en lugar de `:has()` |
| 13  | Capturas de 125 MB en PNG                                                                            | QA             | Capturas en JPEG (calidad 82)                                                                                                                                                        |
| 14  | La captura de hover no se estabilizaba sobre los marquees                                            | QA (test)      | Se pausa el marquee con hover antes de capturar                                                                                                                                      |

Tras las correcciones, las capturas de los 12 viewports no muestran titulares mal partidos, caras
cortadas, fotos blandas, CTAs descentrados, solapes, tarjetas irregulares ni desbordes laterales.

## 4. Puntuaciones

### Lighthouse (mediana de 3 pasadas, `qa/lighthouse-v2/`)

| Perfil     | Rendimiento | Accesibilidad | Buenas prácticas | SEO | FCP    | LCP    | TBT   | CLS | Speed Index | Peso   |
| ---------- | ----------- | ------------- | ---------------- | --- | ------ | ------ | ----- | --- | ----------- | ------ |
| Móvil      | **98**      | 100           | 100              | 100 | 1,33 s | 2,18 s | 43 ms | 0   | 2,11 s      | 210 KB |
| Escritorio | **100**     | 100           | 100              | 100 | 0,34 s | 0,62 s | 0 ms  | 0   | 0,84 s      | 327 KB |

Objetivos: móvil ≥ 92 y 100 en el resto (cumplido), escritorio ≥ 97 (cumplido), LCP < 2,3 s
(2,18 s en móvil con 4G simulado y CPU x4) y CLS < 0,02 (0). Las tres pasadas de móvil dan 98 y las
de escritorio 100. En móvil el LCP es el H1: Chrome no cuenta como LCP las imágenes que ocupan toda
la pantalla, y la foto del hero se precarga igualmente con `fetchpriority="high"`.

### Interacción (INP, CPU x4, `qa/lighthouse-v2/inp.json`)

| Interacción                  | Latencia máx. |
| ---------------------------- | ------------- |
| Rechazar cookies (banner)    | 80 ms         |
| CTA del hero → `#valoracion` | 40 ms         |
| Chip "Rodilla"               | 120 ms        |
| Saltar paso                  | 88 ms         |
| Escribir nombre              | 40 ms         |
| Continuar                    | 80 ms         |
| Abrir FAQ                    | 48 ms         |
| Tocar tarjeta                | 64 ms         |
| Play de la VSL               | 48 ms         |

Peor interacción: **120 ms** (objetivo < 150 ms), en un móvil emulado a 390x844 con la CPU 4x más
lenta.

### Presupuestos

| Medida                                             | Objetivo           | Resultado                                       |
| -------------------------------------------------- | ------------------ | ----------------------------------------------- |
| JS de la home (sin Pixel, YouTube ni Vercel)       | < 35 KB comprimido | 11,0 KB (7 archivos, brotli); 11,7 KB con gzip  |
| JS de animación (reveal, parallax, marquee, intro) | < 6 KB gzip        | 1,3 KB (1,1 KB de módulos + 0,2 KB de la intro) |
| CSS                                                | Sin objetivo       | Un archivo, ~15 KB gzip                         |
| Hero a 1080 px                                     | < 200 KB           | 89 KB en AVIF                                   |
| Altura de la home en 390x844                       | ≤ 7200 px          | 7160 px                                         |
| Palabras de la home                                | ≤ 420              | 360                                             |

El recuento de palabras excluye testimonios, FAQ, formulario, footer y textos legales (sección 4.3
del encargo) y lo hace un test sobre el DOM real.

## 5. Flujos que no pueden romperse

Todos cubiertos por `tests/qa.spec.ts` y en verde:

- Consentimiento: nada de Meta antes de aceptar; `PageView` al aceptar en la misma visita;
  revocación desde el footer.
- VSL con fachada: ninguna petición a YouTube antes del clic; al reproducir, `vsl_play` y
  `ViewContent`, sin errores de CSP.
- Formulario: camino feliz, caso "Otro" (detalle obligatorio), validaciones de teléfono y casilla,
  formulario sin JS (todos los pasos a la vista y envío clásico), envío en modo mock a `/gracias` con
  el nombre y `Lead` con `eventID` (el mismo que recibe la API para CAPI).
- Barra CTA fija en móvil: solo el botón; aparece cuando el CTA del hero sale de pantalla, se oculta
  con el formulario en pantalla y nunca coincide con el banner de cookies.
- Legal, SEO (títulos, descripción, canónica, Open Graph, JSON-LD, sitemap, robots), cabeceras y
  CSP con el hash de la intro.

## 6. Créditos de imágenes

Las 6 fotos son de **Unsplash** con la [Unsplash License](https://unsplash.com/license) (uso
comercial, sin atribución obligatoria; ninguna es Unsplash+). Hojas de miniaturas por hueco y hoja
final de la serie en `qa/photo-sheets/`.

| Hueco              | Foto                                                                       | Autor                             |
| ------------------ | -------------------------------------------------------------------------- | --------------------------------- |
| 1 Hero móvil       | [unsplash.com/photos/03b61PY89hs](https://unsplash.com/photos/03b61PY89hs) | Ambitious Studio\* · Rick Barrett |
| 2 Hero escritorio  | [unsplash.com/photos/w7jYaN7GqyA](https://unsplash.com/photos/w7jYaN7GqyA) | Ambitious Studio\* · Rick Barrett |
| 3 Banda 3B         | [unsplash.com/photos/gNvNsHIckSc](https://unsplash.com/photos/gNvNsHIckSc) | HamZa NOUASRIA                    |
| 4 Póster VSL       | [unsplash.com/photos/9dzWZQWZMdE](https://unsplash.com/photos/9dzWZQWZMdE) | Anastase Maragos                  |
| 5 Fondo formulario | [unsplash.com/photos/uH8JDWuxFX8](https://unsplash.com/photos/uH8JDWuxFX8) | Julien Dumas                      |
| 6 Cierre           | [unsplash.com/photos/h4i9G-de7Po](https://unsplash.com/photos/h4i9G-de7Po) | John Arano                        |

Foto de Gerard: no llegó adjunta. Se usa el recorte provisional de `rehabilitywod.com/collage.png`
(150x188 px, mostrado a 75 px) con `TODO(Gerard)` en el README. No se ha sustituido por stock.

## 7. Desviaciones respecto al encargo

- **Play del póster en móvil** a la derecha (71 % del ancho) en lugar de centrado, para no tapar el
  título.
- **Velos del hero** algo más densos que los del encargo en pantallas bajas, tablet y escritorio,
  para mantener el contraste AA en el peor punto.
- **Chip de zona de los testimonios**: al hacer hover se rellena de `--brand-strong` en lugar de
  `--brand` (texto blanco sobre `--brand` se queda en 3,7:1, por debajo de AA).
- **H2** con mínimo de 42 px por debajo de 360 px (con 48 px "VUELTA REAL AL BOX." no cabía sin
  dejar una palabra sola).
- **Espaciados compactos en móvil** y citas de 3 líneas en las tarjetas de testimonio (el texto
  completo está en "Leer más") para cumplir el límite de 7200 px.
- **Respuestas de la FAQ** acortadas (no cuentan para el límite de palabras, pero sí para la altura).
- **"Quién está detrás"** en formato compacto (foto pequeña junto a la frase) mientras no haya una
  foto de Gerard de 1600 px o más; con esa foto el bloque pasa solo al diseño grande.

## 8. Lo que no se ha podido verificar

- **Dispositivos reales** (iOS Safari, Android Chrome): todo se ha medido en Chromium emulado.
- **Despliegue de preview en Vercel** desde esta sesión: sin acceso a la cuenta de Vercel.
- **Meta en real**: los tests usan una copia local de `fbevents.js`; la recepción de eventos en
  Events Manager y la deduplicación con CAPI hay que mirarlas en la cuenta de Meta.
- **Apps Script real**: probado con el modo mock y un Apps Script simulado; falta la URL real
  (`GOOGLE_SCRIPT_URL`, `LEAD_SECRET`).
- **Foto de Gerard**: no llegó; el bloque está preparado para ella.
- **Datos de campo** (Core Web Vitals reales): solo cuando haya tráfico, en Speed Insights.
- **Webs de fotos**: Pixabay y Pexels respondían 403 (Cloudflare) y las páginas de Unsplash muestran
  un reto anti-bot (Anubis). No se ha intentado saltar ninguna protección: las candidatas se
  reunieron leyendo las páginas de búsqueda con la herramienta de lectura web y las fotos se
  descargaron del CDN público de Unsplash (`images.unsplash.com`). Por eso las 6 son de Unsplash.

## 9. Ajustes v3 (29/09/2026, a petición del cliente)

### Qué se ha cambiado

- **Más aire**: secciones con 72 px de padding vertical en móvil (antes 34) y 128 px en escritorio
  (antes 112), más separación entre titular y contenido, entre textos y en tarjetas, FAQ y footer.
- **App**: 4 capturas reales grandes (64 % del ancho en móvil, 240 px en escritorio) en marcos finos
  sin isla ni muesca que tapen la pantalla, con pie de foto; carrusel con snap en móvil y fila en
  escritorio. Se quita "Programas de 8, 12 o 24 semanas. El precio lo vemos en la valoración.".
- **Quién está detrás**: la foto de Gerard (fotograma de su VSL, 576x720) va en grande justo después
  del titular, con su nombre encima; "+120 atletas recuperados" pasa a ser un dato más, con el mismo
  estilo que los otros tres (2x2).
- **Formulario**: figura articulada más detallada con la zona resaltada (la espalda se ve de
  espaldas); las 8 opciones miden lo mismo (2x4 en móvil, 4x2 desde 768 px); cada paso mide lo
  que su contenido y el cambio de alto se anima; fuera las etiquetas redundantes (quedan para
  lectores de pantalla), la ayuda del prefijo y "Abro plazas cuando tengo hueco…".
- **Vídeo**: portada real del vídeo (servida desde la web) con el play centrado y sin título encima.
- **Footer**: marca y redes (Instagram, TikTok, Facebook), columnas Web, Legal y Contacto, barra con
  el © y "Volver arriba", y "REHABILITYWOD" a todo el ancho: las letras suben una a una al entrar
  y una ola suave las recorre cada 5 s (sin movimiento con `reduced-motion`).

### Problemas encontrados en el QA de v3 y arreglo

| #   | Problema                                                                 | Arreglo                                                              |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | A 1024 px las 4 capturas no cabían en la fila y el último pie se cortaba | Rejilla de 4 columnas de hasta 240 px con hueco fluido               |
| 2   | Email de contacto cortado en el footer entre 768 y 1023 px               | La marca va en su propia fila hasta 1024 px; el email puede partirse |
| 3   | Enlace "Vídeo" del footer con 41 px de ancho (mínimo 44)                 | `min-width: 44px` en los enlaces del footer                          |
| 4   | Ancla `#top` sin destino para el test de enlaces                         | `id="top"` en el `<body>`                                            |
| 5   | "Enviar y valorar mi caso" en dos líneas a 320 px                        | Menos padding lateral en el botón por debajo de 360 px               |
| 6   | En "Espalda / lumbar" la figura quedaba más alta que en el resto (4x2)   | Opciones alineadas arriba                                            |
| 7   | Captura de "Quién está detrás" a 1920 tomada a mitad del reveal          | El test espera 250 ms tras cada scroll antes de capturar             |

### Resultados

| Medida                               | Resultado                                                             |
| ------------------------------------ | --------------------------------------------------------------------- |
| Tests (12 viewports)                 | **59/59** en verde, `astro check`, ESLint y Prettier limpios          |
| Lighthouse móvil (mediana de 3)      | **98** / 100 / 100 / 100 · FCP 1,33 s · LCP 2,25 s · TBT 6 ms · CLS 0 |
| Lighthouse escritorio (mediana de 3) | **100** / 100 / 100 / 100 · LCP 0,62 s · CLS 0                        |
| Peor interacción (CPU x4)            | 120 ms (chip "Rodilla")                                               |
| JS de la home / de animación         | 10,8 KB brotli / 1,25 KB gzip                                         |
| Palabras de la home                  | 347 (máx. 420)                                                        |
| Altura en 390x844                    | 9795 px (el test vigila ahora 10 000 px; el cliente pidió más aire)   |
| Contraste del nombre sobre la foto   | 4,51:1 en el peor punto (texto grande, mínimo 3:1); cargo 6,16:1      |

Las fotos de ambiente siguen siendo de Unsplash salvo el póster del vídeo, que ahora es la portada
real de la VSL. La portada y la foto de Gerard son fotogramas de su propio vídeo publicado en
YouTube (imágenes públicas del vídeo, sin retoques).
