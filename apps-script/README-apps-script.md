# Guardar los leads en Google Sheets

Cada vez que alguien rellena el formulario de valoración, la web envía los datos a un pequeño
programa de Google (Apps Script) que:

- los guarda en una fila nueva de la hoja **Leads**,
- te manda un email con todos los datos y un botón para escribir por WhatsApp,
- deja la columna **Estado** en «Nuevo» para que la uses como mini-CRM
  (Nuevo, Contactado, Videollamada agendada, Cliente, Descartado).

Tardas unos 10 minutos. Solo hay que hacerlo una vez.

---

## 1. Crea la hoja de cálculo

1. Entra en [Google Sheets](https://sheets.google.com) con la cuenta donde quieres guardar los
   leads.
2. Crea una hoja en blanco y llámala **Leads RehabilityWOD**.

No hace falta que crees columnas: el script crea la pestaña «Leads» con la cabecera, la fija
arriba y le da formato la primera vez.

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
| `NOTIFY_EMAIL` | El correo donde quieres recibir los avisos (por ejemplo, `info@rehabilitywod.com`).    |

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

## 7. Si cambias el script

Cada vez que modifiques `Code.gs`:

**Implementar → Gestionar implementaciones → (lápiz) Editar → Versión: Nueva versión →
Implementar.**

Así la URL no cambia y no tienes que tocar nada en Vercel. (Si haces «Nueva implementación» en
lugar de editar la existente, se crea una URL distinta.)

---

## Qué guarda cada columna

| Columna               | Qué es                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Fecha                 | Día y hora (Madrid) de la solicitud, `dd/MM/yyyy HH:mm`                                     |
| Zona                  | Qué le duele (Hombro, Codo, Muñeca, Espalda / lumbar, Cadera, Rodilla, Tobillo / pie, Otro) |
| Detalle               | Lo que ha escrito sobre su caso (puede estar vacío)                                         |
| Nombre                | Nombre                                                                                      |
| Teléfono              | En formato internacional, p. ej. `+34612345678`                                             |
| Estado                | Desplegable para tu seguimiento. Empieza en «Nuevo»                                         |
| Notas                 | Libre, para ti                                                                              |
| utm_source … utm_term | De qué anuncio o campaña viene                                                              |
| fbclid                | Identificador de clic de Meta                                                               |
| Landing               | Página en la que rellenó el formulario                                                      |
| Referrer              | Web de la que venía, si la hay                                                              |
| Dispositivo           | mobile, tablet o desktop                                                                    |
| Consent. salud        | Si aceptó el tratamiento de sus datos de salud (siempre «Sí»)                               |
| Consent. marketing    | Si aceptó las cookies de Meta                                                               |
| Event ID              | Identificador del envío (sirve para cuadrar con Meta)                                       |

## Problemas frecuentes

- **No llega nada a la hoja y la web dice «No se ha podido enviar»**: revisa que `LEAD_SECRET` es
  idéntico en Vercel y en el script (sin espacios) y que hiciste _Redeploy_ en Vercel.
- **La URL muestra un error de permisos**: en la implementación, «Quién tiene acceso» debe ser
  «Cualquier usuario».
- **No llegan los emails**: revisa `NOTIFY_EMAIL` y la carpeta de spam. Google limita los emails
  diarios de Apps Script (unos 100 al día en cuentas gratuitas; más en Google Workspace).
- **Has cambiado el script y no se nota**: tienes que publicar una nueva versión (paso 7).

## Privacidad

La hoja contiene datos de salud. Compártela solo con quien la necesite, activa la verificación en
dos pasos de la cuenta de Google y borra los leads que no contraten pasados 12 meses (es lo que
dice la política de privacidad).
