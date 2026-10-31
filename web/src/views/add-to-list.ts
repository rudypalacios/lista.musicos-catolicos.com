import type { App } from '../app.ts';
import { splitStarred, visibleParts } from '../data/setlists.ts';
import type { PartDef, Setlist, Song } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { showToast } from '../toast.ts';
import { createSheet, sheetAction, type Sheet } from './sheet.ts';

/** The key the song goes in with: the one on screen, which is said only when it is not the person's own */
export interface AddEntry {
    /** Semitones from the song's own key */
    shift: number;
    /** The name of that key ("Re"), or null when it is the person's own (or the song has no key): nothing is said */
    label: string | null;
}

export interface AddToListOptions {
    app: App;
    song: Pick<Song, 'id' | 'title'>;
    /** Asked at the moment of adding, so it is the key on screen then */
    entry: () => AddEntry;
    /** The back arrow of the first step: where the person came from (the song's options) */
    onBack: () => void;
}

/** What a section says at its right: that the song is already there, how many songs it holds, or that it is optional */
export function partNote(part: Pick<PartDef, 'optional'>, count: number, hasSong: boolean): string {
    if (hasSong) {
        return 'Ya está aquí';
    }
    if (count > 0) {
        return count === 1 ? '1 canto' : `${count} cantos`;
    }

    return part.optional === true ? 'opcional' : '';
}

/**
 * "Agregar a un listado" from the page of a song: one sheet in two steps, the list and then the section of that
 * list (each list has its own). Touching the section adds the song at its end (in the key on screen), closes the
 * sheet and says where it went; the person stays on the song.
 */
export function createAddToList(options: AddToListOptions): Sheet {
    const { app, song } = options;
    const sheet = createSheet('Agregar a un listado', () => showLists());
    sheet.element.classList.add('sheet-layer--window');
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
        error.hidden = false;
    };

    const head = (title: string, subtitle: string, back: () => void): HTMLElement => {
        const button = h('button', { type: 'button', class: 'sheet__back', 'aria-label': 'Volver' }, icon('arrow-left', 20));
        button.addEventListener('click', back);

        return h('div', { class: 'sheet__head' }, button, h('div', {}, h('h4', { class: 'sheet__title' }, title), h('p', { class: 'sheet__sub' }, subtitle)));
    };
    const row = (title: string, detail: Array<string | Node>, note: string | null, run: () => void): HTMLElement => {
        const button = h('button', { type: 'button', class: 'lrow__link lrow__pick' },
            h('span', { class: 'lrow__title' }, title), ...(detail.length === 0 ? [] : [h('span', { class: 'lrow__detail' }, ...detail)]));
        button.addEventListener('click', run);

        return h('li', { class: 'lrow' }, button, ...(note === null ? [icon('chevron-right', 18)] : [h('span', { class: note === 'Ya está aquí' ? 'lrow__here' : 'lrow__detail' }, note)]));
    };

    // --- step 1: the list ---
    const showLists = (): void => {
        error.hidden = true;
        sheet.body.replaceChildren(head('Agregar a un listado', song.title, () => sheet.close(options.onBack)), h('p', { class: 'lrow__detail' }, 'Un momento…'));
        app.setlists.list().then((all) => {
            const { starred, others } = splitStarred(all);
            const group = (label: string | null, lists: readonly Setlist[]): HTMLElement[] => lists.length === 0 ? [] : [
                h('section', { class: 'lgroup' },
                    ...(label === null ? [] : [h('h3', { class: 'lgroup__label' }, label)]),
                    h('ul', { class: 'lrows' }, ...lists.map((list) => row(
                        list.title,
                        [list.items.length === 1 ? '1 canto' : `${list.items.length} cantos`, ...(list.starred ? [' ', icon('star-filled', 14), h('span', { class: 'sr-only' }, 'Destacado')] : [])],
                        null,
                        () => showParts(list),
                    )))),
            ];
            sheet.body.replaceChildren(
                head('Agregar a un listado', song.title, () => sheet.close(options.onBack)),
                error,
                ...(starred.length === 0 ? group(null, others) : [...group('Destacados', starred), ...group('Recientes', others)]),
                // Last, set apart: a list for today, and straight on to its part
                sheetAction('plus', 'Nuevo listado', () => {
                    error.hidden = true;
                    app.setlists.create().then(showParts).catch((failure: unknown) => fail(failure, 'No se pudo crear el listado.'));
                }, { apart: true }),
            );
        }).catch((failure: unknown) => fail(failure, 'No se pudieron leer los listados.'));
    };

    // --- step 2: the part ---
    const showParts = (list: Setlist): void => {
        error.hidden = true;
        const { label } = options.entry();
        sheet.body.replaceChildren(
            head('¿En qué sección?', list.title, showLists),
            ...(label === null ? [] : [h('p', { class: 'sheet__entry' }, `Entra en ${label} (el tono que ves)`)]),
            error,
            h('ul', { class: 'lrows' }, ...visibleParts(list).map((part) => {
                const here = list.items.filter((item) => item.part === part.id);

                return row(part.name, [], partNote(part, here.length, here.some((item) => item.songId === song.id)), () => place(list, part));
            })),
        );
    };

    const place = (list: Setlist, part: PartDef): void => {
        const { shift, label } = options.entry();
        app.setlists.addItem(list.id, part.id, song.id, shift).then(() => {
            sheet.close();
            showToast(`«${song.title}» agregado a ${part.name} de «${list.title}»${label === null ? '' : `, en ${label}`}`, 5000, true);
        }).catch((failure: unknown) => fail(failure, 'No se pudo agregar el canto.'));
    };

    return sheet;
}
