import type { App } from '../app.ts';
import { partsOf } from '../data/setlists.ts';
import type { Setlist } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import type { Navigate, View } from './types.ts';

/** What a section says under its name when it cannot be switched off: the songs it holds */
export function lockedNote(count: number): string {
    return `${count === 1 ? '1 canto' : `${count} cantos`}: no se puede apagar`;
}

/**
 * The sections of one list: a switch for each, to turn on the ones the list carries. A switched-off section is
 * hidden on the list and kept here, so it comes back where it was. A section that holds songs stays on (it says
 * why): nothing is hidden with songs inside it. At least one section must stay on.
 */
export function sectionsView(app: App, _navigate: Navigate, initial: Setlist): View {
    let setlist = initial;
    const error = h('p', { class: 'error', role: 'alert' });
    const list = h('ul', { class: 'lrows sections' });
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Secciones del listado'),
        h('p', { class: 'muted' }, 'Enciende las que lleva este listado. Lo que apagas se oculta; no se pierde.'),
        error,
        list,
    );

    const draw = (): void => {
        const focused = document.activeElement?.getAttribute('data-focus') ?? null;
        const parts = partsOf(setlist);
        const shown = parts.filter((part) => part.off !== true).length;
        list.replaceChildren(...parts.map((part) => {
            const count = setlist.items.filter((item) => item.part === part.id).length;
            const on = part.off !== true;
            // The last one that is on stays on too: a list with no section has nowhere to put a song
            const locked = on && (count > 0 || shown === 1);
            const note = count > 0 ? lockedNote(count) : shown === 1 && on ? 'Es la única encendida' : null;
            const toggle = h('button', {
                type: 'button',
                class: locked ? 'srow is-locked' : 'srow',
                role: 'switch',
                'aria-checked': String(on),
                'aria-disabled': String(locked),
                'data-focus': `section:${part.id}`,
            },
            h('span', { class: on ? 'switch is-on' : 'switch', 'aria-hidden': 'true' }),
            h('span', { class: 'srow__text' },
                h('span', { class: on ? 'lrow__title' : 'lrow__title is-off' }, part.name,
                    ...(part.optional === true ? [' ', h('span', { class: 'badge' }, 'opcional')] : [])),
                ...(note !== null ? [h('span', { class: 'lrow__detail' }, note)] : (on ? [] : [h('span', { class: 'lrow__detail' }, 'Apagada: se oculta en el listado')]))),
            ...(locked ? [icon('lock', 18)] : []));
            toggle.addEventListener('click', () => {
                if (locked) {
                    return;
                }
                error.textContent = '';
                app.setlists.setPartOff(setlist.id, part.id, on).catch((failure: unknown) => {
                    error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar el cambio.';
                });
            });

            return h('li', { class: 'lrow' }, toggle);
        }));
        if (focused !== null) {
            element.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
        }
    };

    const stop = app.onData(() => {
        void app.setlists.get(setlist.id).then((latest) => {
            if (latest !== undefined) {
                setlist = latest;
                draw();
            }
        });
    });
    draw();

    return { element, dispose: stop };
}
