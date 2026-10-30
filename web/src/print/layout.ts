import { isVerseLabel, type Line, type Sheet } from '../chordpro/parser.ts';
import { chars, trim } from '../chordpro/php.ts';

/**
 * How a printed sheet fits the page, for each version: a port of PrintLayout.php of
 * musicos-catolicos, kept as it is (the golden fixtures check it against the PHP).
 *
 * - normal: it fits on one page as it is.
 * - compact: it fits with slightly smaller type, still in one full-width column.
 * - columns: not even then; two columns with the compact type on one page.
 * - pages: longer still; the same two columns over as many pages as it takes.
 *
 * It estimates the printed height from the parsed lyrics and the print rules in
 * `print.css`: keep METRICS in step with them (and with the PHP).
 */
export type PrintVersion = 'chords' | 'lyrics';
export type PrintSize = 'normal' | 'compact';
export type PrintLayoutName = 'normal' | 'compact' | 'columns' | 'pages';

type Metrics = Readonly<{
    header: number;
    row: number;
    chords: number;
    gap: number;
    label: number;
    stanza: number;
    width: number;
    column?: number;
    columnHeight?: number;
}>;

/** Printable height, in points: Letter (792pt) less the @page margins (12mm top, 16mm bottom) */
const PAGE = 713.0;
const FILL = 1.0;
const HEADING_CHARS = 100;
const TITLE_CHAR = 2;
const HEADING_ROW = 22.0;
const COLUMNS_FILL = 0.9;

const METRICS: Readonly<Record<PrintVersion, Readonly<Record<PrintSize, Metrics>>>> = {
    chords: {
        normal: { header: 62.0, row: 14.2, chords: 10.8, gap: 5.0, label: 12.0, stanza: 12.0, width: 70 },
        compact: {
            header: 62.0, row: 13.1, chords: 9.4, gap: 5.0, label: 12.0, stanza: 12.0, width: 76,
            column: 40, columnHeight: 608.0,
        },
    },
    lyrics: {
        normal: { header: 40.0, row: 20.4, chords: 0.0, gap: 2.0, label: 12.0, stanza: 12.0, width: 56 },
        compact: {
            header: 40.0, row: 17.9, chords: 0.0, gap: 2.0, label: 12.0, stanza: 12.0, width: 64,
            column: 36, columnHeight: 638.0,
        },
    },
};

/** The layout of one sheet; `title` and `subtitle` are what the header prints (a long one wraps) */
export function printLayout(
    sheet: Pick<Sheet, 'sections'>,
    version: PrintVersion,
    title = '',
    subtitle = '',
): PrintLayoutName {
    const heading = chars(title).length * TITLE_CHAR + chars(subtitle).length;
    const fits = PAGE * FILL - (Math.max(1, Math.ceil(heading / HEADING_CHARS)) - 1) * HEADING_ROW;
    if (printHeight(sheet, version) <= fits) {
        return 'normal';
    }
    if (printHeight(sheet, version, 'compact') <= fits) {
        return 'compact';
    }

    // In columns, lines wrap at half the width: measure the lyrics at that width
    const m = METRICS[version].compact;
    const lyrics = printHeight(sheet, version, 'compact', true) - m.header;

    return lyrics <= 2 * (m.columnHeight as number) * COLUMNS_FILL ? 'columns' : 'pages';
}

/** The estimated printed height of the header and the lyrics, in points */
export function printHeight(
    sheet: Pick<Sheet, 'sections'>,
    version: PrintVersion,
    size: PrintSize = 'normal',
    inColumn = false,
): number {
    const base = METRICS[version][size];
    const m: Metrics = inColumn ? { ...base, width: base.column as number } : base;
    let height = m.header;

    sheet.sections.forEach((section, index) => {
        height += index > 0 ? m.stanza : 0.0;
        // "Verso 1" does not print: the stanza's number says it
        const label = section.label;
        if (label !== null && !(section.kind === 'verse' && isVerseLabel(label))) {
            height += m.label + m.gap;
        }
        for (const line of section.lines) {
            const lineHeight = lineRows(line, version, m);
            height += lineHeight > 0 ? lineHeight + m.gap : 0.0;
        }
    });

    return height;
}

function lineRows(line: Line, version: PrintVersion, m: Metrics): number {
    if (typeof line === 'string') {
        return m.row * 0.8;
    }

    const text = trim(line.map((segment) => segment.text).join(''));
    const hasChords = line.some((segment) => segment.chord !== null);
    if (text === '') {
        // A line of chords only: one row of chords; the lyrics-only sheet leaves it out
        return version === 'chords' && hasChords ? m.chords : 0.0;
    }

    // The note of the line (parser.ts) shares its last row, with a gap, and can push it onto another
    const note = line[line.length - 1]?.note;
    const length = chars(text).length + (note === undefined ? 0 : chars(note).length + 2);
    const rows = Math.max(1, Math.ceil(length / m.width));

    return rows * (m.row + (hasChords ? m.chords : 0.0));
}
