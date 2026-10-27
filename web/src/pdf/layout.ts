/**
 * From the text items of a PDF page to the text the importer reads: the lyrics, each chord line
 * above the lyric line it belongs to, with every chord placed over the exact letter it is over.
 *
 * `pdftotext -layout` and a copy-paste only keep columns, which are a letter or two off. A PDF
 * knows better: every piece of text has its x position and width. This reads those, finds the
 * letter of the lyric line under each chord (by the width of every letter, measured and scaled so
 * the line has the width the PDF gives it) and writes the chord at that letter's column.
 *
 * Pure (items in, text out), so it is tested without a PDF or a browser: the browser gives it a
 * canvas to measure letters with, the tests a table.
 */
import { firstLength } from '../chordpro/syllable.ts';
import { isChordLine } from '../importer.ts';

/** One piece of text on a page: what pdf.js calls a text item, in points, y growing upwards */
export interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The width of one character at a font size, in any unit (only ratios matter) */
export type Measure = (char: string, size: number) => number;

/** A character with the x its left edge sits at */
interface Glyph {
    char: string;
    x: number;
}

interface Line {
    y: number;
    glyphs: Glyph[];
    text: string;
}

/** A gap between two columns of text is at least this wide, in points */
const MIN_GUTTER = 18;

/** Each column of a two-column page has at least this many lines */
const MIN_COLUMN_LINES = 4;

/** Pages of the PDF, joined as the importer expects: a form feed between pages */
export function pagesToText(pages: readonly string[]): string {
    return pages.join('\f');
}

/** The text of one page, ready for importChordsOverLyrics / importMany */
export function pageToText(items: readonly TextItem[], measure: Measure): string {
    const content = items.filter((item) => item.str.trim() !== '' && item.height > 0);
    if (content.length === 0) {
        return '';
    }

    const unit = spaceWidth(content, measure);

    return splitColumns(content)
        .map((column) => columnToLines(column, measure, unit))
        .filter((lines) => lines.length > 0)
        .map((lines) => lines.join('\n'))
        .join('\n\n');
}

/** The width of a space on this page, in points: the average of what the items say a space is */
function spaceWidth(items: readonly TextItem[], measure: Measure): number {
    let total = 0;
    for (const item of items) {
        total += (measure(' ', item.height) * item.width) / Math.max(measured(item, measure), 1e-9);
    }

    return total / items.length;
}

function measured(item: TextItem, measure: Measure): number {
    let sum = 0;
    for (const char of item.str) {
        sum += measure(char, item.height);
    }

    return sum;
}

/**
 * One column, or two when the page is printed that way: a vertical band, at least MIN_GUTTER
 * wide, in the middle of the page where no text is, with a good share of the text on both sides.
 */
function splitColumns(items: readonly TextItem[]): TextItem[][] {
    const spans = items.map((item) => ({ from: item.x, to: item.x + item.width })).sort((a, b) => a.from - b.from);
    const first = spans[0];
    if (first === undefined) {
        return [];
    }
    const min = first.from;
    const max = Math.max(...spans.map((span) => span.to));

    let covered = first.to;
    let best: { from: number; to: number } | null = null;
    for (const span of spans.slice(1)) {
        if (span.from - covered >= MIN_GUTTER) {
            const middle = (covered + span.from) / 2;
            const place = (middle - min) / Math.max(max - min, 1);
            if (place > 0.3 && place < 0.7 && (best === null || span.from - covered > best.to - best.from)) {
                best = { from: covered, to: span.from };
            }
        }
        covered = Math.max(covered, span.to);
    }
    if (best === null) {
        return [[...items]];
    }

    const cut = best;
    const left = items.filter((item) => item.x + item.width / 2 < (cut.from + cut.to) / 2);
    const right = items.filter((item) => item.x + item.width / 2 >= (cut.from + cut.to) / 2);
    // A real two-column page has many lines on each side; one chord far to the right does not make a column
    if (left.length < items.length * 0.25 || right.length < items.length * 0.25 || rows(left) < MIN_COLUMN_LINES || rows(right) < MIN_COLUMN_LINES) {
        return [[...items]];
    }

    return [left, right];
}

/** How many different lines (baselines) a set of items covers */
function rows(items: readonly TextItem[]): number {
    return new Set(items.map((item) => Math.round(item.y / 4))).size;
}

function columnToLines(items: readonly TextItem[], measure: Measure, unit: number): string[] {
    const lines = groupLines(items, measure, unit);
    const gaps = lines.slice(1).map((line, i) => (lines[i]?.y ?? 0) - line.y).filter((gap) => gap > 0).sort((a, b) => a - b);
    // Single spacing is the usual gap between lines; a gap well over it is a blank line
    const base = gaps[Math.floor(gaps.length / 2)] ?? 0;
    const blankAfter = (from: Line, to: Line): boolean => base > 0 && from.y - to.y > base * 1.5;

    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) {
            continue;
        }
        const previous = lines[i - 1];
        if (previous !== undefined && blankAfter(previous, line)) {
            out.push('');
        }

        const next = lines[i + 1];
        if (isChords(line) && next !== undefined && !isChords(next) && !blankAfter(line, next)) {
            out.push(chordsOver(line, next), next.text);
            i++;
        } else {
            out.push(line.text);
        }
    }

    return out;
}

