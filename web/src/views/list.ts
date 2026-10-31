import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { transpose } from '../chordpro/chord.ts';
import type { Song } from '../data/types.ts';
import { h, snippetBlock } from '../dom.ts';
import { icon } from '../icons.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { filterSongs, foundInLyricsOnly, songSnippet } from '../search.ts';
import { deleteSongAfterAsking } from './delete-song.ts';
import { createSheet, sheetAction } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/**
 * The song library. The same flat rows as the lists screen, in one column (it is read and searched down, and a
 * library grows): the title, the author under it, the key at the side and a "⋯" of 44px at the end. Touching the
 * song opens it; the "⋯" opens a sheet with what is done to that song from here: edit its lyrics and chords, or
 * delete it (last, red and set apart, after a question that names the lists it is in).
 */
export function listView(app: App, navigate: Navigate): View {
    const search = h('input', {
        type: 'search', id: 'search', placeholder: 'Buscar por título o autor', 'aria-label': 'Buscar cantos',
        autocomplete: 'off', enterkeyhint: 'search',
    });
    const error = h('p', { class: 'error songs__error', role: 'alert' });
    const count = h('p', { class: 'songs__count', 'aria-live': 'polite' });
    const list = h('ul', { class: 'song-list lrows' });
    const empty = h('p', { class: 'empty', hidden: true });
    const element = h(
        'div',
        { class: 'page' },
        h('h2', { class: 'sr-only' }, 'Cantos'),
        h('div', { class: 'songs__top' },
            search,
            h('a', { class: 'button songs__import', href: paths.import(), 'data-link': true }, icon('upload', 18), 'Importar'),
            h('a', { class: 'button button--primary songs__new', href: paths.new(), 'data-link': true }, icon('plus', 18), 'Nuevo canto')),
        error,
        count,
        list,
        empty,
    );

    // --- "⋯" of a row: what is done to that song from here ---
    let songs: Song[] = [];
    /** The song whose "⋯" is open */
    let target: string | null = null;
    // The screen scrolls inside the app, so the sheet covers the window, not the page
    const sheet = createSheet('Opciones del canto', () => fill());
    sheet.element.classList.add('sheet-layer--window');
    element.append(sheet.element);
    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
    };
    const fill = (): void => {
        const song = songs.find((candidate) => candidate.id === target);
        if (song === undefined) {
            // Deleted (here or on another device) while its sheet was open
            sheet.close();

            return;
        }
        sheet.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, song.title),
            ...(song.author === '' ? [] : [h('p', { class: 'sheet__sub' }, song.author)]),
            sheetAction('pencil', 'Editar letra y acordes', () => {
                error.textContent = '';
                sheet.close(() => navigate(paths.edit(song.id)));
            }),
            // Last and set apart, so it is not touched by mistake next to the others
            sheetAction('trash', 'Eliminar canto', () => {
                error.textContent = '';
                sheet.close(() => {
                    deleteSongAfterAsking(app, song).catch((failure: unknown) => fail(failure, 'No se pudo eliminar el canto.'));
                });
            }, { danger: true, apart: true }),
        );
    };

    const more = (song: Song): HTMLElement => {
        const button = h('button', {
            type: 'button', class: 'lrow__more', 'aria-label': `Más opciones: ${song.title}`, 'data-more': song.id,
        }, icon('more', 22));
        button.addEventListener('click', () => {
            target = song.id;
            sheet.open();
        });

        return button;
    };

    /** `query` is what is being searched: a song found only through its lyrics shows the lines that matched */
    const row = (song: Song, query: string): HTMLElement => {
        const key = songKey(parse(song.body));
        const text = h('a', { class: 'lrow__link', href: paths.view(song.id), 'data-link': true },
            h('span', { class: 'lrow__title' }, song.title),
            ...(song.author === '' ? [] : [h('span', { class: 'lrow__detail' }, song.author)]),
            ...(foundInLyricsOnly(song, query) ? [snippetBlock(songSnippet(song, query))] : []));

        return h('li', { class: 'lrow' }, text,
            ...(key === null ? [] : [h('span', { class: 'chip lrow__key' }, transpose(key, 0, readNotation()))]),
            more(song));
    };

    const draw = (): void => {
        // The button that was pressed is replaced by the redraw: the focus goes back to it
        const focused = document.activeElement?.getAttribute('data-more') ?? null;
        const shown = filterSongs(songs, search.value);
        list.replaceChildren(...shown.map((song) => row(song, search.value)));
        empty.hidden = shown.length > 0;
        empty.textContent = songs.length === 0
            ? 'Todavía no hay cantos. Crea uno o importa uno que ya tengas escrito.'
            : 'Ningún canto coincide con la búsqueda.';
        count.hidden = songs.length === 0;
        const found = shown.length === 1 ? '1 canto' : `${shown.length} cantos`;
        count.textContent = search.value.trim() === '' ? found : `${found} de ${songs.length}`;
        if (focused !== null) {
            list.querySelector<HTMLElement>(`[data-more="${CSS.escape(focused)}"]`)?.focus();
        }
    };
    const load = (): void => {
        void app.list().then((all) => {
            songs = all;
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
