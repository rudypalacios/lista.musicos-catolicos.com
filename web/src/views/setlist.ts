import type { App } from '../app.ts';
import { transpose } from '../chordpro/chord.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { LIMITS, type Setlist, type SetlistItem, type Song } from '../data/types.ts';
import { inMassOrder, itemsOfPart, partIndex } from '../data/setlists.ts';
import { h, link } from '../dom.ts';
import { MASS_PARTS, type MassPart } from '../mass.ts';
import { planSheet } from '../print/plan.ts';
import { readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { printMenu } from './print-menu.ts';
import type { Navigate, View } from './types.ts';

/**
 * One setlist: its title, day and notes, and the template of the Mass with a slot for every
 * part. Each slot holds one or more songs; each song can be moved within its slot, put in
 * another key (for this list only, the song itself is not changed), given a note or removed.
 */
export async function setlistView(app: App, navigate: Navigate, initial: Setlist): Promise<View> {
    let setlist = initial;
    let songs = await songsById(app);
    /** Parts whose explanation (ⓘ) is open: it must stay open when the list is redrawn */
    const explained = new Set<string>();
    /** Notes typed and not saved yet, by item id: saving waits for the end of the typing */
    const unsaved = new Map<string, () => Promise<unknown>>();

    // --- the header: title, day, notes ---
    const title = h('input', { id: 'title', type: 'text', autocomplete: 'off', maxlength: String(LIMITS.title) });
    const day = h('input', { id: 'day', type: 'date' });
    const notes = h('textarea', { id: 'notes', rows: '2', maxlength: String(LIMITS.notes) });
    const error = h('p', { class: 'error', role: 'alert' });
    const sing = h('a', { class: 'button button--primary', 'data-link': true, href: paths.perform(setlist.id, 1) }, 'Cantar');
    const count = h('span', { class: 'muted' });
    const print = printMenu((version, notation) =>
        inMassOrder(setlist.items).flatMap((item) => {
            const song = songs.get(item.songId);
            const part = MASS_PARTS.find((candidate) => candidate.id === item.part)?.name;

            return song === undefined ? [] : [planSheet(song, { version, shift: item.transpose, notation, ...(part !== undefined ? { part } : {}) })];
        }));
    const remove = h('button', { type: 'button', class: 'button button--danger' }, 'Eliminar listado');
    const slots = h('div', { class: 'slots' });

    const header = h(
        'div',
        { class: 'form' },
        h('label', { for: 'title' }, 'Título'),
        title,
        h('label', { for: 'day' }, 'Fecha de la misa'),
        day,
        h('label', { for: 'notes' }, 'Notas del listado'),
        notes,
    );
    const element = h(
        'div',
        { class: 'page' },
        h('div', { class: 'actions' }, link(paths.lists(), '← Listados', 'button')),
        header,
        error,
        h('div', { class: 'actions' }, sing, print, count, remove),
        slots,
    );

    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
    };

    const saveHeader = (): Promise<unknown> => {
        error.textContent = '';

        return app.setlists
            .update(setlist.id, { title: title.value, eventDate: day.value === '' ? null : day.value, notes: notes.value })
            .catch((failure: unknown) => fail(failure, 'No se pudo guardar el listado.'));
    };
    for (const field of [title, day, notes]) {
        field.addEventListener('change', () => void saveHeader());
    }

    /** This screen is deleting its own list: it leaves by itself, once */
    let leaving = false;
    remove.addEventListener('click', () => {
        if (confirm(`¿Eliminar “${setlist.title}”? No se puede deshacer.`)) {
            leaving = true;
            void app.setlists.remove(setlist.id).then(() => navigate(paths.lists()));
        }
    });

    // --- the slots ---
    const draw = (): void => {
        const focused = document.activeElement?.getAttribute('data-focus') ?? null;
        const rows = inMassOrder(setlist.items);
        const known = MASS_PARTS.map((part) => slot(part));
        const strays = rows.filter((item) => partIndex(item.part) === MASS_PARTS.length);
        slots.replaceChildren(...known, ...(strays.length > 0 ? [strangers(strays)] : []));
        count.textContent = rows.length === 1 ? '1 canto' : `${rows.length} cantos`;
        sing.hidden = rows.length === 0;
        print.hidden = rows.length === 0;
        if (focused !== null) {
            slots.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
        }
    };

    const slot = (part: MassPart): HTMLElement => {
        const head = h('div', { class: 'slot__head' }, h('h3', {}, part.name));
        if (part.optional === true) {
            head.append(h('span', { class: 'badge' }, 'opcional'));
        }
        const section = h('section', { class: 'slot', 'data-part': part.id }, head);
        if (part.note !== undefined) {
            const note = h('p', { class: 'slot__note', hidden: !explained.has(part.id) }, part.note);
            const info = h('button', {
                type: 'button', class: 'info', title: part.note, 'aria-label': `Qué es esto: ${part.name}`,
                'aria-expanded': String(explained.has(part.id)), 'data-focus': `info:${part.id}`,
            }, 'ⓘ');
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
        const items = itemsOfPart(setlist.items, part.id);
        if (items.length > 0) {
            section.append(h('ul', { class: 'items' }, ...items.map((item, index) => row(item, index, items.length))));
        }
        const add = link(paths.addToSetlist(setlist.id, part.id), 'Agregar canto', 'button');
        add.setAttribute('aria-label', `Agregar canto a ${part.name}`);
        section.append(add);

        return section;
    };

    /** Items whose part this version of the app does not know: shown, so they can be removed */
    const strangers = (items: SetlistItem[]): HTMLElement =>
        h(
            'section',
            { class: 'slot' },
            h('div', { class: 'slot__head' }, h('h3', {}, 'Otras partes')),
            h('ul', { class: 'items' }, ...items.map((item) => row(item, 0, 1))),
        );

    const row = (item: SetlistItem, index: number, total: number): HTMLElement => {
        const song = songs.get(item.songId);
        const li = h('li', { class: 'item' });
        const main = h('div', { class: 'item__main' });
        if (song === undefined) {
            main.append(h('span', { class: 'item__title item__title--gone' }, 'Canto eliminado'));
        } else {
            const suffix = item.transpose === 0 ? '' : `?t=${item.transpose}`;
            main.append(link(paths.view(song.id) + suffix, song.title, 'item__title'));
            if (song.author !== '') {
                main.append(h('span', { class: 'song-item__author' }, song.author));
            }
        }
        li.append(main);

        if (song !== undefined) {
            li.append(keyControls(item, song));
        }

        const note = h('input', {
            type: 'text', class: 'item__note', placeholder: 'Nota (opcional)', value: item.note,
            'aria-label': `Nota para ${song?.title ?? 'este canto'}`, maxlength: String(LIMITS.itemNote), autocomplete: 'off',
        });
        const saveNote = (): Promise<unknown> => {
            unsaved.delete(item.id);

            return app.setlists.setNote(setlist.id, item.id, note.value).catch((failure: unknown) => fail(failure, 'No se pudo guardar la nota.'));
        };
        note.addEventListener('input', () => unsaved.set(item.id, saveNote));
        note.addEventListener('change', () => void saveNote());
        note.addEventListener('blur', () => {
            // Typed and put back as it was: no "change" comes, but the screen must not stay frozen
            if (unsaved.has(item.id) && note.value.trim() === item.note) {
                unsaved.delete(item.id);
                reload();
            }
        });
        li.append(note);

        const tools = h('div', { class: 'item__tools' });
        const move = (label: string, symbol: string, direction: -1 | 1, disabled: boolean): void => {
            const button = h('button', {
                type: 'button', class: 'button', 'aria-label': `${label}: ${song?.title ?? 'canto'}`, disabled,
                'data-focus': `${direction < 0 ? 'up' : 'down'}:${item.id}`,
            }, symbol);
            button.addEventListener('click', () => void app.setlists.moveItem(setlist.id, item.id, direction));
            tools.append(button);
        };
        move('Mover arriba', '↑', -1, index === 0);
        move('Mover abajo', '↓', 1, index === total - 1);
        const quit = h('button', { type: 'button', class: 'button button--danger', 'data-focus': `quit:${item.id}` }, 'Quitar');
        quit.setAttribute('aria-label', `Quitar ${song?.title ?? 'canto eliminado'} del listado`);
        quit.addEventListener('click', () => void app.setlists.removeItem(setlist.id, item.id));
        tools.append(quit);
        li.append(tools);

        return li;
    };

    /** − key + for this use of the song; the middle button goes back to the song's own key */
    const keyControls = (item: SetlistItem, song: Song): HTMLElement => {
        const original = songKey(parse(song.body));
        const changed = item.transpose !== 0;
        const label = original === null
            ? (changed ? `${item.transpose > 0 ? '+' : ''}${item.transpose}` : 'Tono')
            : transpose(original, item.transpose, readNotation());
        const key = h('button', {
            type: 'button', class: changed ? 'key is-changed' : 'key', 'data-focus': `key:${item.id}`,
            'aria-label': changed ? `Tono: ${label}. Volver al tono original` : `Tono: ${label}`,
        }, changed ? `${label} ↺` : label);
        const step = (text: string, aria: string, delta: number, focus: string): HTMLButtonElement => {
            const button = h('button', { type: 'button', 'aria-label': `${aria}: ${song.title}`, 'data-focus': `${focus}:${item.id}` }, text);
            button.addEventListener('click', () => void app.setlists.shiftItem(setlist.id, item.id, delta));

            return button;
        };
        key.addEventListener('click', () => void app.setlists.setTranspose(setlist.id, item.id, 0));

        return h('div', { class: 'toolbar item__key', role: 'group', 'aria-label': 'Tono para este listado' },
            h('div', { class: 'group' }, step('−', 'Bajar un semitono', -1, 'down-key'), key, step('+', 'Subir un semitono', 1, 'up-key')));
    };

    // --- keeping it in step with the store ---
    const fill = (): void => {
        for (const [field, value] of [[title, setlist.title], [day, setlist.eventDate ?? ''], [notes, setlist.notes]] as const) {
            if (document.activeElement !== field && field.value !== value) {
                field.value = value;
            }
        }
    };
    const reload = (): void => {
        // A note being typed would be wiped by a redraw: its own save redraws afterwards
        if (unsaved.size > 0) {
            return;
        }
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
        });
    };
    const stop = app.onData(reload);

    fill();
    draw();

    return {
        element,
        dispose: () => {
            stop();
            if (leaving) {
                return;
            }
            // What was typed and not yet "changed" (a navigation can come before the blur) is still saved
            for (const save of unsaved.values()) {
                void save();
            }
            const unchanged = title.value === setlist.title && notes.value === setlist.notes
                && (day.value === '' ? null : day.value) === setlist.eventDate;
            if (!unchanged && title.value.trim() !== '') {
                void saveHeader();
            }
        },
    };
}

/** The songs that exist, by id */
async function songsById(app: App): Promise<Map<string, Song>> {
    return new Map((await app.list()).map((song) => [song.id, song]));
}
