import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { transpose } from '../chordpro/chord.ts';
import type { MassPart } from '../mass.ts';
import type { Setlist, Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { filterSongs } from '../search.ts';
import type { Navigate, View } from './types.ts';

/**
 * Picking a song of the library for one part of the Mass. Choosing one adds it at the end of
 * that part and goes back to the list, where it can be moved, put in another key or given a note.
 */
export function addView(app: App, navigate: Navigate, setlist: Setlist, part: MassPart): View {
    const search = h('input', {
        type: 'search', id: 'search', placeholder: 'Buscar por título o autor', 'aria-label': 'Buscar cantos',
        autocomplete: 'off', enterkeyhint: 'search',
    });
    const list = h('ul', { class: 'song-list' });
    const empty = h('p', { class: 'empty', hidden: true });
    const error = h('p', { class: 'error', role: 'alert' });
    const already = new Set(setlist.items.filter((item) => item.part === part.id).map((item) => item.songId));
    const element = h(
        'div',
        { class: 'page' },
        h('div', { class: 'actions' }, link(paths.setlist(setlist.id), '← Volver al listado', 'button')),
        h('h2', {}, `Agregar a ${part.name}`),
        search,
        error,
        list,
        empty,
    );

    let songs: Song[] = [];
    const draw = (): void => {
        const shown = filterSongs(songs, search.value);
        list.replaceChildren(...shown.map((song) => row(song)));
        empty.hidden = shown.length > 0;
        if (songs.length === 0) {
            empty.replaceChildren('Todavía no hay cantos en la biblioteca. ', link(paths.new(), 'Crea uno'), ' o ', link(paths.import(), 'importa uno'), '.');
        } else {
            empty.textContent = 'Ningún canto coincide con la búsqueda.';
        }
    };

    const row = (song: Song): HTMLElement => {
        const key = songKey(parse(song.body));
        const title = h('span', { class: 'song-item__title' }, song.title);
        const text = h('span', {}, title);
        if (song.author !== '') {
            text.append(h('span', { class: 'song-item__author' }, song.author));
        }
        const button = h('button', { type: 'button', class: 'song-item', 'data-song': song.id }, text);
        if (already.has(song.id)) {
            button.append(h('span', { class: 'chip chip--changed' }, 'Ya está'));
        }
        if (key !== null) {
            button.append(h('span', { class: 'chip' }, transpose(key, 0, readNotation())));
        }
        button.addEventListener('click', () => {
            button.disabled = true;
            error.textContent = '';
            app.setlists
                .addItem(setlist.id, part.id, song.id)
                .then(() => navigate(paths.setlist(setlist.id), { replace: true }))
                .catch((failure: unknown) => {
                    error.textContent = failure instanceof Error ? failure.message : 'No se pudo agregar el canto.';
                    button.disabled = false;
                });
        });

        return h('li', {}, button);
    };

    search.addEventListener('input', draw);
    void app.list().then((all) => {
        songs = all;
        draw();
    });

    return { element };
}
