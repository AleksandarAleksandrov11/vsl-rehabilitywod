# Guardar los leads en Google Sheets

Cada vez que alguien rellena el formulario de valoración, la web envía los datos a un pequeño
programa de Google (Apps Script) que:

- los guarda en una fila nueva de la hoja **Leads**: fecha y hora, nombre, teléfono, zona de
  dolor, qué le pasa y los UTM del anuncio de Meta,
- manda un email a `aaswebmarketing@gmail.com` con todos los datos y un botón para responder por
  WhatsApp,
- deja la columna **Estado** en «Nuevo» (con color) para que la uses como mini-CRM
  (Nuevo, Contactado, Videollamada agendada, Cliente, Descartado),
- crea una pestaña **Resumen** con los leads de hoy, de los últimos 7 días, pendientes de
  contactar y por zona de dolor, campaña, anuncio y origen (Facebook, Instagram…).

Tardas unos 10 minutos. Solo hay que hacerlo una vez.

---

## 1. Abre la hoja de cálculo

La hoja de los leads es
[Leads RehabilityWOD](https://docs.google.com/spreadsheets/d/1yXt7gCggwLjPPN55o0Q9dlNhUlENz4gDpcd0NW4I3Kc/edit).
Ábrela con la cuenta de Google desde la que vas a instalar el script.

No hace falta crear columnas: el script crea las pestañas «Leads» y «Resumen» con la cabecera, la
fija arriba y le da formato la primera vez que se ejecuta.

## 2. Pega el script

1. En la hoja, abre **Extensiones → Apps Script**.
2. Borra todo lo que haya en el archivo `Código.gs`.
3. Copia el contenido completo de [`Code.gs`](./Code.gs) y pégalo.
4. Pulsa el icono de guardar (o `Ctrl + S` / `Cmd + S`).

## 3. Crea las dos propiedades del script

1. En el menú de la izquierda, entra en **Configuración del proyecto** (el icono de la rueda).
2. Baja hasta **Propiedades del script** y pulsa **Añadir propiedad del script**.
3. Crea estas dos:

| Propiedad      | Valor                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| `LEAD_SECRET`  | Una cadena larga y aleatoria (ver abajo). Es la «contraseña» entre la web y el script. |
| `NOTIFY_EMAIL` | `aaswebmarketing@gmail.com` (el correo que recibe el aviso de cada lead nuevo).        |

4. Pulsa **Guardar propiedades del script**.

Para generar `LEAD_SECRET` puedes usar cualquier generador de contraseñas y crear una de 40
caracteres o más, solo con letras y números. Guárdala: la necesitarás en el paso 6.

## 4. Ejecuta `testLead` una vez

1. Vuelve al editor (icono `< >`).
2. En el desplegable de funciones de la barra superior, elige **testLead**.
3. Pulsa **Ejecutar**.
4. Google te pedirá permisos: **Revisar permisos** → elige tu cuenta → **Configuración avanzada** →
   **Ir a (nombre del proyecto)** → **Permitir**. Es normal: el script necesita escribir en tu hoja
   y enviarte emails.

Comprueba que:

- en la hoja aparece la pestaña **Leads** con una fila de prueba («Prueba», zona «Hombro»),
- aparece la pestaña **Resumen** con las cifras,
- te ha llegado el email «Nuevo lead: Prueba · Hombro».

Puedes borrar esa fila de prueba cuando quieras.

## 5. Publica el script como aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. En «Seleccionar tipo» (la rueda), elige **Aplicación web**.
3. Rellena:
   - **Descripción**: `Leads landing`.
   - **Ejecutar como**: **Yo** (tu cuenta).
   - **Quién tiene acceso**: **Cualquier usuario**.
4. Pulsa **Implementar** y copia la **URL de la aplicación web** (acaba en `/exec`).

Para comprobar que responde, abre esa URL en el navegador: debe mostrar
`{"ok":true,"status":"up"}`.

> «Cualquier usuario» significa que la URL acepta peticiones, pero el script solo guarda las que
> llevan el `LEAD_SECRET` correcto. Nadie puede leer la hoja desde esa URL.

## 6. Conecta la web (Vercel)

1. Entra en tu proyecto de [Vercel](https://vercel.com) → **Settings → Environment Variables**.
2. Crea estas dos variables (para _Production_, y si quieres también para _Preview_):

| Variable            | Valor                                        |
| ------------------- | -------------------------------------------- |
| `GOOGLE_SCRIPT_URL` | La URL del paso 5 (la que acaba en `/exec`). |
| `LEAD_SECRET`       | Exactamente el mismo valor que en el paso 3. |

3. Comprueba que `LEAD_MOCK` no existe o vale `0`.
4. Ve a **Deployments**, abre el último despliegue y pulsa **Redeploy** para que coja las
   variables.

Haz una prueba real: rellena el formulario de la web con tu teléfono. En unos segundos debe
aparecer la fila en la hoja y llegarte el email.

## 7. Pon los UTM en los anuncios de Meta

Para que cada lead diga de qué campaña, conjunto y anuncio viene, en el **Administrador de
anuncios**, en cada anuncio (o en todos a la vez: selecciónalos y edita), baja a **Seguimiento →
Parámetros de URL** y pega exactamente esto:

```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Meta rellena los valores solo: `utm_source` sale como `fb`, `ig`, `msg` o `an` (Facebook,
Instagram, Messenger o Audience Network), `utm_campaign` con el nombre de la campaña,
`utm_content` con el del anuncio y `utm_term` con el del conjunto de anuncios. Meta añade además
`fbclid` por su cuenta. Consejo: pon nombres claros a campañas y anuncios, porque son los que verás
en la hoja.

## 8. Si cambias el script

Cada vez que modifiques `Code.gs`:

**Implementar → Gestionar implementaciones → (lápiz) Editar → Versión: Nueva versión →
Implementar.**

Así la URL no cambia y no tienes que tocar nada en Vercel. (Si haces «Nueva implementación» en
lugar de editar la existente, se crea una URL distinta.)

## Prueba sin cuenta de Google

`npm run qa:sheets` (tras `ASTRO_ADAPTER=node npx astro build`) ejecuta este mismo `Code.gs` en
local con una hoja simulada, envía el formulario llegando con UTM de Meta y comprueba columna a
columna la fila, la pestaña Resumen, el email, el envío sin JavaScript y el rechazo de un secreto
incorrecto.

---

## Qué guarda cada columna

| Columna              | Qué es                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| A Fecha y hora       | Día y hora (Madrid) de la solicitud, `dd/MM/yyyy HH:mm`. Es una fecha real: se ordena y filtra         |
| B Nombre             | Nombre                                                                                                 |
| C Teléfono           | En formato internacional, p. ej. `+34612345678`                                                        |
| D Zona de dolor      | Hombro, Codo, Muñeca, Espalda / lumbar, Cadera, Rodilla, Tobillo / pie u Otro                          |
| E Qué le pasa        | Lo que ha escrito sobre su caso (puede estar vacío salvo si elige «Otro»)                              |
| F utm_source         | Plataforma: `fb`, `ig`, `msg` o `an` con los parámetros del paso 7                                     |
| G utm_medium         | `paid_social`                                                                                          |
| H utm_campaign       | Nombre de la campaña                                                                                   |
| I utm_content        | Nombre del anuncio                                                                                     |
| J utm_term           | Nombre del conjunto de anuncios                                                                        |
| K fbclid             | Identificador de clic de Meta                                                                          |
| L Estado             | Desplegable con color para tu seguimiento. Empieza en «Nuevo»                                          |
| M Notas              | Libre, para ti                                                                                         |
| N Landing            | Página en la que rellenó el formulario                                                                 |
| O Referrer           | Web de la que venía, si la hay                                                                         |
| P Dispositivo        | mobile, tablet o desktop                                                                               |
| Q Consent. salud     | Si aceptó el tratamiento de sus datos de salud (siempre «Sí»)                                          |
| R Consent. marketing | Si aceptó las cookies de Meta                                                                          |
| S Event ID           | Identificador del envío: es el mismo `eventID` del evento Lead del Pixel (y de la API de conversiones) |

## Problemas frecuentes

- **No llega nada a la hoja y la web dice «No se ha podido enviar»**: revisa que `LEAD_SECRET` es
  idéntico en Vercel y en el script (sin espacios) y que hiciste _Redeploy_ en Vercel.
- **La URL muestra un error de permisos**: en la implementación, «Quién tiene acceso» debe ser
  «Cualquier usuario».
- **No llegan los emails**: revisa `NOTIFY_EMAIL` y la carpeta de spam. Google limita los emails
  diarios de Apps Script (unos 100 al día en cuentas gratuitas; más en Google Workspace).
- **Has cambiado el script y no se nota**: tienes que publicar una nueva versión (paso 8).

## Privacidad

La hoja contiene datos de salud. Compártela solo con quien la necesite, activa la verificación en
dos pasos de la cuenta de Google y borra los leads que no contraten pasados 12 meses (es lo que
dice la política de privacidad).
