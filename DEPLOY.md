# Deploy

Cada merge a `main` (o *Actions → Deploy → Run workflow*) ejecuta `.github/workflows/deploy.yml`:
instala las dependencias de producción, compila la app (`npm run build`) y sube por FTPS **solo
los archivos que cambiaron**. Los tests **no** corren en GitHub: se corren antes de cada commit
(ver `CLAUDE.md`). El repositorio es público, así que esos minutos no se gastan de tu plan.

El deploy nunca sube ni borra: `.env`, los `error_log` ni los archivos de desarrollo.
Tampoco toca el `.htaccess` raíz, porque cPanel guarda ahí la versión de PHP. Si cambias
`.htaccess` en el repo, actualízalo a mano en el servidor.

**Base de datos:** la app crea y actualiza sus tablas sola, en la primera petición después de
cada deploy (`migrations/`). No hay nada que ejecutar en el servidor.

> Este repositorio es público: aquí solo van **marcadores** como `<carpeta-del-sitio>`.
> Contraseñas, usuarios y rutas reales van únicamente en cPanel y en los *secrets* de GitHub.

## Configuración inicial (una sola vez)

### cPanel

1. Crear el subdominio **`lista.musicos-catolicos.com`** con su propia carpeta
   (`<carpeta-del-sitio>`). Esa carpeta es la raíz del repositorio, igual que en el sitio
   principal (no `public/`: el `.htaccess` raíz envía todo a `public/`).
2. Activar **HTTPS** para el subdominio (*SSL/TLS Status → Run AutoSSL*). Sin HTTPS no se puede
   instalar la app ni funciona el modo sin conexión.
3. *MultiPHP Manager*: PHP **8.3** para el subdominio, con la extensión `pdo_mysql` activa
   (*Select PHP Version → Extensions*).
4. *MySQL Databases*: crear una base de datos y un usuario nuevos, y darle **todos los
   privilegios** sobre esa base (la app crea tablas). No reutilices la base del sitio principal.
5. Crear una **cuenta FTP** con su directorio limitado a `<carpeta-del-sitio>`. No reutilices
   la del sitio principal.
6. Crear `<carpeta-del-sitio>/.env` a partir de `.env.example`:

   ```dotenv
   APP_ENV=production
   DB_HOST=localhost
   DB_NAME=<base creada en el paso 4>
   DB_USERNAME=<usuario creado en el paso 4>
   DB_PASSWORD=<contraseña>
   OWNER_EMAIL=<tu correo>
   OWNER_PASSWORD_HASH='<hash bcrypt de tu contraseña>'
   ```

   La cuenta se crea en la primera petición que no encuentra usuarios. El hash es **bcrypt**
   (empieza con `$2y$`, 60 caracteres, generado con `password_hash($contraseña, PASSWORD_BCRYPT)`
   de PHP) y va **entre comillas simples**, porque contiene `$`. Genéralo donde la contraseña
   no pase por un sitio ajeno (la terminal de cPanel o tu computadora, no un generador en línea).
   Alternativa: `OWNER_PASSWORD=<contraseña>` en texto; se convierte en hash en la primera
   petición y hay que borrarla del `.env` después de entrar.

7. Crear (o completar) `<carpeta-del-sitio>/.htaccess` con el contenido del `.htaccess` de la
   raíz del repo. Si cPanel ya creó uno con la versión de PHP, **no lo borres**: agrega el
   contenido del repo debajo. Si falta este paso, todo da **404**.

### GitHub

1. Crear el environment **`production`** (*Settings → Environments → New environment*),
   limitado a la rama `main` (*Deployment branches and tags → Selected branches → `main`*).
2. Agregar como **Environment secrets**:

   | Secret | Valor |
   |---|---|
   | `FTP_SERVER` | Host FTP (el mismo servidor que el sitio principal) |
   | `FTP_USERNAME` | Usuario de la cuenta FTP del paso 5 |
   | `FTP_PASSWORD` | Contraseña de esa cuenta |
   | `FTP_SERVER_DIR` | Carpeta del sitio vista desde esa cuenta FTP, **terminada en `/`** (`./` si la cuenta ya está limitada a ella) |

   Variable opcional: `FTP_PROTOCOL` (por defecto `ftps`; `ftp` solo si el hosting no acepta FTPS).

   En un repositorio público los secrets siguen siendo privados, y los workflows de forks no
   tienen acceso a ellos.

## Comprobar el primer deploy

