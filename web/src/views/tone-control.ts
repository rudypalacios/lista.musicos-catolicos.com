import { h } from '../dom.ts';
import type { Reader } from './reader.ts';

export interface ToneControlOptions {
    /** The reader whose song this changes (`externalTone`) */
    reader: Pick<Reader, 'shift' | 'setShift' | 'keyName'>;
    /** The key saved in the list for this use of the song, in semitones from the song's own */
    saved: () => number;
    /** Writes the key on screen to the list. A rejection is shown by the caller. */
    save: (shift: number) => Promise<void>;
}

export interface ToneControl {
    element: HTMLElement;
    /** Draws it again from the reader and the list: call it whenever either changes */
    refresh: () => void;
}

/** "+2" for a song that has no key to name */
const signed = (shift: number): string => (shift > 0 ? `+${shift}` : String(shift));

/**
 * The key of a song in a list: − and + move it for now only ("Solo hoy": nothing is written), and
 * "Guardar" leaves it in the list. Under it, where the key comes from (the song's own, the list's);
 * the list's is a button back to it while there is a change.
 */
export function createToneControl(options: ToneControlOptions): ToneControl {
    const { reader } = options;
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const down = h('button', { type: 'button', 'aria-label': 'Bajar un semitono' }, '−');
    const up = h('button', { type: 'button', 'aria-label': 'Subir un semitono' }, '+');
    const label = h('span', { class: 'tone-control__key' });
    const step = h('div', { class: 'tone-control__step' }, down, label, up);
    const hint = h('span', { class: 'tone-control__hint' }, 'Solo hoy');
    const save = h('button', { type: 'button', class: 'button button--primary tone-control__save' }, 'Guardar');
    const references = h('p', { class: 'tone-control__refs' });
    const row = h('div', { class: 'tone-control__row' }, step, save, hint);
    const element = h('div', { class: 'tone-control' }, row, references, live);

    const nameOf = (shift: number): string => reader.keyName(shift) ?? signed(shift);
    let spoken = '';
    const refresh = (): void => {
        const shift = reader.shift();
        const saved = options.saved();
        const changed = shift !== saved;
        label.textContent = nameOf(shift);
        step.classList.toggle('is-changed', changed);
        save.hidden = !changed;
        hint.hidden = !changed;
        const own = reader.keyName(0);
        references.replaceChildren();
        references.hidden = own === null;
        if (own !== null) {
            references.append('Original ', h('b', {}, own), ' · Listado ');
            if (changed) {
                const back = h('button', { type: 'button', class: 'tone-control__back', 'aria-label': `Volver al tono del listado, ${nameOf(saved)}` }, nameOf(saved));
                back.addEventListener('click', () => reader.setShift(saved));
                references.append(back);
            } else {
                references.append(h('b', {}, nameOf(saved)));
            }
        }
        const announce = changed ? `Tono ${nameOf(shift)}, solo hoy` : `Tono ${nameOf(shift)}`;
        if (announce !== spoken) {
            spoken = announce;
            live.textContent = announce;
        }
    };

    down.addEventListener('click', () => reader.setShift(reader.shift() - 1));
    up.addEventListener('click', () => reader.setShift(reader.shift() + 1));
    save.addEventListener('click', () => {
        save.disabled = true;
        options.save(reader.shift()).finally(() => {
            save.disabled = false;
            refresh();
        }).catch(() => undefined);
    });
    refresh();

    return { element, refresh };
}
