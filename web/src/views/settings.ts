import { transpose, type Notation } from '../chordpro/chord.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { h, setSheet } from '../dom.ts';
import type { ColumnMode } from '../fit.ts';
import { readColumns, readFit, readMode, readNotation, saveColumns, saveFit, saveLyricColor, saveMode, saveNotation, type Mode } from '../prefs.ts';
import { applyLyricColor, chosenLyricColor, LYRIC_COLORS } from '../settings.ts';
import { showToast } from '../toast.ts';
import type { View } from './types.ts';

/** Invented lyrics: enough to see the colour and the notation */
const SAMPLE = '[C]Abrimos la [G]puerta de [Am]casa\n[F]Entra, her[G]mano, ven';

/**
 * The settings of this device: how chords are named, the colour of the lyrics, whether the
 * song fits the screen, how many columns, and how a list is sung. They live on the device (a
 * tablet on a stand wants other things than a phone) and apply at once.
 */
export function settingsView(): View {
    const saved = (): void => void showToast('Ajuste guardado en este dispositivo');

    /** A group of radio buttons that saves the chosen value as soon as it changes */
    const choice = <T extends string>(
        name: string,
        legend: string,
        current: T,
        options: readonly { value: T; label: string; swatch?: string | null }[],
        save: (value: T) => void,
    ): HTMLElement => {
        const set = h('fieldset', { class: 'choice' }, h('legend', {}, legend));
        for (const option of options) {
            const input = h('input', { type: 'radio', name, value: option.value });
            input.checked = option.value === current;
            input.addEventListener('change', () => {
                save(option.value);
                saved();
            });
            const label = h('label', { class: 'choice__option' }, input);
            if (option.swatch !== undefined) {
                label.append(h('span', { class: 'swatch', style: `background:${option.swatch ?? 'var(--text)'}`, 'aria-hidden': 'true' }));
            }
            label.append(option.label);
            set.append(label);
        }

        return set;
    };

    const sample = h('div', { class: 'song-sheet settings__sample', 'aria-label': 'Ejemplo' });
    const chords: HTMLElement[] = [];
    const drawSample = (notation: Notation): void => {
        for (const chord of chords) {
            chord.textContent = transpose(chord.dataset['chord'] ?? '', 0, notation);
        }
    };
    setSheet(sample, sheetHtml(parse(SAMPLE)));
    chords.push(...Array.from(sample.querySelectorAll<HTMLElement>('.ch[data-chord]')));
    drawSample(readNotation());

    const fit = h('input', { type: 'checkbox', id: 'setting-fit' });
    fit.checked = readFit();
    fit.addEventListener('change', () => {
        saveFit(fit.checked);
        saved();
    });

    const element = h(
        'div',
        { class: 'page settings' },
        h('h2', {}, 'Ajustes'),
        h('p', { class: 'muted' }, 'Se guardan en este dispositivo y se aplican al momento.'),
        sample,
        choice<Notation>('notation', 'Nombre de los acordes', readNotation(), [
            { value: 'latin', label: 'Do, Re, Mi' },
            { value: 'english', label: 'C, D, E' },
        ], (value) => {
            saveNotation(value);
            drawSample(value);
        }),
        choice<string>('color', 'Color de la letra', chosenLyricColor().id, LYRIC_COLORS.map((color) => ({
            value: color.id, label: color.label, swatch: color.value,
        })), (id) => {
            saveLyricColor(id);
            applyLyricColor();
        }),
        h('div', { class: 'choice' }, h('label', { class: 'choice__option', for: 'setting-fit' }, fit, 'Ajustar la letra a la pantalla')),
        choice<ColumnMode>('columns', 'Columnas en pantallas anchas', readColumns(), [
            { value: 'auto', label: 'Automático (las que necesite el canto)' },
            { value: 'one', label: 'Siempre una' },
            { value: 'two', label: 'Siempre dos' },
        ], saveColumns),
        choice<Mode>('mode', 'Al cantar un listado', readMode(), [
            { value: 'event', label: 'Modo evento: herramientas mínimas y más espacio para la letra' },
            { value: 'rehearsal', label: 'Modo ensayo: todas las herramientas y notas' },
        ], saveMode),
    );

    return { element };
}
