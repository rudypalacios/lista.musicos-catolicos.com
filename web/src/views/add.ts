import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { transpose } from '../chordpro/chord.ts';
import { partName } from '../data/setlists.ts';
import { hasTag, tagOf, untaggedUses, withTag } from '../data/tags.ts';
import { LIMITS, type PartDef, type Setlist, type Song } from '../data/types.ts';
import { h, link, setSheet, snippetBlock } from '../dom.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { icon } from '../icons.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { filterSongs, songSnippet } from '../search.ts';
import { showToast, showUndoToast } from '../toast.ts';
import { createSheet } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/** How long (ms) the notice of a song placed twice stays: long enough to read while the list opens */
const WARNING_TIME = 5000;

/**
 * Picking a song of the library for one section of a list. The songs that carry the section's tag come first, on their
 * own, with "Mostrar todos" always at hand (and no filter at all while no song carries it). Picking one that does not
 * carry it offers to tag it. Choosing one adds it at the end of
 * that section and goes back to the list, where it can be moved or put in another key.
 *
 * Each row shows the first lines of the song (the lines where the search matched, when it was found
 * through its lyrics) and an eye that opens the whole song to read before adding it.
 */
export function addView(app: App, navigate: Navigate, setlist: Setlist, part: PartDef): View {
    const search = h('input', {
        type: 'search', id: 'search', placeholder: 'Buscar por título o autor', 'aria-label': 'Buscar cantos',
        autocomplete: 'off', enterkeyhint: 'search',
    });
    const list = h('ul', { class: 'song-list lrows' });
    const empty = h('p', { class: 'empty empty--above-action', hidden: true });
    const error = h('p', { class: 'error songs__error', role: 'alert' });
    const count = h('p', { class: 'songs__count', 'aria-live': 'polite' });
    /** The tag this section asks of a song ("Entrada"), and whether the list of songs is cut to the ones that carry it */
    const tag = tagOf(part);
    let filtering = true;
    const filter = h('div', { class: 'tag-filter', role: 'group', 'aria-label': 'Qué cantos mostrar', hidden: true });
    /** What the lists already say: songs used in this section that lack its tag, with the one touch that tags them */
    const offer = h('div', { class: 'tag-offer', hidden: true });
    let usedIn: Setlist[] = [];
    /** The way out when the song is not in the library: write it here, with what was searched as its title */
    const create = h('div', { class: 'actions actions--center' });
    /** Where each song of the list already is, by song id: the part names */
    const placed = new Map<string, Set<string>>();
    for (const item of setlist.items) {
        const name = partName(setlist, item.part) ?? 'otra sección';
        placed.set(item.songId, (placed.get(item.songId) ?? new Set<string>()).add(name));
    }
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, `Agregar a ${part.name}`),
        // The same search, and the same count under it, as on Cantos
        h('div', { class: 'songs__top' }, search),
        filter,
        offer,
        error,
        count,
        list,
        empty,
        create,
    );

    let songs: Song[] = [];
    const draw = (): void => {
        // No filter while no song carries the tag: it would show nothing, and the person has not tagged anything yet
        const tagged = withTag(songs, tag);
        const filtered = filtering && tagged.length > 0;
        const pool = filtered ? tagged : songs;
        const shown = filterSongs(pool, search.value);
        drawFilter(tagged.length);
        drawOffer();
        list.replaceChildren(...shown.map((song) => row(song)));
        empty.hidden = shown.length > 0;
        count.hidden = songs.length === 0;
        const found = shown.length === 1 ? '1 canto' : `${shown.length} cantos`;
        count.textContent = search.value.trim() === '' ? found : `${found} de ${pool.length}`;
        if (songs.length === 0) {
            empty.textContent = 'Todavía no hay cantos en la biblioteca.';
        } else if (filtered) {
            empty.textContent = `Ningún canto con «${tag}» coincide con la búsqueda. Prueba con «Mostrar todos».`;
        } else {
            empty.textContent = 'Ningún canto coincide con la búsqueda.';
        }
        drawCreate();
    };

    /** The songs the lists use in this section and that lack its tag, now */
    const untagged = (): Song[] => untaggedUses(usedIn, songs, part.id, tag);

    const drawOffer = (): void => {
        const pending = untagged();
        offer.hidden = pending.length === 0;
        if (pending.length === 0) {
            return;
        }
        const many = pending.length > 1;
        const button = h('button', { type: 'button', class: 'button' }, icon('tag', 16), many ? `Etiquetarlos como «${tag}»` : `Etiquetarlo como «${tag}»`);
        button.addEventListener('click', () => confirmTag.open());
        offer.replaceChildren(
            h('p', {}, h('b', {}, many ? `${pending.length} cantos` : '1 canto'), ` de tus listados ${many ? 'están' : 'está'} en `, h('b', {}, part.name),
                ` y no ${many ? 'tienen' : 'tiene'} la etiqueta «${tag}».`),
            button,
        );
    };

    // --- before tagging: the songs, one by one, and what is added to them ---
    const SHOWN = 5;
    const confirmTag = createSheet(`Etiquetar como «${tag}»`, () => fillConfirm());
    confirmTag.element.classList.add('sheet-layer--window');
    element.append(confirmTag.element);
    const fillConfirm = (): void => {
        const pending = untagged();
        if (pending.length === 0) {
            confirmTag.close();

            return;
        }
        const many = pending.length > 1;
        const problem = h('p', { class: 'error', role: 'alert' });
        const go = h('button', { type: 'button', class: 'button button--primary' }, many ? `Etiquetar ${pending.length} cantos` : 'Etiquetar 1 canto');
        const cancel = h('button', { type: 'button', class: 'button' }, 'Cancelar');
        cancel.addEventListener('click', () => confirmTag.close());
        go.addEventListener('click', () => {
            go.disabled = true;
            const ids = pending.map((song) => song.id);
            app.addTag(ids, tag).then((changed) => {
                const done = changed.map((song) => song.id);
                confirmTag.close();
                void reload();
                showUndoToast(
                    changed.length === 1 ? `1 canto etiquetado como «${tag}»` : `${changed.length} cantos etiquetados como «${tag}»`,
                    'Deshacer',
                    () => void app.removeTag(done, tag).then(reload, () => showToast('No se pudo deshacer.', 4000, true)),
                    WARNING_TIME,
                );
            }).catch((failure: unknown) => {
                problem.textContent = failure instanceof Error ? failure.message : 'No se pudo etiquetar.';
                go.disabled = false;
            });
        });
        confirmTag.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, `Etiquetar como «${tag}»`),
            h('p', { class: 'sheet__sub' }, many
                ? `Estos ${pending.length} cantos están en «${part.name}» en tus listados. Se les agrega la etiqueta «${tag}».`
                : `Este canto está en «${part.name}» en tus listados. Se le agrega la etiqueta «${tag}».`),
            h('ul', { class: 'tag-offer__songs' }, ...pending.slice(0, SHOWN).map((song) => h('li', {}, song.title))),
            ...(pending.length > SHOWN ? [h('p', { class: 'sheet__sub' }, `Y ${pending.length - SHOWN} más.`)] : []),
            h('p', { class: 'sheet__sub' }, 'No cambia la letra, ni tus listados, ni las otras etiquetas que ya tengan.'),
            problem,
            h('div', { class: 'preview__foot' }, cancel, go),
        );
    };

    /** The two ways to see the songs: the ones with the section's tag, or all of them (only once some song has the tag) */
    const drawFilter = (taggedCount: number): void => {
        filter.hidden = taggedCount === 0;
        if (taggedCount === 0) {
            return;
        }
        const choice = (label: string, total: number, on: boolean, set: boolean): HTMLElement => {
            const button = h('button', { type: 'button', 'aria-pressed': String(on) }, label, h('small', {}, String(total)));
            button.addEventListener('click', () => {
                filtering = set;
                draw();
            });

            return button;
        };
        filter.replaceChildren(
            choice(tag, taggedCount, filtering, true),
            choice('Mostrar todos', songs.length, !filtering, false),
        );
    };

    const drawCreate = (): void => {
        const typed = search.value.trim();
        const label = typed === '' ? 'Crear canto nuevo' : `Crear «${typed}»`;
        create.hidden = typed === '' && songs.length > 0;
        create.replaceChildren(link(paths.new({ setlist: setlist.id, part: part.id }, typed), label, 'button button--primary'));
    };

    const row = (song: Song): HTMLElement => {
        const key = songKey(parse(song.body));
        // A song looks the same wherever it is listed (Cantos, Listados): the title, "Autor · Do" under it
        const detail = [
            ...(song.author === '' ? [] : [song.author]),
            ...(key === null ? [] : [h('span', { class: 'lrow__key' }, transpose(key, 0, readNotation()))]),
            // Searching is not the moment to warn: the notice comes when the song is added (below)
            ...(placed.get(song.id)?.has(part.name) === true ? [h('span', { class: 'lrow__here' }, 'Ya está aquí')] : []),
        ].flatMap((piece, index) => (index === 0 ? [piece] : [' · ', piece]));
        const snippet = songSnippet(song, search.value);
        const button = h('button', { type: 'button', class: 'lrow__link lrow__pick', 'data-song': song.id },
            h('span', { class: 'lrow__title' }, song.title),
            ...(detail.length === 0 ? [] : [h('span', { class: 'lrow__detail' }, ...detail)]),
            ...(snippet.length > 0 ? [snippetBlock(snippet)] : []));
        button.addEventListener('click', () => {
            button.disabled = true;
            error.textContent = '';
            place(song).catch((failure: unknown) => {
                error.textContent = failure instanceof Error ? failure.message : 'No se pudo agregar el canto.';
                button.disabled = false;
            });
        });
        const see = h('button', { type: 'button', class: 'lrow__more lrow__see', 'aria-label': `Ver el canto completo: ${song.title}` }, icon('eye', 22));
        see.addEventListener('click', () => {
            previewing = song;
            preview.open();
        });

        return h('li', { class: 'lrow' }, button, see);
    };

    /** Adds the song at the end of the part and opens the list there; resolves once it is on its way */
    const place = async (song: Song): Promise<void> => {
        await app.setlists.addItem(setlist.id, part.id, song.id);
        navigate(`${paths.setlist(setlist.id)}#parte-${part.id}`, { replace: true });
        // Not a block: a song can be sung twice in a Mass. Only a word, once it is in.
        const elsewhere = [...(placed.get(song.id) ?? [])].filter((name) => name !== part.name);
        if (elsewhere.length > 0) {
            showToast(`“${song.title}” también está en: ${elsewhere.join(', ')}`, WARNING_TIME, true);
        } else if (!hasTag(song, tag) && song.tags.length < LIMITS.tags) {
            // A song picked without the section's tag: one touch tags it, so the next time it is found there
            showUndoToast(`Agregado a ${part.name}`, `Etiquetar «${tag}»`, () => {
                app.setTags(song.id, [...song.tags, tag]).then(
                    () => showToast(`«${song.title}» etiquetado como «${tag}»`, 3000, true),
                    () => showToast('No se pudo etiquetar el canto.', 4000, true),
                );
            }, WARNING_TIME);
        }
    };

    // --- the whole song, to read before adding it ---
    /** The song the sheet shows */
    let previewing: Song | undefined;
    // The screen scrolls inside the app, so the sheet covers the window, not the page
    const preview = createSheet('Vista previa del canto', () => fillPreview());
    preview.element.classList.add('sheet-layer--window');
    element.append(preview.element);
    const fillPreview = (): void => {
        const song = previewing;
        if (song === undefined) {
            return;
        }
        const parsed = parse(song.body);
        const lyrics = h('div', { class: 'song-sheet preview__lyrics' });
        setSheet(lyrics, sheetHtml(parsed));
        // The key the song is added in is its own (the list changes it afterwards): the person's notation
        for (const chord of lyrics.querySelectorAll<HTMLElement>('.ch[data-chord]')) {
            chord.textContent = transpose(chord.dataset['chord'] ?? '', 0, readNotation());
        }
        const key = songKey(parsed);
        const head = h('div', { class: 'preview__head' }, h('h4', { class: 'sheet__title' }, song.title));
        if (key !== null) {
            head.append(h('span', { class: 'chip' }, transpose(key, 0, readNotation())));
        }
        const problem = h('p', { class: 'error', role: 'alert' });
        const add = h('button', { type: 'button', class: 'button button--primary' }, `Agregar a ${part.name}`);
        add.addEventListener('click', () => {
            add.disabled = true;
            place(song).catch((failure: unknown) => {
                problem.textContent = failure instanceof Error ? failure.message : 'No se pudo agregar el canto.';
                add.disabled = false;
            });
        });
        const close = h('button', { type: 'button', class: 'button' }, 'Cerrar');
        close.addEventListener('click', () => preview.close());
        preview.body.replaceChildren(
            head,
            ...(song.author !== '' ? [h('p', { class: 'sheet__sub' }, song.author)] : []),
            lyrics,
            problem,
            h('div', { class: 'preview__foot' }, close, add),
        );
    };

    /** The songs and the lists as they are now: at the start, and after tagging (or taking the tags off) */
    const reload = async (): Promise<void> => {
        const [all, lists] = await Promise.all([app.list(), app.setlists.list()]);
        songs = all;
        usedIn = lists;
        draw();
    };
    search.addEventListener('input', draw);
    void reload();

    return { element, dispose: () => {
        preview.release();
        confirmTag.release();
    } };
}
