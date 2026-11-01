/**
 * From what the character reader finds in a photo of a sheet to the text the importer reads: the lyrics, each chord
 * line above the lyric line it belongs to, with every chord placed over the syllable it is over.
 *
 * A photo is read twice (read.ts): once for everything (the letters), and once with an alphabet limited to what a chord
 * is made of. The first pass reads words well and chords badly (a lone "C" comes out as "e" or "[e"); the second reads
 * chords well and everything else as noise. Here the two are put together, the tilt of the page is taken out, the
 * columns are told apart, and the result goes through the same layout the PDF reader uses (pdf/layout.ts), so a chord
 * lands on its syllable the same way.
 *
 * Pure (words in, text out), so it is tested without a browser or a photo. Coordinates are the picture's: pixels, y
 * growing downwards.
 */
import { pageToText, type Measure, type TextItem } from '../pdf/layout.ts';

/** A rectangle in the picture */
export interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** One word the reader found */
export interface OcrWord {
    text: string;
    /** 0 to 100, how sure the reader is */
    confidence: number;
    /** The line of text the reader put it in (words of one line share the number) */
    line: number;
    box: Box;
    /** Angle of the baseline of its line, in radians (0 is level), or null when the reader gave none */
    slope: number | null;
}

const NOTE = '(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)';
/** A chord name, in English or Latin notation, with the quality, the extension and a bass note: "C", "Sol#m7", "Re/Fa#" */
const CHORD = new RegExp(`^\\(?${NOTE}[#b]?(?:m|M|maj|sus|dim|aug|add)?\\d*(?:\\/${NOTE}[#b]?)?\\)?$`);
const LATIN_CHORD = /^\(?(?:Do|Re|Mi|Fa|Sol|La|Si)/;

/** A word of lyrics: three letters or more, not a chord ("Sol" is one; "Con" is not) */
const LYRIC_WORD = /^[\p{L}]{3,}$/u;

/** Below this the reader is guessing: a short word it is not sure of is noise, not a word */
const SURE = 60;
const FAIRLY_SURE = 70;
/** A chord of one letter must come with at least this much certainty (a lone "C" is read with little) */
const LONE_CHORD_SURE = 10;
/** The longest picture gap, in line heights, between two words that are still one line of lyrics */
const WORD_GAP = 2.5;
/** A gutter between two columns is at least this share of the width of the text */
const GUTTER = 0.04;
/** An item wider than this share of the text spans the page (a title) and is not a column's */
const SPANNING = 0.45;

/** The characters a chord is made of, in English notation and in Latin: the alphabet of the second pass */
const CHORD_LETTERS = 'ABCDEFGmMsuadijb#/-+()0123456789';
const LATIN_LETTERS = 'DoReMiFaSolLa';

/**
 * The characters the second pass may read. Latin names ("Do", "Sol", "Lam") need the letters of those words too, which
 * lets some noise through, so they are added only when the first pass found more Latin chord names than English ones.
 */
export function chordAlphabet(words: readonly OcrWord[]): string {
    const latin = words.filter((word) => LATIN_CHORD.test(word.text) && CHORD.test(word.text)).length;
    const english = words.filter((word) => /^[A-G]/.test(word.text) && CHORD.test(word.text) && !LATIN_CHORD.test(word.text)).length;

    return [...new Set(latin > english ? CHORD_LETTERS + LATIN_LETTERS : CHORD_LETTERS)].join('');
}

/** A chord as the reader wrote it, with what it confuses put right: a "+" is a "#" */
export function repairChord(text: string): string {
    return text.trim().replace('+', '#');
}

/** How much the page is turned, in radians: the middle of the angles of the baselines (0 when the reader gave none) */
export function tiltOf(words: readonly OcrWord[]): number {
    const slopes = words.flatMap((word) => (word.slope === null ? [] : [word.slope])).sort((a, b) => a - b);

    return slopes[Math.floor(slopes.length / 2)] ?? 0;
}

/** A word with its box turned back by the tilt of the page (the smallest rectangle that holds the turned box) */
interface Placed {
    text: string;
    confidence: number;
    line: number;
    box: Box;
}

function place(word: OcrWord, tilt: number, text: string = word.text): Placed {
    const cos = Math.cos(-tilt);
    const sin = Math.sin(-tilt);
    const corners = [
        [word.box.x0, word.box.y0], [word.box.x1, word.box.y0],
        [word.box.x0, word.box.y1], [word.box.x1, word.box.y1],
    ].map(([x = 0, y = 0]) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);

    return {
        text,
        confidence: word.confidence,
        line: word.line,
        box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) },
    };
}

