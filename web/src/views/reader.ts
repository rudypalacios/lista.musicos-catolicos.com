import { transpose, type Notation } from '../chordpro/chord.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import type { Song } from '../data/types.ts';
import { h, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { clearFit, DEFAULT_LIMITS, fitToStage, isWide, type ColumnMode } from '../fit.ts';
import { readColumns, readFit, readLyricSize, readNotation, saveColumns, saveFit, saveLyricSize, saveNotation, type SizeScope } from '../prefs.ts';

const SIZE_MIN = -2;
const SIZE_MAX = 4;

export interface ReaderOptions {
    /** Whose lyric size this is: the library's songs or the lists being sung (each is kept apart) */
    sizeScope: SizeScope;
    /** The key to start in, in semitones from the song's own (−11…11) */
    shift: number;
    /** The person changed the key; `shift` is the new one. Where it is kept is up to the caller. */
    onShift: (shift: number) => void;
    /**
     * The key on screen changed (or was drawn for the first time): `key` is its name in the notation
     * shown, or null when the song has none. For whoever shows the key somewhere else too.
     */
    onKey?: (key: string | null) => void;
    /** Draw the key as a "Tono Do" pill in the head of the song (default). The song page shows it in its key control instead. */
    keyPill?: boolean;
    /** Draw the title and the author at the head of the song (default). Singing says them in its bar and leaves the room to the lyrics. */
    songHead?: boolean;
}

/** Columns button: auto → two → one → auto */
const NEXT_COLUMNS: Readonly<Record<ColumnMode, ColumnMode>> = { auto: 'two', two: 'one', one: 'auto' };
const COLUMNS_LABEL: Readonly<Record<ColumnMode, string>> = { auto: 'Columnas: auto', two: 'Columnas: 2', one: 'Columnas: 1' };

export interface Reader {
    /** Notation, lyrics size, fit and columns (the key is changed with `setShift`): `size` and `display` together */
    toolbar: HTMLElement;
    /** A− / A+ alone, for a screen that keeps them in view; it works the same when taken out of `toolbar` */
    size: HTMLElement;
    /** Notation, fit and columns, for a screen that keeps them in a sheet; it works the same when taken out of `toolbar` */
    display: HTMLElement;
    /** The key on screen, in semitones from the song's own */
    shift: () => number;
    /** Puts the song in another key, as if the person had pressed − / +: it calls `onShift` when it changes */
    setShift: (next: number) => void;
    /** The name of the key `shift` semitones from the song's own, in the notation shown; null when the song has no key */
    keyName: (shift: number) => string | null;
    /** Where the song is drawn: give it all the space left, it fits the song to it */
    stage: HTMLElement;
    dispose: () => void;
}

/**
 * Reading a song: transposition, Do/C notation, lyrics size and "ajustar a la pantalla", which
 * picks the biggest size at which the whole song fits the screen. Everything is done in the
 * page, so it works offline. The song page and the performing view of a setlist both use it;
 * they differ in where the key is kept (the address, or the item of the list).
 */
export function createReader(song: Song, options: ReaderOptions): Reader {
    const sheetData = parse(song.body);
    const original = songKey(sheetData);

    let t = options.shift;
    let notation: Notation = readNotation();
    let fit = readFit();
    // The size is the device's, not the song's: the next song opens as big as this one was left
    // (in the same place: the library and the lists keep their own)
    let size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, readLyricSize(options.sizeScope)));
    let columns = readColumns();

    // --- the song ---
    const sheet = h('div', { class: 'song-sheet', id: 'song-sheet' });
    setSheet(sheet, sheetHtml(sheetData));
    const chords = Array.from(sheet.querySelectorAll<HTMLElement>('.ch[data-chord]'));

    const keyChip = h('span', { class: 'chip' });
    const head = h('header', { class: 'song-head' });
    if (options.songHead !== false) {
        head.append(h('h2', {}, song.title));
        if (song.author !== '') {
            head.append(h('p', { class: 'by' }, song.author));
        }
    }
    const meta = h('div', { class: 'meta' }, ...(options.keyPill === false ? [] : [keyChip]));
    const labels: [string, string][] = [['capo', 'Capo'], ['tempo', 'Tempo'], ['time', 'Compás']];
    for (const [name, label] of labels) {
        const value = sheetData.meta[name];
        if (value !== undefined) {
            meta.append(h('span', { class: 'chip' }, `${label} ${value}`));
        }
    }
    if (meta.childElementCount > 0) {
        head.append(meta);
    }
    // Without the visible head the title is still the heading of the screen, for a screen reader
    const content = h('div', { class: 'viewer-content', id: 'song-content' },
        ...(options.songHead === false ? [h('h2', { class: 'sr-only' }, song.title)] : []),
        ...(head.childElementCount > 0 ? [head] : []), sheet);
    const stage = h('div', { class: 'stage', id: 'stage' }, content);

    // --- the toolbar ---
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const notationButton = h('button', { type: 'button', 'data-notation': true });
    const smaller = h('button', { type: 'button', 'aria-label': 'Letra más pequeña', 'data-size': '-1' }, 'A', icon('minus', 14));
    const bigger = h('button', { type: 'button', 'aria-label': 'Letra más grande', 'data-size': '1' }, 'A', icon('plus', 14));
    const fitButton = h('button', { type: 'button', 'data-fit': true }, 'Ajustar');
    const columnsButton = h('button', { type: 'button', 'data-columns': true });
    const sizeGroup = h('div', { class: 'group' }, smaller, bigger);
    const extra = h(
        'div',
        { class: 'toolbar__extra' },
        h('div', { class: 'group' }, notationButton),
        h('div', { class: 'group' }, fitButton, columnsButton),
    );
    const toolbar = h(
        'div',
        { class: 'toolbar', role: 'toolbar', 'aria-label': 'Herramientas de la letra' },
        sizeGroup,
        extra,
        live,
    );

    const refit = (): void => {
        const wide = isWide(stage);
        columnsButton.hidden = !wide;
        if (fit) {
            const { layout, size: fitted } = fitToStage(stage, content, DEFAULT_LIMITS, columns);
            content.style.removeProperty('--lyric-step');
            // A− / A+ nudge the size the fit chose; bigger than the fit no longer fits, so it scrolls
            if (size !== 0) {
                content.style.setProperty('--lyric-size', `${Math.max(10, fitted + size * 2)}px`);
            }
            const overflowing = size > 0;
            content.classList.toggle('is-scroll', overflowing || layout === 'scroll');
            stage.classList.toggle('is-scroll-stage', overflowing || layout === 'scroll');
        } else {
            clearFit(content);
            stage.classList.add('is-scroll-stage');
            content.style.setProperty('--lyric-step', String(size));
            if (columns === 'two' && wide) {
                // Balanced columns that scroll: there is no fixed height to fill them against
                content.classList.add('is-columns', 'is-scroll');
            }
        }
    };

    const update = (): void => {
        for (const chord of chords) {
            chord.textContent = transpose(chord.dataset['chord'] ?? '', t, notation);
        }
        if (original !== null) {
            const current = transpose(original, t, notation);
            const announce = keyChip.textContent !== `Tono ${current}`;
            keyChip.textContent = `Tono ${current}`;
            options.onKey?.(current);
            if (announce) {
                live.textContent = `Tono: ${current}`;
            }
        } else {
            options.onKey?.(null);
            keyChip.hidden = true;
        }
        // "Do → C": the arrow is drawn, so it is the same on every device
        const [from, to] = notation === 'latin' ? ['Do', 'C'] : ['C', 'Do'];
        notationButton.replaceChildren(from, icon('arrow-right', 14), to);
        notationButton.setAttribute('aria-label', `Cambiar la notación de ${from} a ${to}`);
        notationButton.setAttribute('aria-pressed', String(notation === 'english'));
        smaller.setAttribute('aria-disabled', String(size <= SIZE_MIN));
        bigger.setAttribute('aria-disabled', String(size >= SIZE_MAX));
        fitButton.setAttribute('aria-pressed', String(fit));
        columnsButton.textContent = COLUMNS_LABEL[columns];
        columnsButton.setAttribute('aria-label', `${COLUMNS_LABEL[columns]}. Cambiar`);
        refit();
    };

    const press = (button: HTMLElement): void => {
        if (button.getAttribute('aria-disabled') === 'true') {
            return;
        }
        const before = t;
        if (button.dataset['notation'] !== undefined) {
            notation = notation === 'latin' ? 'english' : 'latin';
            saveNotation(notation);
        } else if (button.dataset['size'] !== undefined) {
            size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, size + parseInt(button.dataset['size'], 10)));
            saveLyricSize(options.sizeScope, size);
        } else if (button.dataset['fit'] !== undefined) {
            fit = !fit;
            saveFit(fit);
        } else if (button.dataset['columns'] !== undefined) {
            columns = NEXT_COLUMNS[columns];
            saveColumns(columns);
        }
        update();
        if (t !== before) {
            options.onShift(t);
        }
    };
    // On the two parts, not on `toolbar`: a screen may take either out of it
    for (const part of [sizeGroup, extra]) {
        part.addEventListener('click', (event) => {
            const button = (event.target as HTMLElement).closest('button');
            if (button !== null) {
                press(button);
            }
        });
    }

    // The screen changes size (rotating the tablet, a keyboard, a split view): fit again
    let frame = 0;
    const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(refit);
    });
    observer.observe(stage);

    update();
    // Fonts and layout settle after the first paint
    requestAnimationFrame(refit);

    return {
        toolbar,
        size: sizeGroup,
        display: extra,
        shift: () => t,
        setShift: (next) => {
            const before = t;
            t = next % 12;
            update();
            if (t !== before) {
                options.onShift(t);
            }
        },
        keyName: (shift) => (original === null ? null : transpose(original, shift, notation)),
        stage,
        dispose: () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        },
    };
}
