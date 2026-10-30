import type { App } from '../app.ts';
import { transpose } from '../chordpro/chord.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { shortDay } from '../dates.ts';
import { LIMITS, type Setlist, type SetlistItem, type Song } from '../data/types.ts';
import { inMassOrder, itemsOfPart, moveOptions, partIndex, positionInMass } from '../data/setlists.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { MASS_PARTS, type MassPart } from '../mass.ts';
import { planSheet } from '../print/plan.ts';
import type { PrintVersion } from '../print/layout.ts';
import { printPlans } from '../print/print.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { showUndoToast } from '../toast.ts';
import { todayKeys } from '../today-keys.ts';
import { createSheet } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/** A part with this many songs or more also has its "agregar" at the end: the one in the head would be far away */
const ADD_AT_END_FROM = 4;

/**
 * One setlist: its title and day, and the template of the Mass with a slot for every part. A part
 * with no song is one quiet line; a part with songs is a heading and one row per song. A row only
 * shows the song (its title is not a link; the key is read-only here: it is changed while singing, so
 * it is saved to the list and not to the song); "⋯" opens a sheet with what is done now and then to one song
 * (sing from it, move it up or down within its part, remove it with an undo). The list's own "⋯" holds
 * print and delete.
 *
 * The notes of a list and of its songs are kept in the data but are not shown or edited anywhere.
 */
