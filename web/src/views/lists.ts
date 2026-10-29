import type { App } from '../app.ts';
import type { Setlist } from '../data/types.ts';
import { splitStarred } from '../data/setlists.ts';
import { shortDay } from '../dates.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { paths } from '../router.ts';
import { filterSetlists } from '../search.ts';
import type { Navigate, View } from './types.ts';

/**
 * The setlists. The starred ones come first (by title, so they stay where the person left
 * them), then the rest, most recently edited first: a list may be for a rosary or a prayer
 * meeting and have no day, so the day orders nothing. Searching shows one list, starred first.
 * "＋ Nuevo" still creates a list at once, for today.
 */
export function listsView(app: App, navigate: Navigate): View {
    const create = h('button', { type: 'button', class: 'button button--primary lists__new', 'aria-label': 'Nuevo listado' }, '＋ Nuevo');
    const search = h('input', {
        type: 'search', id: 'search', placeholder: 'Buscar listado', 'aria-label': 'Buscar listados',
        autocomplete: 'off', enterkeyhint: 'search',
    });
    const error = h('p', { class: 'error lists__error', role: 'alert' });
    const groups = h('div', { class: 'lists' });
    const empty = h('p', { class: 'empty', hidden: true });
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Listados'),
        h('div', { class: 'lists__top' }, search, create),
        error,
        groups,
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

    const star = (list: Setlist): HTMLElement => {
        const button = h('button', {
            type: 'button', class: list.starred ? 'star is-on' : 'star', 'aria-pressed': String(list.starred),
            'aria-label': list.starred ? `Quitar de destacados: ${list.title}` : `Destacar: ${list.title}`,
            'data-star': list.id,
        }, icon(list.starred ? 'star-filled' : 'star', 24));
        button.addEventListener('click', () => {
            error.textContent = '';
            app.setlists.setStarred(list.id, !list.starred).catch((failure: unknown) => {
                error.textContent = failure instanceof Error ? failure.message : 'No se pudo cambiar el listado.';
            });
        });

        return button;
    };

    const row = (list: Setlist): HTMLElement => {
        const count = list.items.length;
        const detail = [count === 1 ? '1 canto' : `${count} cantos`, ...(list.eventDate === null ? [] : [shortDay(list.eventDate)])];

        return h(
            'li',
            { class: 'lrow' },
            h(
                'a',
                { class: 'lrow__link', href: paths.setlist(list.id), 'data-link': true },
                h('span', { class: 'lrow__title' }, list.title),
                h('span', { class: 'lrow__detail' }, detail.join(' · ')),
            ),
            star(list),
        );
    };

    const group = (label: string | null, lists: readonly Setlist[]): HTMLElement[] =>
        lists.length === 0 ? [] : [
            h('section', { class: 'lgroup' },
                ...(label === null ? [] : [h('h3', { class: 'lgroup__label' }, label)]),
                h('ul', { class: 'lrows' }, ...lists.map(row))),
        ];

    let lists: Setlist[] = [];
    const draw = (): void => {
        // The star button that was pressed is replaced by the redraw: the focus goes back to it
        const focused = document.activeElement?.getAttribute('data-star') ?? null;
        const query = search.value.trim();
        const shown = filterSetlists(lists, query);
        const { starred, others } = splitStarred(shown);

        // Searching is one list with no headings (the starred first); otherwise two headed groups, and
        // no headings at all while nothing is starred
        groups.replaceChildren(
            ...(query !== '' ? group(null, [...starred, ...others])
                : starred.length === 0 ? group(null, others)
                    : [...group('★ Destacados', starred), ...group('Recientes', others)]),
        );
        empty.hidden = shown.length > 0;
        empty.textContent = lists.length === 0
            ? 'Todavía no hay listados. Crea uno para preparar la música de una misa.'
            : 'Ningún listado coincide con la búsqueda.';
        if (focused !== null) {
            groups.querySelector<HTMLElement>(`[data-star="${CSS.escape(focused)}"]`)?.focus();
        }
    };
    const load = (): void => {
        void app.setlists.list().then((all) => {
            lists = all;
            draw();
        });
    };

    search.addEventListener('input', draw);
    const stop = app.onData(load);
    load();

    return { element, dispose: stop };
}
