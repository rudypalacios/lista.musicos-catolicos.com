import { transpose, type Notation } from '../chordpro/chord.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { h, link, setSheet } from '../dom.ts';
import type { ColumnMode } from '../fit.ts';
import { readColumns, readFit, readKeepAwake, readNotation, saveColumns, saveFit, saveKeepAwake, saveLyricColor, saveNotation } from '../prefs.ts';
import { applyReadingColors, chosenReadingColors, paintReadingColors, READING_COLORS } from '../settings.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import type { Account, View } from './types.ts';

/** Invented lyrics: enough to see the colour and the notation */
const SAMPLE = '[C]Abrimos la [G]puerta de [Am]casa\n[F]Entra, her[G]mano, ven';

/**
 * The settings of this device: how chords are named, the colours of the lyrics and chords, whether the
 * song fits the screen, how many columns, and whether the screen stays on. They live on the device (a
 * tablet on a stand wants other things than a phone) and apply at once.
 */
export function settingsView(account: Account): View {
    const saved = (): void => void showToast('Ajuste guardado en este dispositivo');

    /** A group of radio buttons that saves the chosen value as soon as it changes */
    const choice = <T extends string>(
        name: string,
        legend: string,
        current: T,
        options: readonly { value: T; label: string }[],
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

    /**
     * The colours: one card per pair, each with a sample drawn in its own colours (a circle of one colour would say
     * nothing about how the chords read against the lyrics), and it saves as soon as it is touched.
     */
    const readingChoice = (): HTMLElement => {
        const set = h('fieldset', { class: 'choice' }, h('legend', {}, 'Colores de lectura'),
            h('p', { class: 'muted' }, 'La letra y los acordes, ya combinados para que se lean bien. En papel siempre salen en negro y rojo.'));
        for (const colors of READING_COLORS) {
            const input = h('input', { type: 'radio', name: 'reading', value: colors.id });
            input.checked = colors.id === chosenReadingColors().id;
            input.addEventListener('change', () => {
                saveLyricColor(colors.id);
                applyReadingColors();
                saved();
            });
            const demo = h('span', { class: 'pair__sample', 'aria-hidden': 'true' },
                h('span', { class: 'pair__chords' }, ...['C', 'G', 'Am'].map((name) => {
                    const chord = h('span', { 'data-chord': name }, name);
                    chords.push(chord);

                    return chord;
                })),
                h('span', { class: 'pair__lyrics' }, 'Abrimos la puerta de casa'));
            paintReadingColors(demo, colors, true);
            set.append(h('label', { class: 'pair' }, input, h('span', { class: 'pair__body' }, h('span', { class: 'pair__name' }, colors.label), demo)));
        }

        return set;
    };
    const readingColors = readingChoice();
    drawSample(readNotation());

    const fit = h('input', { type: 'checkbox', id: 'setting-fit' });
    fit.checked = readFit();
    fit.addEventListener('change', () => {
        saveFit(fit.checked);
        saved();
    });

    const awake = h('input', { type: 'checkbox', id: 'setting-awake' });
    awake.checked = readKeepAwake();
    awake.addEventListener('change', () => {
        saveKeepAwake(awake.checked);
        saved();
    });

    const signOut = h('button', { type: 'button', class: 'button button--danger' }, 'Salir');
    signOut.addEventListener('click', () => account.signOut());

    const element = h(
        'div',
        { class: 'page settings' },
        h('h2', { class: 'sr-only' }, 'Ajustes'),
        h('p', { class: 'muted' }, 'Se guardan en este dispositivo y se aplican al momento.'),
        sample,
        choice<Notation>('notation', 'Nombre de los acordes', readNotation(), [
            { value: 'latin', label: 'Do, Re, Mi' },
            { value: 'english', label: 'C, D, E' },
        ], (value) => {
            saveNotation(value);
            drawSample(value);
        }),
        readingColors,
        h('div', { class: 'choice' }, h('label', { class: 'choice__option', for: 'setting-fit' }, fit, 'Ajustar la letra a la pantalla')),
        h('div', { class: 'choice' }, h('label', { class: 'choice__option', for: 'setting-awake' }, awake, 'Mantener la pantalla encendida al leer o cantar un canto')),
        choice<ColumnMode>('columns', 'Columnas en pantallas anchas', readColumns(), [
            { value: 'auto', label: 'Automático (las que necesite el canto)' },
            { value: 'one', label: 'Siempre una' },
            { value: 'two', label: 'Siempre dos' },
        ], saveColumns),
        h('p', { class: 'muted help-link' }, link(paths.install(), 'Cómo instalar la app en el iPad o el teléfono')),
        h('section', { class: 'settings__account' },
            h('h3', {}, 'Cuenta'),
            h('p', { class: 'muted' }, account.email),
            signOut),
    );

    return { element };
}