function isChords(line: Line): boolean {
    return isChordLine(line.text);
}

/** Items on the same baseline become one line, in the order of their x */
function groupLines(items: readonly TextItem[], measure: Measure, unit: number): Line[] {
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: TextItem[][] = [];
    for (const item of sorted) {
        const row = rows[rows.length - 1];
        const head = row?.[0];
        if (row !== undefined && head !== undefined && Math.abs(head.y - item.y) <= Math.max(head.height, item.height) * 0.4) {
            row.push(item);
        } else {
            rows.push([item]);
        }
    }

    const left = Math.min(...items.map((item) => item.x));

    return rows.map((row) => buildLine(row.sort((a, b) => a.x - b.x), left, measure, unit));
}

/**
 * The text of a line and the x of each of its characters. Items are put at the column their x
 * says (a column is one space wide, from the left edge of the column of text), so lines keep
 * their indents and a number hanging out in the margin ("1.") stays out.
 */
function buildLine(row: readonly TextItem[], left: number, measure: Measure, unit: number): Line {
    const glyphs: Glyph[] = [];
    let text = '';
    let end = left;

    for (const item of row) {
        const column = Math.round((item.x - left) / unit);
        // A gap becomes spaces; items that touch or overlap (never in a real PDF, but a PDF can be odd)
        // are still kept apart by one, so two chords cannot fuse into one word
        const apart = item.x - end > unit * 0.4 || item.x < end - 0.5;
        while (text.length < column || (text.length > 0 && !text.endsWith(' ') && apart)) {
            glyphs.push({ char: ' ', x: end });
            text += ' ';
            end += unit;
        }

        const sum = Math.max(measured(item, measure), 1e-9);
        const scale = item.width / sum;
        let at = item.x;
        for (const char of item.str) {
            glyphs.push({ char, x: at });
            text += char;
            at += measure(char, item.height) * scale;
        }
        end = at;
    }

    return { y: row[0]?.y ?? 0, glyphs, text: text.replace(/\s+$/, '') };
}

/**
 * The chord line written so each chord starts at the column of the lyric syllable it is over.
 *
 * A chord goes on a syllable, and the person who typed the sheet lined it up by eye with spaces,
 * so its left edge can sit a little inside the first letter of the syllable or just short of it.
 * It is snapped to the nearest start of a syllable (or of a word, a number, a bracket) rather than
 * to the nearest letter: that is where the chord was meant, and where the public site draws it.
 * Chords too close to keep their column are moved right of the one before: they stay in order.
 */
function chordsOver(chords: Line, lyric: Line): string {
    const last = lyric.glyphs[lyric.glyphs.length - 1];
    const lyricEnd = last === undefined ? 0 : last.x + (last.char === ' ' ? 0 : averageWidth(lyric));
    const starts = syllableStarts(lyric.text);
    let line = '';

    for (const token of chords.text.matchAll(/\S+/g)) {
        const x = chords.glyphs[token.index ?? 0]?.x ?? 0;
        let column = lyric.glyphs.length;
        // Past the last letter the chord stays after the words, where it was
        if (x <= lyricEnd) {
            let best = Infinity;
            for (const index of starts) {
                const distance = Math.abs((lyric.glyphs[index]?.x ?? lyricEnd) - x);
                if (distance < best) {
                    best = distance;
                    column = index;
                }
            }
        }
        const at = Math.max(column, line === '' ? 0 : line.length + 1);
        line += ' '.repeat(at - line.length) + token[0];
    }

    return line;
}

/**
 * Where a chord can sit in a line of lyrics: the start of every syllable of every word, and of
 * everything else that is not a space ("1.", "(BIS)"). Indexes in the text, in order.
 */
export function syllableStarts(text: string): number[] {
    const starts = new Set<number>();
    for (const part of text.matchAll(/\S+/g)) {
        const base = part.index ?? 0;
        starts.add(base);
        for (const word of part[0].matchAll(/\p{L}+/gu)) {
            const from = base + (word.index ?? 0);
            let at = 0;
            while (at < word[0].length) {
                starts.add(from + at);
                const length = firstLength(word[0].slice(at));
                if (length <= 0) {
                    break;
                }
                at += length;
            }
        }
    }

    return [...starts].sort((a, b) => a - b);
}

function averageWidth(line: Line): number {
    const first = line.glyphs[0];
    const last = line.glyphs[line.glyphs.length - 1];
    if (first === undefined || last === undefined || line.glyphs.length < 2) {
        return 0;
    }

    return (last.x - first.x) / (line.glyphs.length - 1);
}