const centreIn = (inner: Box, outer: Box, margin = 4): boolean => {
    const x = (inner.x0 + inner.x1) / 2;
    const y = (inner.y0 + inner.y1) / 2;

    return x >= outer.x0 - margin && x <= outer.x1 + margin && y >= outer.y0 - margin && y <= outer.y1 + margin;
};
const touches = (a: Box, b: Box): boolean => centreIn(a, b) || centreIn(b, a);
const height = (box: Box): number => box.y1 - box.y0;
const middleY = (box: Box): number => (box.y0 + box.y1) / 2;
/** Whether two words sit on the same line of the picture */
const sameRow = (a: Box, b: Box): boolean => Math.abs(middleY(a) - middleY(b)) < height(a) * 0.6;

const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * The text of a photo of a sheet.
 *
 * @param letters what the first pass read (everything, with the language's dictionary)
 * @param chords what the second pass read (only the characters of a chord)
 * @param measure the width of a letter, as the PDF reader uses it
 */
export function ocrToText(letters: readonly OcrWord[], chords: readonly OcrWord[], measure: Measure): string {
    const tilt = tiltOf(letters);
    const words = letters.map((word) => place(word, tilt));
    const lyric = (word: Placed): boolean => LYRIC_WORD.test(word.text) && !CHORD.test(word.text) && word.confidence >= SURE;
    const lyrics = words.filter(lyric);

    // The chords: what the second pass read in the shape of a chord, and not over a word of lyrics
    const found = chords
        .map((word) => place(word, tilt, repairChord(word.text)))
        .filter((word) => CHORD.test(word.text) && (word.text.length > 1 || word.confidence >= LONE_CHORD_SURE))
        .filter((word) => !lyrics.some((over) => touches(word.box, over.box)));

    // The rows of chords: the band of the picture where chords sit, so the noise the first pass read there goes
    const rows = chordRows(found);
    const inBand = (word: Placed): boolean => rows.some((row) => middleY(word.box) >= row.y0 - 4 && middleY(word.box) <= row.y1 + 4);
    const inRow = (word: Placed): boolean => rows.some((row) => centreIn(word.box, row, 8));
    // A chord the second pass missed, that the first read as one letter of noise ("[e", "Cc") alone in a row above a line of lyrics, is a C
    const looksLikeC = (word: Placed): boolean => word.confidence < FAIRLY_SURE && /^[[(]?(?:e|c|C|o|O|Cc)[\])]?$/.test(word.text);
    const lyricBelow = (word: Placed): boolean => lyrics.some((over) =>
        over.box.y0 > word.box.y1 - 4 && over.box.y0 - word.box.y1 < height(word.box) * 3.2 && over.box.x1 > word.box.x0 - 5 && over.box.x0 < word.box.x1 + 400);

    const kept: Placed[] = [];
    const repaired: Placed[] = [];
    for (const word of words) {
        // Nothing to read in it (a ruled line, a drawing), or an address at the foot of a page
        if (!/[\p{L}\p{N}]/u.test(word.text) || /^(?:https?:|www\.)/i.test(word.text)) {
            continue;
        }
        if (found.some((chord) => touches(word.box, chord.box))) {
            continue;
        }
        if (looksLikeC(word) && !lyrics.some((over) => sameRow(word.box, over.box)) && lyricBelow(word)) {
            repaired.push({ ...word, text: 'C' });
            continue;
        }
        const noise = !lyric(word) && (word.confidence < SURE && word.text.length <= 2 || word.confidence < FAIRLY_SURE && word.text.length <= 3 && inBand(word));
        if (noise || inRow(word) && !lyric(word)) {
            continue;
        }
        kept.push(word);
    }

    // Every item has the height of a typical line: the layout takes it for the size of the letters and the tolerance of a row
    const size = Math.max(median(lyrics.map((word) => height(word.box))), 8);
    const item = (text: string, box: Box, bottom: number = box.y1): TextItem => ({ str: text, x: box.x0, y: -bottom, width: box.x1 - box.x0, height: size });
    const items: TextItem[] = [...lines(kept).map((line) => item(line.text, line.box, line.bottom))];
    for (const chord of [...found, ...repaired]) {
        items.push(item(chord.text, chord.box));
    }

    return columnsOf(items)
        .map((part) => pageToText(part, measure))
        .filter((text) => text.trim() !== '')
        .join('\n\n');
}

/** The bands where chords sit: chords on one baseline, apart into groups by a wide gap (two columns do not share a band) */
function chordRows(chords: readonly Placed[]): Box[] {
    const rows: Box[] = [];
    for (const chord of [...chords].sort((a, b) => a.box.y1 - b.box.y1 || a.box.x0 - b.box.x0)) {
        const row = rows.find((candidate) =>
            Math.abs(middleY(candidate) - middleY(chord.box)) < height(chord.box) * 0.6 && chord.box.x0 - candidate.x1 < 400 && candidate.x0 - chord.box.x1 < 400);
        if (row === undefined) {
            rows.push({ ...chord.box });
        } else {
            row.x0 = Math.min(row.x0, chord.box.x0);
            row.x1 = Math.max(row.x1, chord.box.x1);
            row.y0 = Math.min(row.y0, chord.box.y0);
            row.y1 = Math.max(row.y1, chord.box.y1);
        }
    }

    return rows;
}

/**
 * The words of one line of the picture as one piece of text, the way a PDF gives a line: the layout puts a piece at the
 * column its x says, so a piece per word would stretch every space. A wide gap starts a new piece (it is another column).
 */
function lines(words: readonly Placed[]): { text: string; box: Box; bottom: number }[] {
    const byLine = new Map<number, Placed[]>();
    for (const word of words) {
        byLine.set(word.line, [...(byLine.get(word.line) ?? []), word]);
    }
    const out: { text: string; box: Box; bottom: number }[] = [];
    for (const line of byLine.values()) {
        line.sort((a, b) => a.box.x0 - b.box.x0);
        let run: Placed[] = [];
        const flush = (): void => {
            const first = run[0];
            const last = run[run.length - 1];
            if (first !== undefined && last !== undefined) {
                out.push({
                    text: run.map((word) => word.text).join(' '),
                    box: { x0: first.box.x0, x1: last.box.x1, y0: Math.min(...run.map((word) => word.box.y0)), y1: Math.max(...run.map((word) => word.box.y1)) },
                    // The line sits where its words do on average: a word with a tail (y, p, g) hangs lower
                    bottom: run.reduce((sum, word) => sum + word.box.y1, 0) / run.length,
                });
            }
            run = [];
        };
        for (const word of line) {
            const previous = run[run.length - 1];
            if (previous !== undefined && word.box.x0 - previous.box.x1 > height(previous.box) * WORD_GAP) {
                flush();
            }
            run.push(word);
        }
        flush();
    }

    return out;
}

/**
 * The page as parts to read one after another: a title above two columns, the left column, the right one. The layout can
 * tell columns apart by itself, but not when a title or a line at the foot crosses the gutter, which a printed sheet often
 * has; so the gutter is looked for among the pieces that do not span the page, and the ones that cross it are set aside.
 * (y is the picture's, negated: higher is up.)
 */
function columnsOf(items: readonly TextItem[]): TextItem[][] {
    const left = Math.min(...items.map((piece) => piece.x));
    const right = Math.max(...items.map((piece) => piece.x + piece.width));
    const span = right - left;
    const columnPieces = items.filter((piece) => piece.width < span * SPANNING);
    if (columnPieces.length < 8 || span <= 0) {
        return [[...items]];
    }

    let covered = -Infinity;
    let gutter: { from: number; to: number } | null = null;
    for (const piece of [...columnPieces].sort((a, b) => a.x - b.x)) {
        const place = (piece.x - left) / span;
        if (covered > -Infinity && piece.x - covered >= span * GUTTER && place > 0.3 && place < 0.7 && (gutter === null || piece.x - covered > gutter.to - gutter.from)) {
            gutter = { from: covered, to: piece.x };
        }
        covered = Math.max(covered, piece.x + piece.width);
    }
    if (gutter === null) {
        return [[...items]];
    }

    const cut = gutter;
    const crosses = (piece: TextItem): boolean => piece.x < cut.to && piece.x + piece.width > cut.from;
    const body = items.filter((piece) => !crosses(piece));
    const middle = (cut.from + cut.to) / 2;
    const side = (piece: TextItem): number => (piece.x + piece.width / 2 < middle ? 0 : 1);
    const columns: TextItem[][] = [body.filter((piece) => side(piece) === 0), body.filter((piece) => side(piece) === 1)];
    // A real two-column page has several lines on each side; one chord far to the right does not make a column
    const lineCount = (part: readonly TextItem[]): number => new Set(part.map((piece) => Math.round(piece.y / Math.max(piece.height * 0.8, 1)))).size;
    if (columns.some((column) => column.length < body.length * 0.25 || lineCount(column) < 4)) {
        return [[...items]];
    }

    // What crosses the gutter above both columns is a title and comes first; below, or beside, it joins the column it is mostly in
    const top = Math.max(...body.map((piece) => piece.y));
    const header = items.filter((piece) => crosses(piece) && piece.y > top);
    for (const piece of items.filter((other) => crosses(other) && other.y <= top)) {
        columns[side(piece)]?.push(piece);
    }

    return [header, ...columns];
}