export async function setlistView(app: App, navigate: Navigate, initial: Setlist): Promise<View> {
    let setlist = initial;
    let songs = await songsById(app);
    /** Parts whose explanation (ⓘ) is open: it must stay open when the list is redrawn */
    const explained = new Set<string>();

    // --- the header: title, day, and what to do with the list ---
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
    const dayText = h('span', {});
    const day = h('input', { id: 'day', type: 'date', class: 'chip__input', 'aria-label': 'Fecha de la misa' });
    const dayChip = h('label', { class: 'chip chip--day' }, dayText, icon('pencil', 14), day);
    const count = h('span', { class: 'muted' });
    const error = h('p', { class: 'error setlist__error', role: 'alert' });
    const sing = h('a', { class: 'button button--primary', 'data-link': true, href: paths.perform(setlist.id, 1) }, icon('play', 16), 'Cantar');
    const more = h('button', { type: 'button', class: 'button button--icon', 'aria-label': 'Más opciones del listado', 'data-focus': 'list-more' }, icon('more', 22));
    const slots = h('div', { class: 'slots' });

    const element = h(
        'div',
        { class: 'page' },
        h('header', { class: 'setlist-head' },
            title,
            h('div', { class: 'setlist-head__meta' }, dayChip, count),
            error,
            h('div', { class: 'setlist-head__actions' }, sing, more)),
        slots,
    );

    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
    };

    const saveHeader = (): Promise<unknown> => {
        error.textContent = '';

        // The list's notes are not edited on this screen (kept as they are)
        return app.setlists
            .update(setlist.id, { title: title.value, eventDate: day.value === '' ? null : day.value, notes: setlist.notes })
            .catch((failure: unknown) => fail(failure, 'No se pudo guardar el listado.'));
    };
    for (const field of [title, day]) {
        field.addEventListener('change', () => void saveHeader());
    }
    title.addEventListener('keydown', (event) => {
        // A title is one line: Enter finishes it instead of breaking it
        if (event.key === 'Enter') {
            event.preventDefault();
            title.blur();
        }
    });
    day.addEventListener('input', () => {
        dayText.textContent = day.value === '' ? '＋ Fecha' : shortDay(day.value);
    });

    // --- the sheets ---
    // The screen scrolls inside the app, so a sheet here covers the window, not the page
    const listSheet = createSheet('Opciones del listado', () => fillListSheet());
    const songSheet = createSheet('Opciones del canto', () => fillSongSheet());
    listSheet.element.classList.add('sheet-layer--window');
    songSheet.element.classList.add('sheet-layer--window');
    element.append(listSheet.element, songSheet.element);

    /** This screen is deleting its own list: it leaves by itself, once */
    let leaving = false;

    const print = (version: PrintVersion): void => {
        // Straight from the tap (a browser may refuse to print from anything later), then the sheet goes
        printPlans(
            inMassOrder(setlist.items).flatMap((item) => {
                const song = songs.get(item.songId);
                const part = MASS_PARTS.find((candidate) => candidate.id === item.part)?.name;

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
            ...(rows > 0 ? [action('printer', 'Imprimir con acordes', () => print('chords')), action('printer', 'Imprimir solo la letra', () => print('lyrics'))] : []),
            action('trash', 'Eliminar listado', () => {
                listSheet.close(() => {
                    if (confirm(`¿Eliminar “${setlist.title}”? No se puede deshacer.`)) {
                        leaving = true;
                        void app.setlists.remove(setlist.id).then(() => navigate(paths.lists()));
                    }
                });
            }, { danger: true }),
        );
    };
    more.addEventListener('click', listSheet.open);

    /** The item whose "⋯" is open */
    let target: string | null = null;
    const fillSongSheet = (focus?: 'up' | 'down'): void => {
        const item = setlist.items.find((candidate) => candidate.id === target);
        if (item === undefined) {
            // Removed (here or on another device) while its sheet was open
            songSheet.close();

            return;
        }
        const song = songs.get(item.songId);
        const name = song?.title ?? 'Canto eliminado';
        const partName = MASS_PARTS.find((candidate) => candidate.id === item.part)?.name ?? 'Otra parte';
        const can = moveOptions(setlist.items, item.id);
        const step = (direction: -1 | 1): void => {
            void app.setlists.moveItem(setlist.id, item.id, direction).catch((failure: unknown) => fail(failure, 'No se pudo mover el canto.'));
        };
        songSheet.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, name),
            h('p', { class: 'sheet__sub' }, partName),
            ...(song === undefined ? [] : [action('play', 'Cantar desde aquí', () => {
                const at = positionInMass(setlist.items, item.id);
                songSheet.close(() => navigate(paths.perform(setlist.id, at)));
            }, { hint: 'Ahí se cambia el tono' })]),
            // Only the moves that can happen: a part with one song has none
            ...(can.up ? [action('arrow-up', 'Subir en esta parte', () => step(-1), { key: 'up' })] : []),
            ...(can.down ? [action('arrow-down', 'Bajar en esta parte', () => step(1), { key: 'down' })] : []),
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
                ?? songSheet.body.querySelector<HTMLElement>('[data-key="up"], [data-key="down"]');
            kept?.focus();
        }
    };
    const openSongSheet = (itemId: string): void => {
        target = itemId;
        songSheet.open();
    };
    // A move keeps the sheet open (to move again): it is refreshed with the new list, keeping the focus on a move
    let lastMove: 'up' | 'down' | undefined;
    const refreshSongSheet = (): void => {
        if (songSheet.isOpen()) {
            const focus = lastMove;
            lastMove = undefined;
            fillSongSheet(focus);
        }
    };

    // --- the slots ---
    const draw = (): void => {
        const focused = document.activeElement?.getAttribute('data-focus') ?? null;
        const rows = inMassOrder(setlist.items);
        const known = MASS_PARTS.map((part) => slot(part));
        const strays = rows.filter((item) => partIndex(item.part) === MASS_PARTS.length);
        slots.replaceChildren(...known, ...(strays.length > 0 ? [strangers(strays)] : []));
        count.textContent = rows.length === 1 ? '1 canto' : `${rows.length} cantos`;
        sing.hidden = rows.length === 0;
        if (focused !== null) {
            element.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
        }
    };

    const slot = (part: MassPart): HTMLElement => {
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

    /** Items whose part this version of the app does not know: shown, so they can be removed */
    const strangers = (items: SetlistItem[]): HTMLElement =>
        h(
            'section',
            { class: 'slot' },
            h('div', { class: 'slot__head' }, h('h3', {}, 'Otras partes')),
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
            const elsewhere = otherParts(item, setlist.items);
            if (elsewhere.length > 0) {
                lines.push(h('span', { class: 'item__also', role: 'note' }, `También está en: ${elsewhere.join(', ')}`));
            }
        }
        // The song is not a link here: touching its title does nothing (it is opened by singing from it)
        li.append(h('div', { class: 'item__open' }, ...lines));
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
    function action(name: IconName, label: string, run: () => void, options: { danger?: boolean; hint?: string; key?: 'up' | 'down' } = {}): HTMLElement {
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
        for (const [field, value] of [[title, setlist.title], [day, setlist.eventDate ?? '']] as const) {
            if (document.activeElement !== field && field.value !== value) {
                field.value = value;
            }
        }
        fitTitle();
        dayText.textContent = setlist.eventDate === null ? '＋ Fecha' : shortDay(setlist.eventDate);
    };
    const reload = (): void => {
        void Promise.all([app.setlists.get(setlist.id), songsById(app)]).then(([latest, all]) => {
            if (latest === undefined) {
                // Deleted on another device while it was open
                if (!leaving) {
                    navigate(paths.lists(), { replace: true });
                }

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
            songSheet.release();
            listSheet.release();
            if (leaving) {
                return;
            }
            // What was typed and not yet "changed" (a navigation can come before the blur) is still saved
            const unchanged = title.value === setlist.title && (day.value === '' ? null : day.value) === setlist.eventDate;
            if (!unchanged && title.value.trim() !== '') {
                void saveHeader();
            }
        },
    };
}

/** The names of the other parts of the Mass where the item's song is also placed */
function otherParts(item: SetlistItem, items: readonly SetlistItem[]): string[] {
    const names = new Set<string>();
    for (const other of items) {
        if (other.id !== item.id && other.songId === item.songId) {
            names.add(MASS_PARTS.find((part) => part.id === other.part)?.name ?? 'otra parte');
        }
    }

    return [...names];
}

/** The songs that exist, by id */
async function songsById(app: App): Promise<Map<string, Song>> {
    return new Map((await app.list()).map((song) => [song.id, song]));
}