1. `https://lista.musicos-catolicos.com/api/health` debe responder
   `{"status":"ok","schema":"<última migración>"}` (por ejemplo `0005_setlists_utf8mb4.mysql`). Si responde HTML o 404, falta el `.htaccess`
   (paso 7); si responde 500, revisa el `.env` y el usuario de la base.
2. Abre `https://lista.musicos-catolicos.com/` e inicia sesión (si usaste `OWNER_PASSWORD`, bórrala del `.env`).
3. **Codificación de la base.** No tienes que hacer nada: las migraciones `0003_utf8mb4.mysql.sql` y
   `0005_setlists_utf8mb4.mysql.sql` convierten solas las tablas (incluida `setlists`) a `utf8mb4`
   (una base creada como `utf8` a secas no guarda emoji).
   Para comprobarlo, en phpMyAdmin ejecuta
   `SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();`:
   todas deben empezar con `utf8mb4_`.
4. Si ves "La aplicación no está compilada", el deploy no corrió el build: revisa el job en *Actions*.

## Pruebas en los dispositivos

Chromium se prueba aquí, pero **Safari/WebKit no**, y es justo donde está el riesgo. Hazlo una
vez después del primer deploy, y otra vez antes de confiar en la app para una misa.

**Android (Chrome)**
1. Abre la URL, inicia sesión, menú ⋮ → *Instalar aplicación*.
2. Ábrela desde el ícono. Modo avión. Ciérrala del todo y ábrela otra vez: debe abrir, mostrar
   tu sesión y la etiqueta "Sin conexión".

**iPad (Safari)**
1. Abre la URL en Safari, inicia sesión, *Compartir → Añadir a pantalla de inicio*.
2. **Usa siempre el ícono**, no la pestaña de Safari: Safari borra los datos de los sitios que no
   visita en 7 días, y eso no aplica a una app instalada en la pantalla de inicio.
3. Modo avión, cierra la app (deslizar hacia arriba) y ábrela desde el ícono: debe abrir.
4. Repite al día siguiente y a los 8 días sin abrirla, para confirmar que no se borra.

**Cantos (fase 1), en los dos dispositivos**
1. Crea un canto con acordes (o impórtalo pegando uno de tu PDF) y ábrelo. Prueba `−`/`+` del
   tono, `Do → C` y `Ajustar`: el canto entero debe caber en la pantalla sin hacer scroll (si es
   muy largo, en dos columnas en la tablet). Gira la tablet: se vuelve a ajustar.
2. Modo avión. Cierra la app y ábrela: el canto debe seguir ahí. Escribe uno nuevo sin conexión:
   arriba debe decir "Sin conexión · 1 sin enviar". Quita el modo avión: pasa a "Sincronizado".
3. Entra con la misma cuenta en el otro dispositivo: ve los mismos cantos. Edita uno en un
   dispositivo y comprueba que aparece en el otro (puede tardar hasta que vuelvas a abrir la app).
4. En el iPad, repite el paso 2 después de 8 días sin abrir la app: los cantos deben seguir.
5. Cuéntame cualquier acorde que el importador haya puesto lejos de su sílaba y el formato de la
   hoja de donde venía, para ajustarlo.

**Listados (fase 2), en los dos dispositivos**
1. Toca *Listados* y *Nuevo listado*: se crea para hoy, con el título "Misa del … de …". Deben salir las
   15 partes de la misa en orden, cinco marcadas "opcional". Toca el botón ⓘ de "Rito de la paz": debe
   explicar que no es parte de la misa (en la tablet no hay "pasar el dedo por encima": por eso es un botón).
2. En una parte toca *Agregar canto*, busca por título y elige uno: vuelves al listado y el canto está
   en esa parte. Agrega dos cantos a la comunión y sube uno con ↑.
3. Cambia el tono de un canto con `−` / `+` (aparece, por ejemplo, "Re ↺"; el ↺ vuelve al tono original).
   Abre ese mismo canto desde *Cantos*: debe seguir en su tono de siempre. El cambio es solo del listado.
4. Toca *Cantar*. Debe abrir el primer canto, en el tono del listado, con el nombre de la parte arriba.
   Cambia de canto con el dedo (deslizar a izquierda o derecha: el canto debe seguir al dedo desde que
   empiezas), con el botón de posición («1/10 ▾», abre la lista de cantos para saltar a uno) y, si tienes
   teclado, con las flechas. Cambia el tono ahí mismo (con `⋯` o con la pastilla de abajo): se guarda en el
   listado. Gira la tablet: se vuelve a ajustar.
