import { transpose, type Notation } from '../chordpro/chord.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import type { Song } from '../data/types.ts';
import { h, setSheet } from '../dom.ts';
import { clearFit, DEFAULT_LIMITS, fitToStage, isWide, type ColumnMode } from '../fit.ts';
import { readColumns, readFit, readNotation, saveColumns, saveFit, saveNotation } from '../prefs.ts';

const SIZE_MIN = -2;
const SIZE_MAX = 4;

export interface ReaderOptions {
    /** The key to start in, in semitones from the song's own (−11…11) */
    shift: number;
    /** The person changed the key; `shift` is the new one. Where it is kept is up to the caller. */
    onShift: (shift: number) => void;
    /**
     * Only the quick tools (key, lyric size) in view; notation, fit and columns behind a "⋯"
     * button. For singing at an event, where the lyrics need the room.
     */
    compact?: boolean;
}

/** Columns button: auto → two → one → auto */
const NEXT_COLUMNS: Readonly<Record<ColumnMode, ColumnMode>> = { auto: 'two', two: 'one', one: 'auto' };
const COLUMNS_LABEL: Readonly<Record<ColumnMode, string>> = { auto: 'Columnas: auto', two: 'Columnas: 2', one: 'Columnas: 1' };

export interface Reader {
    /** Key, notation, lyrics size and fit */
    toolbar: HTMLElement;
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
    let size = 0;
    let columns = readColumns();

    // --- the song ---
    const sheet = h('div', { class: 'song-sheet', id: 'song-sheet' });
    setSheet(sheet, sheetHtml(sheetData));
    const chords = Array.from(sheet.querySelectorAll<HTMLElement>('.ch[data-chord]'));

    const keyChip = h('span', { class: 'chip' });
    const head = h('header', { class: 'song-head' }, h('h2', {}, song.title));
    if (song.author !== '') {
        head.append(h('p', { class: 'by' }, song.author));
    }
    const meta = h('div', { class: 'meta' }, keyChip);
    const labels: [string, string][] = [['capo', 'Capo'], ['tempo', 'Tempo'], ['time', 'Compás']];
    for (const [name, label] of labels) {
        const value = sheetData.meta[name];
        if (value !== undefined) {
            meta.append(h('span', { class: 'chip' }, `${label} ${value}`));
        }
    }
    head.append(meta);
    const content = h('div', { class: 'viewer-content', id: 'song-content' }, head, sheet);
    const stage = h('div', { class: 'stage', id: 'stage' }, content);

    // --- the toolbar ---
    const down = h('button', { type: 'button', 'aria-label': 'Bajar un semitono', 'data-transpose': '-1' }, '−');
    const up = h('button', { type: 'button', 'aria-label': 'Subir un semitono', 'data-transpose': '1' }, '+');
    const keyButton = h('button', { type: 'button', class: 'key', 'data-key-button': true });
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const notationButton = h('button', { type: 'button', 'data-notation': true });
    const smaller = h('button', { type: 'button', 'aria-label': 'Letra más pequeña', 'data-size': '-1' }, 'A−');
    const bigger = h('button', { type: 'button', 'aria-label': 'Letra más grande', 'data-size': '1' }, 'A+');
    const fitButton = h('button', { type: 'button', 'data-fit': true }, 'Ajustar');
    const columnsButton = h('button', { type: 'button', 'data-columns': true });
    const more = h('button', {
        type: 'button', 'data-more': true, 'aria-label': 'Más herramientas', 'aria-expanded': 'false',
    }, '⋯');
    const compact = options.compact === true;
    const extra = h(
        'div',
        { class: 'toolbar__extra', hidden: compact },
        h('div', { class: 'group' }, notationButton),
        h('div', { class: 'group' }, fitButton, columnsButton),
    );
    const toolbar = h(
        'div',
        { class: 'toolbar', role: 'toolbar', 'aria-label': 'Herramientas de la letra' },
        h('div', { class: 'group' }, down, keyButton, up),
        h('div', { class: 'group' }, smaller, bigger),
        ...(compact ? [h('div', { class: 'group' }, more)] : []),
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
            keyButton.textContent = t === 0 ? current : `${current} ↺`;
            keyButton.classList.toggle('is-changed', t !== 0);
            keyButton.setAttribute('aria-label', t === 0
                ? `Tono: ${current}`
                : `Tono: ${current}. Volver al tono original, ${transpose(original, 0, notation)}`);
            if (announce) {
                live.textContent = `Tono: ${current}`;
            }
        } else {
            keyChip.hidden = true;
            keyButton.textContent = t === 0 ? 'Tono' : `${t > 0 ? '+' : ''}${t} ↺`;
        }
        notationButton.textContent = notation === 'latin' ? 'Do → C' : 'C → Do';
        notationButton.setAttribute('aria-pressed', String(notation === 'english'));
        smaller.setAttribute('aria-disabled', String(size <= SIZE_MIN));
        bigger.setAttribute('aria-disabled', String(size >= SIZE_MAX));
        fitButton.setAttribute('aria-pressed', String(fit));
        columnsButton.textContent = COLUMNS_LABEL[columns];
        columnsButton.setAttribute('aria-label', `${COLUMNS_LABEL[columns]}. Cambiar`);
        refit();
    };

    toolbar.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest('button');
        if (button === null || button.getAttribute('aria-disabled') === 'true') {
            return;
        }
        const before = t;
        if (button.dataset['transpose'] !== undefined) {
            t = (t + parseInt(button.dataset['transpose'], 10)) % 12;
        } else if (button.dataset['keyButton'] !== undefined) {
            t = 0;
        } else if (button.dataset['notation'] !== undefined) {
            notation = notation === 'latin' ? 'english' : 'latin';
            saveNotation(notation);
        } else if (button.dataset['size'] !== undefined) {
            size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, size + parseInt(button.dataset['size'], 10)));
        } else if (button.dataset['fit'] !== undefined) {
            fit = !fit;
            saveFit(fit);
        } else if (button.dataset['columns'] !== undefined) {
            columns = NEXT_COLUMNS[columns];
            saveColumns(columns);
        } else if (button.dataset['more'] !== undefined) {
            extra.hidden = !extra.hidden;
            more.setAttribute('aria-expanded', String(!extra.hidden));
        }
        update();
        if (t !== before) {
            options.onShift(t);
        }
    });

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
        stage,
        dispose: () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        },
    };
}
