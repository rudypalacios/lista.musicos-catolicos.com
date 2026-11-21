/**
 * How wide a character is in Helvetica / Arial (1/1000 of the font size), the sans-serif that sheets are written in.
 *
 * A sheet pasted from a word processor or a PDF has its chords lined up by eye with spaces *in that font*: a space is
 * about half a letter wide, so counting characters puts every chord too far right, and the farther along the line the
 * worse. Measuring both lines with these widths puts each chord back where it was on the page. Only the ratios matter,
 * so Liberation Sans, Calibri and the like (which are close to it) work as well.
 */

/** Characters that share a width, by width */
const GROUPS: readonly [number, string][] = [
    [222, 'ijl‘’‘'],
    [278, ' !,./:;I[]\\ft| '],
    [333, '()-r`¡'],
    [355, '"“”'],
    [389, '*'],
    [500, 'Jckvxyzs'],
    [556, '0123456789#$?L_abdeghnopqu–'],
    [584, '+<=>~'],
    [611, 'FTZ¿'],
    [667, 'ABEKPSVXY&'],
    [722, 'CDHNRUw'],
    [778, 'GOQ'],
    [833, 'mM'],
    [889, '%'],
    [944, 'W'],
    [1000, '@…—'],
];

const WIDTHS = new Map<string, number>();
for (const [width, chars] of GROUPS) {
    for (const char of chars) {
        WIDTHS.set(char, width);
    }
}

/** The width of a space: what a column of a pasted sheet is worth in a font like this */
export const SPACE_WIDTH = 278;

/** An unknown character is taken for an average letter */
const AVERAGE = 556;

/** The width of one character; a letter with an accent is as wide as the letter */
export function glyphWidth(char: string): number {
    return WIDTHS.get(char) ?? WIDTHS.get(char.normalize('NFD').charAt(0)) ?? AVERAGE;
}

/** The width of a text */
export function textWidth(text: string): number {
    let sum = 0;
    for (const char of text) {
        sum += glyphWidth(char);
    }

    return sum;
}
