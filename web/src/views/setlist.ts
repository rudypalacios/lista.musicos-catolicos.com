import type { App } from '../app.ts';
import { transpose } from '../chordpro/chord.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { LIMITS, type PartDef, type Setlist, type SetlistItem, type Song } from '../data/types.ts';
import { inListOrder, itemsOfPart, moveOptions, partName, positionInList, strayItems, visibleParts } from '../data/setlists.ts';
import { attachLongPressDrag, dragHintPending, markDragHintSeen, type LongPressDrag } from '../drag-reorder.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { planSheet } from '../print/plan.ts';
import type { PrintVersion } from '../print/layout.ts';
import { printPlans } from '../print/print.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { showToast, showUndoToast } from '../toast.ts';
import { todayKeys } from '../today-keys.ts';
import { deleteListAfterAsking } from './delete-list.ts';
import { createShareSheet } from './share-sheet.ts';
import { createSheet, sheetAction } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/** A section with this many songs or more also has its "agregar" at the end: the one in the head would be far away */
const ADD_AT_END_FROM = 4;

/**
 * One setlist: its title, and its sections, each a slot. A section
 * with no song is one quiet line; a part with songs is a heading and one row per song. A row only
 * shows the song (touching it sings it from there; the key is read-only here: it is changed while singing, so
 * it is saved to the list and not to the song); "⋯" opens a sheet with what is done now and then to one song
 * (sing from it, move it up or down within its part, remove it with an undo). The list's own "⋯" is always
 * there: it holds print (only when there are songs) and, last and set apart, delete the list (after a question,
 * the same as on the lists screen).
 *
 * The notes of a list and of its songs are kept in the data but are not shown or edited anywhere.
 */
