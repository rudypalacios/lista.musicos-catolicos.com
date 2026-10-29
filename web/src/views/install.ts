import { h } from '../dom.ts';
import type { View } from './types.ts';

function steps(...items: string[]): HTMLElement {
    return h('ol', { class: 'steps' }, ...items.map((text) => h('li', {}, text)));
}

/** How to put Lista on the home screen of an iPad, an iPhone or an Android */
export function installView(): View {
    const element = h(
        'div',
        { class: 'page help' },
        h('h2', {}, 'Instalar Lista'),
        h(
            'p',
            {},
            'Instalada, Lista se abre desde su ícono como cualquier app, a pantalla completa y sin conexión. '
            + 'Tus cantos y listados quedan guardados en la cuenta y también en el aparato, así que puedes '
            + 'usarla en la iglesia aunque no haya señal.',
        ),
        h('h3', {}, 'iPad y iPhone (Safari)'),
        steps(
            'Abre Lista en Safari e inicia sesión.',
            'Toca el botón Compartir (el cuadrado con una flecha hacia arriba).',
            'Elige «Añadir a pantalla de inicio» y toca «Añadir».',
            'A partir de ahora ábrela siempre desde ese ícono, no desde Safari.',
        ),
        h(
            'p',
            { class: 'muted' },
            'Por qué desde el ícono: Safari borra lo que guarda un sitio web cuando pasan siete días sin '
            + 'visitarlo. Una app de la pantalla de inicio no entra en esa regla. Si algún día pasara, tus '
            + 'cantos siguen en tu cuenta y vuelven al iniciar sesión; solo lo que no se haya enviado '
            + '(la app te avisa arriba con «sin enviar») dependería del aparato.',
        ),
        h('h3', {}, 'Android (Chrome)'),
        steps(
            'Abre Lista en Chrome e inicia sesión.',
            'Toca el menú ⋮ y elige «Instalar aplicación» (o «Añadir a la pantalla de inicio»).',
            'Ábrela desde el ícono.',
        ),
        h(
            'p',
            { class: 'muted' },
            'Para comprobar que funciona sin conexión: abre la app, activa el modo avión, ciérrala y vuelve a '
            + 'abrirla. Debe mostrar tus cantos y decir «Sin conexión».',
        ),
    );

    return { element };
}
