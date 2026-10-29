import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { transpose } from '../chordpro/chord.ts';
import { MASS_PARTS, type MassPart } from '../mass.ts';
import type { Setlist, Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { filterSongs } from '../search.ts';
import { showToast } from '../toast.ts';
import type { Navigate, View } from './types.ts';

/** How long (ms) the notice of a song placed twice stays: long enough to read while the list opens */
const WARNING_TIME = 5000;

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
    /** The way out when the song is not in the library: write it here, with what was searched as its title */
    const create = h('div', { class: 'actions' });
    /** Where each song of the list already is, by song id: the part names */
    const placed = new Map<string, Set<string>>();
    for (const item of setlist.items) {
        const name = MASS_PARTS.find((candidate) => candidate.id === item.part)?.name ?? 'otra parte';
        placed.set(item.songId, (placed.get(item.songId) ?? new Set<string>()).add(name));
    }
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, `Agregar a ${part.name}`),
        search,
        error,
        list,
        empty,
        create,
    );

    let songs: Song[] = [];
    const draw = (): void => {
        const shown = filterSongs(songs, search.value);
        list.replaceChildren(...shown.map((song) => row(song)));
        empty.hidden = shown.length > 0;
        if (songs.length === 0) {
            empty.textContent = 'Todavía no hay cantos en la biblioteca.';
        } else {
            empty.textContent = 'Ningún canto coincide con la búsqueda.';
        }
        drawCreate();
    };

    const drawCreate = (): void => {
        const typed = search.value.trim();
        const label = typed === '' ? 'Crear canto nuevo' : `Crear «${typed}»`;
        create.hidden = typed === '' && songs.length > 0;
        create.replaceChildren(link(paths.new({ setlist: setlist.id, part: part.id }, typed), label, 'button button--primary'));
    };

    const row = (song: Song): HTMLElement => {
        const key = songKey(parse(song.body));
        const title = h('span', { class: 'song-item__title' }, song.title);
        const text = h('span', {}, title);
        if (song.author !== '') {
            text.append(h('span', { class: 'song-item__author' }, song.author));
        }
        const button = h('button', { type: 'button', class: 'song-item', 'data-song': song.id }, text);
        // Searching is not the moment to warn: the notice comes when the song is added (below)
        if (placed.get(song.id)?.has(part.name) === true) {
            button.append(h('span', { class: 'chip chip--changed' }, 'Ya está aquí'));
        }
        if (key !== null) {
            button.append(h('span', { class: 'chip' }, transpose(key, 0, readNotation())));
        }
        button.addEventListener('click', () => {
            button.disabled = true;
            error.textContent = '';
            app.setlists
                .addItem(setlist.id, part.id, song.id)
                .then(() => {
                    navigate(`${paths.setlist(setlist.id)}#parte-${part.id}`, { replace: true });
                    // Not a block: a song can be sung twice in a Mass. Only a word, once it is in.
                    const elsewhere = [...(placed.get(song.id) ?? [])].filter((name) => name !== part.name);
                    if (elsewhere.length > 0) {
                        showToast(`“${song.title}” también está en: ${elsewhere.join(', ')}`, WARNING_TIME, true);
                    }
                })
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
