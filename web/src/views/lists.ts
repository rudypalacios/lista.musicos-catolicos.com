import type { App } from '../app.ts';
import type { Setlist } from '../data/types.ts';
import { splitStarred } from '../data/setlists.ts';
import { shortDay } from '../dates.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { paths } from '../router.ts';
import { filterSetlists } from '../search.ts';
import { showToast } from '../toast.ts';
import { createSheet, sheetAction } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/**
 * The setlists. The starred ones come first (by title, so they stay where the person left
 * them), then the rest, most recently edited first: a list may be for a rosary or a prayer
 * meeting and have no day, so the day orders nothing. Searching shows one list, starred first.
 * "＋ Nuevo" still creates a list at once, for today. The "⋯" of each row opens a sheet with what is done to
 * that list from here: star it (or take the star off), make a copy of it.
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
        h('h2', { class: 'sr-only' }, 'Listados'),
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

    // --- "⋯" of a row: what is done to that list from here ---
    let lists: Setlist[] = [];
    /** The list whose "⋯" is open */
    let target: string | null = null;
    // The screen scrolls inside the app, so the sheet covers the window, not the page
    const sheet = createSheet('Opciones del listado', () => fill());
    sheet.element.classList.add('sheet-layer--window');
    element.append(sheet.element);
    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
    };
    const fill = (): void => {
        const list = lists.find((candidate) => candidate.id === target);
        if (list === undefined) {
            // Deleted (here or on another device) while its sheet was open
            sheet.close();

            return;
        }
        const count = list.items.length;
        sheet.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, list.title),
            h('p', { class: 'sheet__sub' }, count === 1 ? '1 canto' : `${count} cantos`),
            sheetAction(list.starred ? 'star-filled' : 'star', list.starred ? 'Quitar de destacados' : 'Destacar', () => {
                error.textContent = '';
                sheet.close();
                app.setlists.setStarred(list.id, !list.starred).catch((failure: unknown) => fail(failure, 'No se pudo cambiar el listado.'));
            }),
            sheetAction('copy', 'Duplicar listado', () => {
                error.textContent = '';
                sheet.close(() => {
                    app.setlists
                        .duplicate(list.id)
                        .then((copy) => {
                            navigate(paths.setlist(copy.id));
                            showToast(`Copiado de «${list.title}»`, 4000, true);
                        })
                        .catch((failure: unknown) => fail(failure, 'No se pudo duplicar el listado.'));
                });
            }, { hint: 'Una copia para hoy, con los mismos cantos y tonos' }),
        );
    };

    const more = (list: Setlist): HTMLElement => {
        const button = h('button', {
            type: 'button', class: 'lrow__more', 'aria-label': `Más opciones: ${list.title}`, 'data-more': list.id,
        }, icon('more', 22));
        button.addEventListener('click', () => {
            target = list.id;
            sheet.open();
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
                h('span', { class: 'lrow__detail' }, detail.join(' · '),
                    // A starred list says so beside its details, small and yellow (the star itself is toggled in the "⋯")
                    ...(list.starred ? [' ', icon('star-filled', 14), h('span', { class: 'sr-only' }, 'Destacado')] : [])),
            ),
            more(list),
        );
    };

    const group = (label: string | null, lists: readonly Setlist[]): HTMLElement[] =>
        lists.length === 0 ? [] : [
            h('section', { class: 'lgroup' },
                ...(label === null ? [] : [h('h3', { class: 'lgroup__label' }, label)]),
                h('ul', { class: 'lrows' }, ...lists.map(row))),
        ];

    const draw = (): void => {
        // The button that was pressed is replaced by the redraw: the focus goes back to it
        const focused = document.activeElement?.getAttribute('data-more') ?? null;
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
            groups.querySelector<HTMLElement>(`[data-more="${CSS.escape(focused)}"]`)?.focus();
        }
    };
    const load = (): void => {
        void app.setlists.list().then((all) => {
            lists = all;
            draw();
            if (sheet.isOpen()) {
                fill();
            }
        });
    };

    search.addEventListener('input', draw);
    const stop = app.onData(load);
    load();

    return {
        element,
        dispose: () => {
            stop();
            sheet.release();
        },
    };
}