export async function setlistView(app: App, navigate: Navigate, initial: Setlist): Promise<View> {
    let setlist = initial;
    let songs = await songsById(app);
    /** Parts whose explanation (ⓘ) is open: it must stay open when the list is redrawn */
    const explained = new Set<string>();

    // --- the header: title, and what to do with the list (the list keeps its day in the data; it is not shown or edited here) ---
    // A field that grows with the title: a long name is read whole, never cut off
    const title = h('textarea', {
        id: 'title', class: 'setlist-title', rows: '1', 'aria-label': 'Título', autocomplete: 'off', maxlength: String(LIMITS.title),
    });
    const fitTitle = (): void => {
        title.style.height = 'auto';
        title.style.height = `${title.scrollHeight}px`;
    };
    new ResizeObserver(fitTitle).observe(title);
    title.addEventListener('input', fitTitle);
    const count = h('span', { class: 'muted' });
    const error = h('p', { class: 'error setlist__error', role: 'alert' });
    const sing = h('a', { class: 'button button--primary', 'data-link': true, href: paths.perform(setlist.id, 1) }, icon('play', 16), 'Cantar');
    const more = h('button', { type: 'button', class: 'button button--icon', 'aria-label': 'Más opciones del listado', 'data-focus': 'list-more' }, icon('more', 22));
    const slots = h('div', { class: 'slots' });

    const element = h(
        'div',
        { class: 'page' },
        h('header', { class: 'setlist-head' },
            // The "⋯" is always in the corner beside the name; the count and "Cantar" share the row under it
            h('div', { class: 'setlist-head__top' }, title, more),
            h('div', { class: 'setlist-head__meta' }, count, sing),
            error),
        slots,
    );

    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
    };

    const saveHeader = (): Promise<unknown> => {
        error.textContent = '';

        // The day and the notes of the list are not edited on this screen (kept as they are)
        return app.setlists
            .update(setlist.id, { title: title.value, eventDate: setlist.eventDate, notes: setlist.notes })
            .catch((failure: unknown) => fail(failure, 'No se pudo guardar el listado.'));
    };
    title.addEventListener('change', () => void saveHeader());
    title.addEventListener('keydown', (event) => {
        // A title is one line: Enter finishes it instead of breaking it
        if (event.key === 'Enter') {
            event.preventDefault();
            title.blur();
        }
    });

    // --- the sheets ---
    // The screen scrolls inside the app, so a sheet here covers the window, not the page
    const listSheet = createSheet('Opciones del listado', () => fillListSheet());
    const songSheet = createSheet('Opciones del canto', () => fillSongSheet());
    listSheet.element.classList.add('sheet-layer--window');
    songSheet.element.classList.add('sheet-layer--window');
    // "Compartir listado": its own sheet, which comes after the list's
    const shareSheet = createShareSheet();
    element.append(listSheet.element, songSheet.element, shareSheet.element);

    const print = (version: PrintVersion): void => {
        // Straight from the tap (a browser may refuse to print from anything later), then the sheet goes
        printPlans(
            inListOrder(setlist).flatMap((item) => {
                const song = songs.get(item.songId);
                const part = partName(setlist, item.part);

                return song === undefined ? [] : [planSheet(song, { version, shift: item.transpose, notation: readNotation(), ...(part !== undefined ? { part } : {}) })];
            }),
        ).catch(() => fail(undefined, 'No se pudo preparar la impresión.'));
        listSheet.close();
    };
    const fillListSheet = (): void => {
        const rows = setlist.items.length;
        listSheet.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, setlist.title),
            h('p', { class: 'sheet__sub' }, rows === 1 ? '1 canto' : `${rows} cantos`),
            // First: what the list is made of; then what is done with it
            action('sections', 'Secciones del listado', () => listSheet.close(() => navigate(paths.sections(setlist.id))), { hint: 'Qué secciones lleva este listado' }),
            action('share', 'Compartir listado', () => listSheet.close(() => shareSheet.open(setlist)), { hint: 'Un enlace para que cualquiera lo lea' }),
            ...(rows > 0 ? [action('printer', 'Imprimir con acordes', () => print('chords')), action('printer', 'Imprimir solo la letra', () => print('lyrics'))] : []),
            // Last and set apart, so it is not touched by mistake next to printing
            sheetAction('trash', 'Eliminar listado', () => {
                error.textContent = '';
                listSheet.close(() => {
                    deleteListAfterAsking(app, setlist)
                        .then((deleted) => (deleted ? navigate(paths.lists()) : undefined))
                        .catch((failure: unknown) => fail(failure, 'No se pudo eliminar el listado.'));
                });
            }, { danger: true, apart: true }),
        );
    };
    more.addEventListener('click', listSheet.open);

    /** The item whose "⋯" is open */
    let target: string | null = null;
    const fillSongSheet = (focus?: 'up' | 'down' | 'start' | 'end'): void => {
        const item = setlist.items.find((candidate) => candidate.id === target);
        if (item === undefined) {
            // Removed (here or on another device) while its sheet was open
            songSheet.close();

            return;
        }
        const song = songs.get(item.songId);
        const name = song?.title ?? 'Canto eliminado';
        const section = partName(setlist, item.part) ?? 'Otra sección';
        const can = moveOptions(setlist.items, item.id);
        const step = (direction: -1 | 1): void => {
            void app.setlists.moveItem(setlist.id, item.id, direction).catch((failure: unknown) => fail(failure, 'No se pudo mover el canto.'));
        };
        /** To the start (0) or the end (the number of the others) of its section */
        const toEnd = (end: boolean): void => {
            const to = end ? itemsOfPart(setlist.items, item.part).length - 1 : 0;
            void app.setlists.reorderItem(setlist.id, item.id, to).catch((failure: unknown) => fail(failure, 'No se pudo mover el canto.'));
        };
        songSheet.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, name),
            h('p', { class: 'sheet__sub' }, section),
            ...(song === undefined ? [] : [action('play', 'Cantar desde aquí', () => {
                const at = positionInList(setlist, item.id);
                songSheet.close(() => navigate(paths.perform(setlist.id, at)));
            }, { hint: 'Ahí se cambia el tono' })]),
            // Only the moves that can happen: a part with one song has none
            ...(can.up ? [action('arrow-up', 'Subir en esta sección', () => step(-1), { key: 'up' })] : []),
            ...(can.down ? [action('arrow-down', 'Bajar en esta sección', () => step(1), { key: 'down' })] : []),
            // Only when they say more than the arrows (more than two songs in the section)
            ...(can.toStart ? [action('to-top', 'Al inicio de esta sección', () => toEnd(false), { key: 'start' })] : []),
            ...(can.toEnd ? [action('to-bottom', 'Al final de esta sección', () => toEnd(true), { key: 'end' })] : []),
            action('x', 'Quitar del listado', () => {
                const index = setlist.items.findIndex((candidate) => candidate.id === item.id);
                songSheet.close(() => {
                    void app.setlists.removeItem(setlist.id, item.id).then(() => {
                        showUndoToast(`«${name}» quitado del listado`, 'Deshacer', () => {
                            void app.setlists.restoreItem(setlist.id, item, index).catch((failure: unknown) => fail(failure, 'No se pudo deshacer.'));
                        });
                    }).catch((failure: unknown) => fail(failure, 'No se pudo quitar el canto.'));
                });
            }, { danger: true }),
        );
        // Moving keeps the sheet open (to move again): the button pressed is replaced, so focus its twin
        if (focus !== undefined) {
            const kept = songSheet.body.querySelector<HTMLElement>(`[data-key="${focus}"]`)
                ?? songSheet.body.querySelector<HTMLElement>('[data-key="up"], [data-key="down"], [data-key="start"], [data-key="end"]');
            kept?.focus();
        }
    };
    const openSongSheet = (itemId: string): void => {
        target = itemId;
        songSheet.open();
    };
    // A move keeps the sheet open (to move again): it is refreshed with the new list, keeping the focus on a move
    let lastMove: 'up' | 'down' | 'start' | 'end' | undefined;
    const refreshSongSheet = (): void => {
        if (songSheet.isOpen()) {
            const focus = lastMove;
            lastMove = undefined;
            fillSongSheet(focus);
        }
    };

    // --- the slots ---
    /** The long-press drags of the rows on screen: they are made again with the rows, and let go of with them */
    let drags: LongPressDrag[] = [];
    /** A change arrived while a song was held: it is shown when the song is dropped */
    let reloadHeld = false;
    let hinted = false;
    const draw = (): void => {
        const focused = document.activeElement?.getAttribute('data-focus') ?? null;
        drags.forEach((drag) => drag.dispose());
        drags = [];
        const rows = inListOrder(setlist);
        const known = visibleParts(setlist).map((part) => slot(part));
        const strays = strayItems(setlist);
        slots.replaceChildren(...known, ...(strays.length > 0 ? [strangers(strays)] : []));
        count.textContent = rows.length === 1 ? '1 canto' : `${rows.length} cantos`;
        // The "⋯" is always there (deleting the list is in it); only the printing needs songs
        if (listSheet.isOpen()) {
            fillListSheet();
        }
        sing.hidden = rows.length === 0;
        // Said once on a device, the first time a list has a section with more than one song: nothing on a row shows that it can be held
        if (!hinted && drags.length > 0 && dragHintPending()) {
            hinted = true;
            markDragHintSeen();
            showToast('Mantén pulsado un canto para moverlo', 6000);
        }
        if (focused !== null) {
            element.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
        }
    };

    const slot = (part: PartDef): HTMLElement => {
        const items = itemsOfPart(setlist.items, part.id);
        const empty = items.length === 0;
        const head = h('div', { class: 'slot__head' }, h('h3', {}, part.name));
        if (part.optional === true) {
            head.append(h('span', { class: 'badge' }, 'opcional'));
        }
        const section = h('section', { class: empty ? 'slot is-empty' : 'slot', id: `parte-${part.id}`, 'data-part': part.id }, head);
        if (part.note !== undefined) {
            const note = h('p', { class: 'slot__note', hidden: !explained.has(part.id) }, part.note);
            const info = h('button', {
                type: 'button', class: 'info', title: part.note, 'aria-label': `Qué es esto: ${part.name}`,
                'aria-expanded': String(explained.has(part.id)), 'data-focus': `info:${part.id}`,
            }, icon('info', 18));
            info.addEventListener('click', () => {
                if (explained.delete(part.id)) {
                    note.hidden = true;
                } else {
                    explained.add(part.id);
                    note.hidden = false;
                }
                info.setAttribute('aria-expanded', String(!note.hidden));
            });
            head.append(info);
            section.append(note);
        }
        // The way in is always in the head, on the right: with words while the part is empty, as a "+" once it has songs
        const href = paths.addToSetlist(setlist.id, part.id);
        head.append(empty
            ? h('a', { class: 'add', href, 'data-link': true, 'aria-label': `Agregar canto a ${part.name}` }, icon('plus', 16), 'Agregar')
            : h('a', { class: 'add add--icon', href, 'data-link': true, 'aria-label': `Agregar canto a ${part.name}` }, icon('plus', 22)));
        if (!empty) {
            section.append(h('ul', { class: 'items' }, ...items.map(row)));
            if (items.length >= ADD_AT_END_FROM) {
                section.append(h('a', { class: 'add', href, 'data-link': true, 'aria-label': `Agregar canto al final de ${part.name}` }, icon('plus', 16), 'Agregar canto'));
            }
        }

        return section;
    };

    /** Items whose section the list does not show (switched off or removed on another device): shown, so they can be moved or removed */
    const strangers = (items: SetlistItem[]): HTMLElement =>
        h(
            'section',
            { class: 'slot' },
            h('div', { class: 'slot__head' }, h('h3', {}, 'Otras secciones')),
            h('ul', { class: 'items' }, ...items.map(row)),
        );

    const row = (item: SetlistItem): HTMLElement => {
        const song = songs.get(item.songId);
        const li = h('li', { class: song === undefined ? 'item is-gone' : 'item' });
        const name = song?.title ?? 'Canto eliminado';
        const lines: HTMLElement[] = [h('span', { class: 'item__title' }, name)];
        if (song !== undefined) {
            // "Autor · SOL": the key is for reading here, and amber when it is not the song's own
            const key = keyOf(item, song);
            const sub: Array<Node | string> = song.author === '' ? [] : [song.author];
            if (key !== null) {
                const label = h('span', { class: key.changed ? 'item__key is-changed' : 'item__key' }, h('span', { class: 'sr-only' }, 'Tono '), key.text);
                sub.push(...(sub.length > 0 ? [' · ', label] : [label]));
                // A key set only for today (while rehearsing or singing, not saved): say so beside it
                if (key.today) {
                    sub.push(h('span', { class: 'item__today' }, 'hoy'));
                }
            }
            if (sub.length > 0) {
                lines.push(h('span', { class: 'item__sub' }, ...sub));
            }
            // The same song in another part is allowed (a hymn can open and close), but worth a word
            const elsewhere = otherParts(item, setlist);
            if (elsewhere.length > 0) {
                lines.push(h('span', { class: 'item__also', role: 'note' }, `También está en: ${elsewhere.join(', ')}`));
            }
        }
        // Touching the song sings it from here (the same as "Cantar desde aquí"); a song that is gone has nothing to open
        if (song === undefined) {
            li.append(h('div', { class: 'item__open' }, ...lines));
        } else {
            const open = h('button', { type: 'button', class: 'item__open', 'data-focus': `open:${item.id}` }, ...lines);
            // Holding the song lifts it to move it inside its section (a section with one song has nowhere to go); a short touch still sings it
            const drag = itemsOfPart(setlist.items, item.part).length >= 2
                ? attachLongPressDrag({
                    handle: open,
                    row: li,
                    rowClass: 'item',
                    scroller: () => document.getElementById('view'),
                    onDrop: (to) => void app.setlists.reorderItem(setlist.id, item.id, to).catch((failure: unknown) => fail(failure, 'No se pudo mover el canto.')),
                    onEnd: () => {
                        if (reloadHeld) {
                            reloadHeld = false;
                            reload();
                        }
                    },
                })
                : null;
            if (drag !== null) {
                drags.push(drag);
            }
            open.addEventListener('click', () => {
                // Dropping a song ends in a click: it is the drop, not a touch on the song
                if (drag?.justDragged() !== true) {
                    navigate(paths.perform(setlist.id, positionInList(setlist, item.id)));
                }
            });
            li.append(open);
        }
        const options = h('button', {
            type: 'button', class: 'item__more', 'aria-label': `Más opciones: ${name}`, 'data-focus': `more:${item.id}`,
        }, icon('more', 22));
        options.addEventListener('click', () => {
            lastMove = undefined;
            openSongSheet(item.id);
        });
        li.append(options);

        return li;
    };

    /**
     * The key of this use of the song, to read: changed in amber. Songs with no key show only a change.
     * A key of today, if there is one, takes the place of the saved one.
     */
    const keyOf = (item: SetlistItem, song: Song): { text: string; changed: boolean; today: boolean } | null => {
        const original = songKey(parse(song.body));
        const shift = todayKeys.get(setlist.id, item.id) ?? item.transpose;
        const today = shift !== item.transpose;
        const changed = shift !== 0;
        if (original === null) {
            return changed ? { text: `${shift > 0 ? '+' : ''}${shift}`, changed, today } : null;
        }

        return { text: transpose(original, shift, readNotation()), changed, today };
    };

    /** A row of a sheet: an icon and what it does, big enough to tap, and a quiet line under it if it needs one */
    function action(name: IconName, label: string, run: () => void, options: { danger?: boolean; hint?: string; key?: 'up' | 'down' | 'start' | 'end' } = {}): HTMLElement {
        const button = h('button', {
            type: 'button', class: options.danger === true ? 'sheet-action is-danger' : 'sheet-action',
            ...(options.key !== undefined ? { 'data-key': options.key } : {}),
        }, icon(name, 20), h('span', { class: 'sheet-action__text' }, label, ...(options.hint === undefined ? [] : [h('small', {}, options.hint)])));
        button.addEventListener('click', () => {
            if (options.key !== undefined) {
                lastMove = options.key;
            }
            run();
        });

        return button;
    }

    /**
     * Coming back from picking a song the address names the part (`#parte-comunion`): show it
     * and flash the song just added, so the person finds the place they left.
     */
    function revealPart(): void {
        const target = location.hash.startsWith('#parte-') ? location.hash.slice(1) : '';
        if (target === '') {
            return;
        }
        // Once: a reload or a return to this address later must not jump again
        history.replaceState(history.state, '', location.pathname + location.search);
        requestAnimationFrame(() => {
            const section = slots.querySelector<HTMLElement>(`#${CSS.escape(target)}`);
            const added = section?.querySelector<HTMLElement>('.item:last-child');
            section?.scrollIntoView({ block: 'center' });
            added?.classList.add('is-new');
        });
    }

    // --- keeping it in step with the store ---
    const fill = (): void => {
        if (document.activeElement !== title && title.value !== setlist.title) {
            title.value = setlist.title;
        }
        fitTitle();
    };
    const reload = (): void => {
        // A song held in the air must not be redrawn under the finger: what arrived waits for the drop
        if (drags.some((drag) => drag.active())) {
            reloadHeld = true;

            return;
        }
        void Promise.all([app.setlists.get(setlist.id), songsById(app)]).then(([latest, all]) => {
            if (latest === undefined) {
                // Deleted on another device while it was open
                navigate(paths.lists(), { replace: true });

                return;
            }
            setlist = latest;
            songs = all;
            fill();
            draw();
            refreshSongSheet();
        });
    };
    const stop = app.onData(reload);

    fill();
    draw();
    revealPart();

    return {
        element,
        dispose: () => {
            stop();
            drags.forEach((drag) => drag.dispose());
            songSheet.release();
            listSheet.release();
            shareSheet.release();
            // What was typed and not yet "changed" (a navigation can come before the blur) is still saved
            const unchanged = title.value === setlist.title;
            if (!unchanged && title.value.trim() !== '') {
                void saveHeader();
            }
        },
    };
}

/** The names of the other sections of the list where the item's song is also placed */
function otherParts(item: SetlistItem, list: Pick<Setlist, 'parts' | 'items'>): string[] {
    const names = new Set<string>();
    for (const other of list.items) {
        if (other.id !== item.id && other.songId === item.songId) {
            names.add(partName(list, other.part) ?? 'otra sección');
        }
    }

    return [...names];
}

/** The songs that exist, by id */
async function songsById(app: App): Promise<Map<string, Song>> {
    return new Map((await app.list()).map((song) => [song.id, song]));
}
