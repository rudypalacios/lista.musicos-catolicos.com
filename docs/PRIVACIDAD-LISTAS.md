# Texto de privacidad propuesto para Listas

Propuesta para la página **Privacidad** del sitio público (`musicos-catolicos`, `src/Templates/legal/privacy.twig`). El formulario de crear cuenta enlaza a su
sección (`https://www.musicos-catolicos.com/privacidad/#lista`). El cambio completo, listo para aplicar en ese repositorio, está en
[`privacy-listas.diff`](privacy-listas.diff) (`git apply`): agrega la sección de abajo y ajusta, en el resto de la página, el resumen, «Lo que no recopilamos»,
las cookies, «Con quién se comparten los datos», «Cuánto tiempo se conservan», «Tus derechos» y «Menores», y pone la fecha de la página en 4 de noviembre de 2026.

Está escrito con lo que el código hace hoy (no es asesoría legal; conviene que lo revise quien tú quieras). Si cambia algo de lo que dice (entrar con Google, borrar la
cuenta desde la app, otro proveedor de correo), hay que actualizarlo.

## Sección nueva: «Listas, la aplicación para preparar la misa»

Listas ([lista.musicos-catolicos.com](https://lista.musicos-catolicos.com/)) es una aplicación aparte, del mismo responsable, para preparar la música de la misa: armar un listado con cantos, cambiar el tono de cada uno, leerlo sin conexión e imprimirlo. **Lo que dicen las demás secciones sobre Google Analytics, anuncios y videos no aplica a Listas:** la aplicación no usa analítica ni publicidad, no carga nada de otros sitios y no te sigue.

### Si la pruebas sin cuenta

Lo que escribes (cantos, listados, plantillas) se guarda solo en tu dispositivo, en el almacenamiento del navegador, y no se envía a nuestro servidor. Si borras los datos del navegador, se pierde. Si después creas una cuenta o inicias sesión, la aplicación te pregunta si quieres llevar eso a tu cuenta (entonces se envía) o descartarlo.

### Si creas una cuenta

- **Tus datos de cuenta:** tu correo, tu contraseña (la guardamos solo transformada de forma irreversible: no podemos leerla ni recuperarla), la fecha en que creaste la cuenta y si confirmaste tu correo.
- **Tu biblioteca:** tus cantos (título, autor, letra y acordes, etiquetas, tu tono), tus listados (nombre, secciones, qué cantos llevan y en qué tono, notas) y tus plantillas. Es tu biblioteca personal: nadie más la ve, salvo lo que tú compartas con un enlace. Se guarda en nuestro servidor para que la tengas en todos tus dispositivos y puedas recuperarla si pierdes uno.
- **Tu sesión:** al iniciar sesión se guarda en tu navegador una cookie llamada `lista_session`, necesaria para reconocerte; dura hasta 180 días o hasta que salgas. En el servidor solo se guarda una huella irreversible de ella. No hay cookies de publicidad ni de analítica.
- **Correos:** usamos tu correo para confirmar que es tuyo y para que puedas elegir una contraseña nueva si la olvidas. Los mensajes salen de `noreply@musicos-catolicos.com`. No te enviamos publicidad ni boletines.

### Compartir con un enlace

Si compartes un listado o un canto, cualquiera que tenga el enlace puede verlo, sin cuenta y solo para leer. Muestra solo el título, el orden de los cantos, el tono de cada uno y, si tú lo eliges, la letra y los acordes; nunca tu correo, tus notas ni tus otros listados. Puedes dejar de compartir cuando quieras y el enlace deja de funcionar para siempre. Quien abre un enlace no necesita cuenta: la página no usa cookies, no tiene analítica ni anuncios y no carga nada de otros sitios; guarda en su dispositivo una copia del listado (para leerlo sin conexión) y sus preferencias de lectura. Las letras y los acordes pertenecen a sus autores: lo que compartas es para uso personal (ver [Derechos de autor](/derechos-de-autor/)), así que compártelo solo si tienes permiso.

### Registros del servidor

Como en este sitio, el servidor de nuestro proveedor de alojamiento anota cada visita a Listas (dirección IP, fecha y hora, página pedida y tipo de navegador) para mantenerla funcionando y protegerla de abusos.

### Protección contra abusos

Para evitar que programas creen cuentas por miles o llenen de correos un buzón, al crear una cuenta o pedir una contraseña nueva tu dispositivo resuelve un pequeño cálculo; no usamos captchas de otras empresas y no se envía nada a terceros. Además anotamos por un tiempo corto tu dirección IP (y, al pedir una contraseña nueva, una huella del correo escrito) para limitar los intentos repetidos. Los intentos fallidos de iniciar sesión y de abrir enlaces que no existen se borran a los 15 minutos; lo demás, en un día como máximo.

### Lo que se guarda en tu dispositivo

La aplicación guarda en tu navegador tus cantos y listados (para que funcionen sin conexión), tus preferencias de lectura (colores, tamaño de letra, nombre de los acordes), un borrador del canto que escribes y algunos recordatorios de uso (por ejemplo, la última plantilla que elegiste). También guarda una copia de sí misma para abrirse sin conexión. Nada de eso sale de tu dispositivo, salvo tu biblioteca si tienes cuenta. Al salir de tu cuenta, la aplicación borra de ese dispositivo tus cantos y listados.

### Cuánto se conserva

- Tu cuenta y tu biblioteca, mientras tengas la cuenta.
- Los enlaces del correo: el de confirmar tu correo, 2 días; el de elegir una contraseña nueva, 1 hora. Se gastan al usarlos.
- Las sesiones, hasta 180 días; se borran al salir o al vencer.
- Los registros contra abusos: como se explica arriba, entre 15 minutos y un día.
- Las copias de seguridad que hace nuestro proveedor de alojamiento pueden conservar datos un tiempo más después de que los borremos.

### Borrar tu cuenta

Por ahora, para borrar tu cuenta escribe a contacto@musicos-catolicos.com desde el correo de la cuenta, con el asunto «Privacidad». Borramos la cuenta y todo lo que guardaste en ella. También puedes pedir que te mandemos una copia de tus datos o que corrijamos alguno.

## Cambios en el resto de la página

- **En resumen:** «aquí no hay cuentas» ahora dice que es de *este sitio*, y una viñeta nueva dice que Listas sí tiene cuentas y no usa Google Analytics ni anuncios.
- **Lo que no recopilamos:** aclara que es de este sitio y remite a la sección de Listas.
- **Cookies:** una frase que dice que Listas usa una cookie propia solo si inicias sesión.
- **Con quién se comparten los datos:** el proveedor de alojamiento también aloja Listas, guarda su base de datos y envía sus dos correos.
- **Cuánto tiempo se conservan:** una viñeta nueva para Listas.
- **Tus derechos:** un párrafo nuevo sobre borrar la cuenta de Listas.
- **Menores:** «el sitio» pasa a «el sitio y la aplicación Listas».
