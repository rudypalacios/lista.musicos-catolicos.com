import { h } from '../dom.ts';

/**
 * How Listas uses a person's data, in plain Spanish. It must say what the code really does: when something here changes
 * (what is stored, for how long, who it goes to), this text changes in the same pull request. The numbers are the ones of the
 * server: a session lasts 180 days (`Authenticator::SESSION_DAYS`), the confirmation link 2 days and the one for a new
 * password 1 hour (`Accounts`), failed sign-ins are counted for 15 minutes (`Authenticator`) and the other counters of
 * repeated requests are deleted after a day (`RateLimiter`). The ceiling of an account (2,000 songs, 1,000 lists, 50
 * templates, 5 MB) is `AccountQuota`'s.
 */

/** The day this text was last revised */
export const PRIVACY_UPDATED = '4 de noviembre de 2026';

/** Where people write about their data */
export const PRIVACY_EMAIL = 'contacto@musicos-catolicos.com';

type Block = { p: string } | { ul: string[] };

interface Section {
    id: string;
    title: string;
    blocks: Block[];
}

export const PRIVACY_SECTIONS: readonly Section[] = [
    {
        id: 'resumen',
        title: 'En resumen',
        blocks: [{
            ul: [
                'Puedes usar Listas sin cuenta: lo que escribas se guarda solo en tu dispositivo.',
                'Si creas una cuenta, guardamos tu correo, tu contraseña (cifrada, no la podemos leer) y tu biblioteca de cantos, listados y plantillas.',
                'Listas no usa analítica ni publicidad, no carga nada de otros sitios y no te sigue.',
                'La única cookie es la de tu sesión, y solo si inicias sesión.',
                'No vendemos tus datos y no te mandamos publicidad.',
                'Puedes pedir que borremos tu cuenta con todo lo que guardaste.',
            ],
        }],
    },
    {
        id: 'responsable',
        title: 'Quién es responsable',
        blocks: [{ p: `Listas es una aplicación de Músicos Católicos, un proyecto personal para preparar la música de la misa. Para cualquier asunto sobre tus datos escribe a ${PRIVACY_EMAIL}.` }],
    },
    {
        id: 'sin-cuenta',
        title: 'Si la pruebas sin cuenta',
        blocks: [{ p: 'Lo que escribes (cantos, listados, plantillas) se guarda solo en tu dispositivo, en el almacenamiento del navegador, y no se envía a nuestro servidor. Si borras los datos del navegador, se pierde. Si después creas una cuenta o inicias sesión, la aplicación te pregunta si quieres llevar eso a tu cuenta (entonces se envía) o descartarlo.' }],
    },
    {
        id: 'cuenta',
        title: 'Si creas una cuenta',
        blocks: [{
            ul: [
                'Tus datos de cuenta: tu correo, tu contraseña (la guardamos solo transformada de forma irreversible: no podemos leerla ni recuperarla), la fecha en que creaste la cuenta y si confirmaste tu correo.',
                'Tu biblioteca: tus cantos (título, autor, letra y acordes, etiquetas, tu tono), tus listados (nombre, secciones, qué cantos llevan y en qué tono, notas) y tus plantillas. Es tu biblioteca personal: nadie más la ve, salvo lo que tú compartas con un enlace. Se guarda en nuestro servidor para que la tengas en todos tus dispositivos y puedas recuperarla si pierdes uno.',
                'Un límite de espacio por cuenta, para que el servidor alcance para todos: hasta 2.000 cantos, 1.000 listados y 50 plantillas, y unos 5 MB de texto en total. Si llegas al límite, la aplicación te lo dice; lo que escribas sigue en tu dispositivo y puedes liberar espacio borrando lo que ya no uses.',
                'Tu sesión: al iniciar sesión se guarda en tu navegador una cookie llamada lista_session, necesaria para reconocerte; dura hasta 180 días o hasta que salgas. En el servidor solo se guarda una huella irreversible de ella. No hay cookies de publicidad ni de analítica.',
                'Correos: usamos tu correo para confirmar que es tuyo y para que puedas elegir una contraseña nueva si la olvidas. Los mensajes salen de noreply@musicos-catolicos.com. No te enviamos publicidad ni boletines.',
            ],
        }],
    },
    {
        id: 'compartir',
        title: 'Compartir con un enlace',
        blocks: [{ p: 'Si compartes un listado o un canto, cualquiera que tenga el enlace puede verlo, sin cuenta y solo para leer. Muestra solo el título, el orden de los cantos, el tono de cada uno y, si tú lo eliges, la letra y los acordes; nunca tu correo, tus notas ni tus otros listados. Puedes dejar de compartir cuando quieras y el enlace deja de funcionar para siempre.' }, { p: 'Quien abre un enlace no necesita cuenta: la página no usa cookies, no tiene analítica ni anuncios y no carga nada de otros sitios; guarda en su dispositivo una copia del listado (para leerlo sin conexión) y sus preferencias de lectura.' }, { p: 'Las letras y los acordes pertenecen a sus autores: lo que compartas es para uso personal, así que compártelo solo si tienes permiso.' }],
    },
    {
        id: 'servidor',
        title: 'Registros del servidor y protección contra abusos',
        blocks: [
            { p: 'El servidor de nuestro proveedor de alojamiento anota cada visita (dirección IP, fecha y hora, página pedida y tipo de navegador) para mantener Listas funcionando y protegerla de abusos.' },
            { p: 'Para evitar que programas creen cuentas por miles o llenen de correos un buzón, al crear una cuenta o pedir una contraseña nueva tu dispositivo resuelve un pequeño cálculo; no usamos captchas de otras empresas y no se envía nada a terceros. Además anotamos por un tiempo corto tu dirección IP (y, al pedir una contraseña nueva, una huella del correo escrito) para limitar los intentos repetidos. Los intentos fallidos de iniciar sesión y de abrir enlaces que no existen se borran a los 15 minutos; lo demás, en un día como máximo.' },
        ],
    },
    {
        id: 'dispositivo',
        title: 'Lo que se guarda en tu dispositivo',
        blocks: [{ p: 'La aplicación guarda en tu navegador tus cantos y listados (para que funcionen sin conexión), tus preferencias de lectura (colores, tamaño de letra, nombre de los acordes), un borrador del canto que escribes y algunos recordatorios de uso (por ejemplo, la última plantilla que elegiste). También guarda una copia de sí misma para abrirse sin conexión. Nada de eso sale de tu dispositivo, salvo tu biblioteca si tienes cuenta. Al salir de tu cuenta, la aplicación borra de ese dispositivo tus cantos y listados.' }],
    },
    {
        id: 'terceros',
        title: 'Con quién se comparten los datos',
        blocks: [{ p: 'Solo con nuestro proveedor de alojamiento web, que aloja Listas, guarda sus registros del servidor y su base de datos, y envía los dos correos de la aplicación (confirmar tu correo y elegir una contraseña nueva) desde nuestro buzón. No hay más terceros. También podríamos entregar datos si una autoridad competente lo exige conforme a la ley.' }],
    },
    {
        id: 'conservacion',
        title: 'Cuánto tiempo se conservan',
        blocks: [{
            ul: [
                'Tu cuenta y tu biblioteca, mientras tengas la cuenta.',
                'Los enlaces del correo: el de confirmar tu correo, 2 días; el de elegir una contraseña nueva, 1 hora. Se gastan al usarlos.',
                'Las sesiones, hasta 180 días; se borran al salir o al vencer.',
                'Los registros contra abusos: entre 15 minutos y un día, como se explica arriba.',
                'Las copias de seguridad que hace nuestro proveedor de alojamiento pueden conservar datos un tiempo más después de que los borremos.',
            ],
        }],
    },
    {
        id: 'derechos',
        title: 'Tus derechos y cómo borrar tu cuenta',
        blocks: [
            { p: 'Puedes pedirnos, en cualquier momento, saber qué datos tuyos tenemos, que corrijamos los que estén mal, que los borremos o que dejemos de usarlos para algún fin.' },
            { p: `Por ahora, para borrar tu cuenta escribe a ${PRIVACY_EMAIL} desde el correo de la cuenta, con el asunto «Privacidad». Borramos la cuenta y todo lo que guardaste en ella. Haremos lo posible por responderte dentro de 30 días; Listas es un proyecto personal, no una empresa con un equipo dedicado, así que a veces podemos tardar más, y en ese caso te avisaremos.` },
            { p: 'Si vives en la Unión Europea, el Reino Unido o Suiza, tienes además los derechos que te da el Reglamento General de Protección de Datos (o su equivalente), incluido el de presentar una queja ante la autoridad de protección de datos de tu país.' },
        ],
    },
    {
        id: 'menores',
        title: 'Menores de edad',
        blocks: [{ p: 'Listas es de interés general y no está dirigida especialmente a menores de 13 años. No recopilamos a sabiendas datos de menores; si crees que un menor nos envió sus datos, escríbenos y los borraremos.' }],
    },
    {
        id: 'cambios',
        title: 'Cambios en esta política',
        blocks: [{ p: 'Si cambia lo que Listas guarda o cómo lo usa, actualizaremos esta página y la fecha que aparece arriba.' }],
    },
];

function render(block: Block): HTMLElement {
    return 'p' in block ? h('p', {}, block.p) : h('ul', {}, ...block.ul.map((item) => h('li', {}, item)));
}

/** `/privacidad`: the text, as a page of its own (it needs no session and no data of the device) */
export function startPrivacy(root: HTMLElement): void {
    root.replaceChildren(
        h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
        h('main', { id: 'view' }, h('div', { class: 'page privacy' },
            h('div', { class: 'card' },
                h('h2', {}, 'Cómo se usan tus datos'),
                h('p', { class: 'muted' }, `Última actualización: ${PRIVACY_UPDATED}`),
                ...PRIVACY_SECTIONS.flatMap((section) => [h('h3', { id: section.id }, section.title), ...section.blocks.map(render)]),
                h('div', { class: 'actions' }, h('a', { class: 'button button--primary', href: '/' }, 'Abrir Listas')))),
        ),
    );
}
