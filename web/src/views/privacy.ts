import { h } from '../dom.ts';

/**
 * How Listas uses a person's data, in plain Spanish. It must say what the code really does: when something here changes
 * (what is stored, for how long, who it goes to), this text changes in the same pull request. The numbers are the ones of the
 * server: a session lasts 180 days (`Authenticator::SESSION_DAYS`), the confirmation link 2 days and the one for a new
 * password 1 hour (`Accounts`), failed sign-ins are counted for 15 minutes (`Authenticator`), the other counters of
 * repeated requests are deleted after a day (`RateLimiter`) and a sign-in with Google that was started lasts 10 minutes
 * (`OAuthStates::TTL_SECONDS`).
 */

/** The day this text was last revised */
export const PRIVACY_UPDATED = '27 de noviembre de 2026';

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
                'No usamos tus datos para nada más que darte tu cuenta y tus cantos.',
                'No los vendemos, no hay publicidad ni analítica y no te seguimos.',
                'Puedes usar Listas sin cuenta: lo que escribas se queda solo en tu dispositivo.',
                'Puedes pedir que borremos tu cuenta con todo lo que guardaste.',
            ],
        }],
    },
    {
        id: 'sin-cuenta',
        title: 'En tu dispositivo',
        blocks: [{ p: 'Sin cuenta, lo que escribes se queda solo en tu navegador y no se envía a nuestro servidor (si borras los datos del navegador, se pierde). Al crear una cuenta o entrar a una, la aplicación te pregunta si lo llevas a tu cuenta. Con cuenta, el navegador guarda además tus preferencias, un borrador y una copia de la aplicación para abrirla sin conexión; al salir de tu cuenta, tu biblioteca se borra de ese dispositivo.' }],
    },
    {
        id: 'cuenta',
        title: 'Con cuenta, qué guardamos',
        blocks: [{
            ul: [
                'Tu correo y, si entras con Google, el identificador de tu cuenta de Google: nada más de tu perfil, y tu contraseña de Google nunca pasa por Listas.',
                'Tu contraseña, si creas una: cifrada, no la podemos leer. Con Google no hay contraseña de Listas (si quieres una, «Olvidé mi contraseña»).',
                'Tus cantos, listados y plantillas, para que los tengas en todos tus dispositivos. Nadie más los ve, salvo lo que compartas con un enlace.',
                'Una cookie, lista_session, para reconocerte. Es la única.',
                'Te escribimos solo para confirmar tu correo o para que elijas una contraseña nueva.',
                'Si ya existía una cuenta con tu correo, entras en ella; si nadie había confirmado ese correo, pasa a ser tuya y su contraseña deja de servir.',
            ],
        }],
    },
    {
        id: 'compartir',
        title: 'Compartir con un enlace',
        blocks: [{ p: 'Quien tenga el enlace de un listado o un canto que compartes lo ve, sin cuenta y solo para leer: título, orden, tono y, si tú lo eliges, la letra y los acordes; nunca tu correo ni tus notas. Puedes dejar de compartir cuando quieras y el enlace deja de funcionar. Esa persona no recibe cookies ni analítica, y su dispositivo guarda una copia para leerlo sin conexión. Las letras son de sus autores: compártelas solo si tienes permiso.' }],
    },
    {
        id: 'servidor',
        title: 'Registros y abusos',
        blocks: [{ p: 'Nuestro proveedor de alojamiento anota cada visita (IP, fecha, página y navegador). Para frenar abusos, tu dispositivo resuelve un pequeño cálculo al crear una cuenta o pedir una contraseña (sin captchas de otras empresas) y anotamos por poco tiempo tu IP (y, al pedir contraseña, una huella de tu correo) al crear una cuenta, pedir una contraseña o entrar con Google. Al entrar con Google guardamos hasta 10 minutos unas claves de un solo uso, solo como huellas, que atan el regreso a tu navegador.' }],
    },
    {
        id: 'terceros',
        title: 'Con quién se comparte',
        blocks: [{ p: 'Solo con nuestro proveedor de alojamiento, que aloja Listas, su base de datos y envía los dos correos. Y únicamente si tú lo pides, hay dos más. Google: al tocar «Continuar con Google» vas a su página y Google sabe que entraste a Listas y recibe tu IP; antes de ese toque no se contacta a Google. YouTube: al tocar «Escuchar el original» (o la nota ♪) de un canto con enlace de YouTube, se carga su reproductor (youtube-nocookie.com) y YouTube recibe tu IP; antes de ese toque no se carga nada de YouTube. Ese enlace viaja con lo compartido: quien abre un listado compartido puede tocar la nota ♪ y, si no lo toca, no se carga nada; YouTube recibe la IP de esa persona, no la tuya. Solo entregaríamos datos si una autoridad competente lo exige conforme a la ley.' }],
    },
    {
        id: 'conservacion',
        title: 'Cuánto tiempo',
        blocks: [{
            ul: [
                'Tu cuenta y tu biblioteca, mientras tengas la cuenta.',
                'Los enlaces del correo: 2 días el de confirmar tu correo y 1 hora el de elegir contraseña nueva; se gastan al usarlos.',
                'Las sesiones, hasta 180 días, o hasta que salgas.',
                'Los registros contra abusos: 15 minutos los intentos fallidos de entrar; lo demás, un día como máximo.',
                'Las copias de seguridad de nuestro proveedor pueden guardar datos un tiempo más después de borrarlos.',
            ],
        }],
    },
    {
        id: 'derechos',
        title: 'Tus derechos y cómo borrar tu cuenta',
        blocks: [
            { p: `Listas es un proyecto personal de Músicos Católicos. Puedes pedirnos saber qué datos tuyos tenemos, corregirlos, borrarlos o que dejemos de usarlos. Por ahora, para borrar tu cuenta escribe a ${PRIVACY_EMAIL} desde el correo de la cuenta, con el asunto «Privacidad»: borramos la cuenta y todo lo que guardaste. Respondemos dentro de 30 días; a veces podemos tardar más y entonces te avisamos.` },
            { p: 'Si vives en la Unión Europea, el Reino Unido o Suiza, tienes además los derechos del Reglamento General de Protección de Datos (o su equivalente), incluido el de quejarte ante la autoridad de tu país.' },
            { p: 'Listas no está dirigida especialmente a menores de 13 años y no recopilamos a sabiendas sus datos; si crees que un menor nos envió los suyos, escríbenos y los borramos. Si cambia lo que Listas guarda, actualizaremos esta página y la fecha de arriba.' },
        ],
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
                h('h2', {}, 'Privacidad'),
                h('p', { class: 'muted' }, `Última actualización: ${PRIVACY_UPDATED}`),
                ...PRIVACY_SECTIONS.flatMap((section) => [h('h3', { id: section.id }, section.title), ...section.blocks.map(render)]),
                h('div', { class: 'actions' }, h('a', { class: 'button button--primary', href: '/' }, 'Abrir Listas')))),
        ),
    );
}
