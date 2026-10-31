import { readLyricColor } from './prefs.ts';

/**
 * How a song is coloured on screen: the lyrics and the chords, chosen together as one pair so that the two always
 * read well on the app's dark background and against each other. (Paper is not part of this: it is always black
 * lyrics and dark red chords, see `print/print.css`.)
 */
export interface ReadingColors {
    /** Kept in the device's storage; the first four are the ids the lyric colour had before the pairs existed */
    id: string;
    label: string;
    /** CSS colour of the lyrics, or null for the app's own text colour */
    lyrics: string | null;
    /** CSS colour of the chords (and of the underline of the syllable they fall on), or null for the app's blue */
    chords: string | null;
}

export const READING_COLORS: readonly ReadingColors[] = [
    { id: 'predeterminado', label: 'Clásico', lyrics: null, chords: null },
    { id: 'blanco', label: 'Blanco y rojo', lyrics: '#ffffff', chords: '#ff8b8b' },
    { id: 'ambar', label: 'Ámbar y celeste', lyrics: '#ffd479', chords: '#8fd0ff' },
    { id: 'lavanda', label: 'Lavanda y menta', lyrics: '#dcd0ff', chords: '#7fe8c8' },
];

/** The pair chosen on this device; an unknown id (an older or newer version, or a colour that was dropped) is the default */
export function chosenReadingColors(): ReadingColors {
    const id = readLyricColor();

    return READING_COLORS.find((colors) => colors.id === id) ?? (READING_COLORS[0] as ReadingColors);
}

/**
 * Puts `colors` on `element` as the custom properties the song reads (`--lyric-color`, `--chord-color`). Through the
 * CSSOM, never a `style` attribute, which the page's policy refuses. With `fallbacks` the default pair is written out
 * (for a sample inside the settings, which sits inside a page that may have another pair); without, it is removed.
 */
export function paintReadingColors(element: HTMLElement, colors: ReadingColors, fallbacks = false): void {
    const put = (name: string, value: string | null, fallback: string): void => {
        if (value !== null) {
            element.style.setProperty(name, value);
        } else if (fallbacks) {
            element.style.setProperty(name, fallback);
        } else {
            element.style.removeProperty(name);
        }
    };
    put('--lyric-color', colors.lyrics, 'var(--text)');
    put('--chord-color', colors.chords, 'var(--accent)');
}

/** Puts the chosen pair on the page */
export function applyReadingColors(colors: ReadingColors = chosenReadingColors()): void {
    paintReadingColors(document.documentElement, colors);
}
