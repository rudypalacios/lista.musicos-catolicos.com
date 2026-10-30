import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { showToast } from '../toast.ts';
import type { Reader } from './reader.ts';

/** Somewhere the key on screen can be saved to */
export interface ToneDestination {
    /** What the menu says ("En este listado", "Como mi tono"…) */
    label: string;
    /** Writes the key. A rejection is shown by the caller. */
    save: (shift: number) => Promise<void>;
}

export interface ToneControlOptions {
    /** The reader whose song this changes */
    reader: Pick<Reader, 'shift' | 'setShift' | 'keyName'>;
    /** The key the control compares with, in semitones from the song's own: the list's, or the person's own on the song page */
    saved: () => number;
    /** What the line under the control calls it: "Listado" or "Mío" */
    savedName: string;
    /** The person's own key, when `saved` is something else (a list): shown in the line under the control when it is not the written one */
    mine?: () => number;
    /** What the hint beside a change says: "Solo hoy" in a list, "Solo por ahora" on the song page */
    hint: string;
    /** What the main button says when there is a change ("Guardar", "Guardar como mi tono") */
    primaryLabel: string;
    /** The first is what the main button does at first; with more than one, an arrow opens the menu where another can be marked */
    destinations: readonly ToneDestination[];
    /** Where the room is short (the song page): the line under the control shows only while there is a change */
    compact?: boolean;
}

export interface ToneControl {
    element: HTMLElement;
    /** Draws it again from the reader and the list: call it whenever either changes */
    refresh: () => void;
}

/** "+2" for a song that has no key to name */
const signed = (shift: number): string => (shift > 0 ? `+${shift}` : String(shift));

/**
 * The key of a song: − and + move it for now only (nothing is written), and "Guardar" leaves it
 * somewhere: in a list, that is the list; the arrow's menu marks what "Guardar" does (the list, the person's own key,
 * both, or "solo hoy", which writes nowhere), and "Guardar" always does what is marked. Under it,
 * where the key comes from (the song's own, the person's, the list's); the saved one is a button
 * back to it while there is a change.
 */
export function createToneControl(options: ToneControlOptions): ToneControl {
    const { reader } = options;
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const down = h('button', { type: 'button', 'aria-label': 'Bajar un semitono' }, icon('minus', 20));
    const up = h('button', { type: 'button', 'aria-label': 'Subir un semitono' }, icon('plus', 20));
    const label = h('span', { class: 'tone-control__key' });
    const step = h('div', { class: 'tone-control__step' }, down, label, up);
    const hint = h('span', { class: 'tone-control__hint' }, options.hint);
    const save = h('button', { type: 'button', class: 'tone-control__save' }, options.primaryLabel);
    const more = h('button', {
        type: 'button', class: 'tone-control__more', 'aria-label': 'Otros sitios donde guardar', 'aria-expanded': 'false',
    }, h('span', { class: 'tone-control__chevron', 'aria-hidden': 'true' }));
    const split = h('div', { class: 'tone-control__split' }, save, ...(options.destinations.length > 1 ? [more] : []));
    const menu = h('div', { class: 'tone-control__menu', hidden: true });
    const references = h('p', { class: 'tone-control__refs' });
    const row = h('div', { class: 'tone-control__row' }, step, split, hint);
    const element = h('div', { class: 'tone-control' }, row, menu, references, live);

    /** What "Guardar" does: a destination, or null for "solo hoy" (nothing is written). Starts on the first destination. */
    let chosen: ToneDestination | null = options.destinations[0] ?? null;
    const nameOf = (shift: number): string => reader.keyName(shift) ?? signed(shift);
    let spoken = '';

    const closeMenu = (): void => {
        menu.hidden = true;
        more.setAttribute('aria-expanded', 'false');
    };
    const run = (destination: ToneDestination, button: HTMLButtonElement): void => {
        button.disabled = true;
        closeMenu();
        destination.save(reader.shift()).finally(() => {
            button.disabled = false;
            refresh();
        }).catch(() => undefined);
    };
    const fillMenu = (): void => {
        const entry = (text: string, destination: ToneDestination | null): HTMLElement => {
            const marked = destination === chosen;
            const option = h('button', { type: 'button', class: `tone-control__option${marked ? ' is-current' : ''}`, ...(marked ? { 'aria-current': 'true' } : {}) },
                h('span', {}, text), ...(marked ? [h('span', { class: 'tone-control__check', 'aria-hidden': 'true' })] : []));
            // Marks it: nothing is written until "Guardar"
            option.addEventListener('click', () => {
                chosen = destination;
                closeMenu();
                fillMenu();
                more.focus({ preventScroll: true });
            });

            return option;
        };
        menu.replaceChildren(entry(options.hint, null), ...options.destinations.map((destination) => entry(destination.label, destination)));
    };

    function refresh(): void {
        const shift = reader.shift();
        const saved = options.saved();
        const changed = shift !== saved;
        label.textContent = nameOf(shift);
        step.classList.toggle('is-changed', changed);
        split.hidden = !changed;
        hint.hidden = !changed;
        if (!changed) {
            closeMenu();
            // Whatever was marked is forgotten with the change: the next one starts on the first destination again
            if (chosen !== (options.destinations[0] ?? null)) {
                chosen = options.destinations[0] ?? null;
                fillMenu();
            }
        }
        const own = reader.keyName(0);
        references.replaceChildren();
        references.hidden = own === null || (options.compact === true && !changed);
        if (own !== null) {
            references.append('Original ', h('b', {}, own));
            const mine = options.mine?.() ?? 0;
            if (mine !== 0) {
                references.append(' · Mío ', h('b', {}, nameOf(mine)));
            }
            references.append(` · ${options.savedName} `);
            if (changed) {
                const back = h('button', {
                    type: 'button', class: 'tone-control__back', 'aria-label': `Volver al tono ${options.savedName === 'Mío' ? 'mío' : 'del listado'}, ${nameOf(saved)}`,
                }, nameOf(saved));
                back.addEventListener('click', () => reader.setShift(saved));
                references.append(back);
            } else {
                references.append(h('b', {}, nameOf(saved)));
            }
        }
        const announce = changed ? `Tono ${nameOf(shift)}, ${options.hint.toLowerCase()}` : `Tono ${nameOf(shift)}`;
        if (announce !== spoken) {
            spoken = announce;
            live.textContent = announce;
        }
    }

    down.addEventListener('click', () => reader.setShift(reader.shift() - 1));
    up.addEventListener('click', () => reader.setShift(reader.shift() + 1));
    save.addEventListener('click', () => {
        if (chosen === null) {
            // "Solo hoy" is marked: the key stays as it is and nothing is written
            showToast('Queda solo para hoy', 3500, true);
        } else {
            run(chosen, save);
        }
    });
    more.addEventListener('click', () => {
        const opening = menu.hidden;
        menu.hidden = !opening;
        more.setAttribute('aria-expanded', String(opening));
    });
    fillMenu();
    refresh();

    return { element, refresh };
}
