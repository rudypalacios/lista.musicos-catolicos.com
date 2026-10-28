import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { transpose } from '../chordpro/chord.ts';
import type { Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { filterSongs } from '../search.ts';
import type { View } from './types.ts';

export function listView(app: App): View {
    const search = h('input', {
        type: 'search', id: 'search', placeholder: 'Buscar por título o autor', 'aria-label': 'Buscar cantos',
        autocomplete: 'off', enterkeyhint: 'search',
    });
    const list = h('ul', { class: 'song-list' });
    const empty = h('p', { class: 'empty', hidden: true });
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Cantos'),
        h('div', { class: 'actions' }, link(paths.new(), 'Nuevo canto', 'button button--primary'), link(paths.import(), 'Importar', 'button')),
        search,
        list,
        empty,
        h('p', { class: 'muted help-link' }, link(paths.install(), '¿Cómo instalar la app en el iPad o el teléfono?')),
    );

    let songs: Song[] = [];
    const draw = (): void => {
        const shown = filterSongs(songs, search.value);
        list.replaceChildren(...shown.map(item));
        empty.hidden = shown.length > 0;
        empty.textContent = songs.length === 0
            ? 'Todavía no hay cantos. Crea uno o importa uno que ya tengas escrito.'
            : 'Ningún canto coincide con la búsqueda.';
    };
    const load = (): void => {
        void app.list().then((all) => {
            songs = all;
            draw();
        });
    };

    search.addEventListener('input', draw);
    const stop = app.onData(load);
    load();

    return { element, dispose: stop };
}

function item(song: Song): HTMLElement {
    const sheet = parse(song.body);
    const key = songKey(sheet);
    const title = h('span', { class: 'song-item__title' }, song.title);
    const text = h('span', {}, title);
    if (song.author !== '') {
        text.append(h('span', { class: 'song-item__author' }, song.author));
    }
    const row = h('a', { class: 'song-item', href: paths.view(song.id), 'data-link': true }, text);
    if (key !== null) {
        row.append(h('span', { class: 'chip' }, transpose(key, 0, readNotation())));
    }

    return h('li', {}, row);
}
