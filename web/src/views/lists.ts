import type { App } from '../app.ts';
import type { Setlist } from '../data/types.ts';
import { longDate } from '../dates.ts';
import { h } from '../dom.ts';
import { paths } from '../router.ts';
import type { Navigate, View } from './types.ts';

/** The setlists, newest first, and the button that starts a new one for today */
export function listsView(app: App, navigate: Navigate): View {
    const create = h('button', { type: 'button', class: 'button button--primary' }, 'Nuevo listado');
    const error = h('p', { class: 'error', role: 'alert' });
    const list = h('ul', { class: 'song-list' });
    const empty = h('p', { class: 'empty', hidden: true }, 'Todavía no hay listados. Crea uno para preparar la música de una misa.');
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Listados'),
        h('div', { class: 'actions' }, create),
        error,
        list,
        empty,
    );

    create.addEventListener('click', () => {
        create.disabled = true;
        error.textContent = '';
        app.setlists
            .create()
            .then((created) => navigate(paths.setlist(created.id)))
            .catch((failure: unknown) => {
                error.textContent = failure instanceof Error ? failure.message : 'No se pudo crear el listado.';
                create.disabled = false;
            });
    });

    const load = (): void => {
        void app.setlists.list().then((lists) => {
            list.replaceChildren(...lists.map(item));
            empty.hidden = lists.length > 0;
        });
    };
    const stop = app.onData(load);
    load();

    return { element, dispose: stop };
}

function item(setlist: Setlist): HTMLElement {
    const text = h('span', {}, h('span', { class: 'song-item__title' }, setlist.title));
    if (setlist.eventDate !== null) {
        text.append(h('span', { class: 'song-item__author' }, longDate(setlist.eventDate)));
    }
    const count = setlist.items.length;
    const row = h(
        'a',
        { class: 'song-item', href: paths.setlist(setlist.id), 'data-link': true },
        text,
        h('span', { class: 'chip' }, count === 1 ? '1 canto' : `${count} cantos`),
    );

    return h('li', {}, row);
}
