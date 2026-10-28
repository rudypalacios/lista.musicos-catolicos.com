import { readLyricColor } from './prefs.ts';

/** A colour the lyrics can be shown in. All of them read well on the app's dark background. */
export interface LyricColor {
    id: string;
    label: string;
    /** CSS colour, or null for the app's own text colour */
    value: string | null;
}

export const LYRIC_COLORS: readonly LyricColor[] = [
    { id: 'predeterminado', label: 'Predeterminado', value: null },
    { id: 'blanco', label: 'Blanco', value: '#ffffff' },
    { id: 'ambar', label: 'Ámbar', value: '#ffd479' },
    { id: 'verde', label: 'Verde', value: '#b4eab0' },
    { id: 'celeste', label: 'Celeste', value: '#a9d6ff' },
];

/** The colour chosen on this device; an unknown id (an older or newer version) is the default */
export function chosenLyricColor(): LyricColor {
    const id = readLyricColor();

    return LYRIC_COLORS.find((color) => color.id === id) ?? (LYRIC_COLORS[0] as LyricColor);
}

/** Puts the chosen colour on the page: the lyrics read it from `--lyric-color` */
export function applyLyricColor(color: LyricColor = chosenLyricColor()): void {
    if (color.value === null) {
        document.documentElement.style.removeProperty('--lyric-color');
    } else {
        document.documentElement.style.setProperty('--lyric-color', color.value);
    }
}