5. Modo avión. Cierra la app, ábrela, entra al listado y toca *Cantar*: todo debe funcionar. Cambia un
   tono sin conexión: arriba debe decir "Sin conexión · 1 sin enviar"; al quitar el modo avión, "Sincronizado".
6. En el otro dispositivo abre *Listados*: el mismo listado, con los mismos tonos y notas.
7. Elimina un canto que esté en un listado: la app avisa en cuáles está. Después, ese listado muestra
   "Canto eliminado" en su lugar (y se puede quitar con *Quitar*).
8. Cuéntame si algo no cabe, se corta o cuesta tocarlo con el dedo.

**Fases 4 y 5 (pulido, ajustes y modos), de momento solo en Android**
1. Edita un listado: debe aparecer un aviso breve "Guardado en este dispositivo" y, al poco,
   "Guardado y sincronizado". En modo avión se queda en "en este dispositivo".
2. En un listado largo, toca *Agregar canto* en una parte lejana y elige uno: vuelves a esa parte,
   con el canto nuevo resaltado un momento. Entra a un canto desde el listado y vuelve con el botón
   atrás: debe quedar en el mismo lugar.
3. Pon el mismo canto en dos partes: al agregarlo aparece un aviso "«…» también está en: …" (no al
   buscarlo) y en las dos filas queda "También está en…". No debe impedir nada.
4. Las notas: botón *Nota*; si ya hay una se ve como una línea tenue, y al tocarla se edita.
5. En *Cantar*, desliza a izquierda y derecha: **la pantalla ya no debe "ensancharse"** en los bordes y el
   canto nuevo debe entrar deslizándose. (Esto solo se puede confirmar en el teléfono.)
6. *Ajustes* (arriba): cambia el nombre de los acordes, el color de la letra y las columnas; el ejemplo
   cambia al momento. Abre un canto: ya usa lo elegido. En la tablet, el botón *Columnas* del lector
   cambia entre automático, 2 y 1.
7. *Cantar* (encabezado nuevo): una sola fila arriba con `←`, el nombre de la parte y del canto, la posición
   («3/10 ▾») y `⋯`. La barra de la app (Listas, Ajustes, Salir) ya no aparece aquí. Con un canto largo, baja la
   letra: la barra se pliega a una franja delgada con el título, el tono y la posición (tócala, o sube un poco, y
   vuelve); la letra no debe moverse al plegarse. Abajo a la derecha hay una pastilla con el tono: tócala para
   `−` `+` `A−` `A+`; desaparece al bajar la letra. `⋯` abre un panel con tono, tamaño, `Do → C`, *Ajustar*,
   columnas, el selector *Ensayo (para preparar) | Evento (para cantar)*, la nota, *Ajustes* y *Salir*. En
   ensayo se escribe la nota del canto; en evento solo se lee (un punto en `⋯` avisa que hay una). El tamaño
   de letra que eliges con `A−`/`A+` se queda para los demás cantos y al volver a abrir la app. El último
   renglón debe quedar con aire debajo, sin pegarse al borde ni quedar bajo la pastilla.

**Primera apertura después de actualizar a la fase 2.** La base guardada en el dispositivo cambia de
versión: la app vuelve a bajar todo del servidor una vez (tarda un momento, los cantos no se pierden).
Si en esa pantalla se queda esperando, cierra las demás pestañas o ventanas de la app y recarga.

**Actualizaciones.** Después de un deploy con cambios, la app descarga la versión nueva en segundo
plano ("Descargando la versión nueva…"), avisa "Hay una versión nueva" con un botón *Actualizar*, y
no se actualiza sola mientras la estás usando. Al tocar *Actualizar* aparece "Actualizando la app…"
hasta que se recarga, y al volver dice "✓ App actualizada". Si tarda más de unos segundos ofrece
*Reintentar* y *Reiniciar la app* (borra la copia de la app y la descarga de nuevo; necesita
conexión; los cantos no se tocan). Una app abierta busca versiones nuevas cada hora y al volver a
primer plano.

**Arranque.** La app abre siempre desde lo guardado en el dispositivo, sin esperar a la red: si el
servidor tarda o no responde, entras igual a tus cantos y el encabezado dice "Sin conexión". Si algo
falla al iniciar, muestra una pantalla con *Recargar* y *Reiniciar la app* en vez de quedarse en
negro.

## Desarrollo local

Ver `README.md`. Crea `.env.development` (tiene prioridad sobre `.env` y está en `.gitignore`)
con `DB_DRIVER=sqlite` para no necesitar MySQL.
