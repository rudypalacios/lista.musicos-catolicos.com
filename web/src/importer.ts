/**
 * Turns a song pasted the way it is usually written, chords on their own line above the
 * words (from a document, a PDF or a chat), into ChordPro: the chords go inside the line, at
 * the column they were over.
 *
 *     ENTRADA: Caminamos con alegría       →  title "Caminamos con alegría", part "entrada"
 *     C            Am
 *     1. Un pueblo que espera el mañana,   →  {c: Verso 1}
 *                                              [C]Un pueblo que [Am]espera el mañana,
 *
 * It is a best effort and says so: a chord's column is only as good as the spaces the paste
 * kept (a proportional font shifts them), so the result is shown for the person to fix before
 * it is saved. Nothing the person wrote is dropped: every word of the lyrics is in the output.
 *
 * Chords are normalised to what the parser stores (English): Latin names in any case (SOL, MIm,
 * Sib, FA#), "A-" for minor, parentheses around a chord. The ChordPro parser itself never does
 * that (musicos-catolicos is the reference for it); only this importer reads sloppy input.
 */
import { english } from './chordpro/chord.ts';
import { SPACE_WIDTH, textWidth } from './chordpro/glyph-width.ts';
import { syllableStarts } from './chordpro/syllable-starts.ts';
import { MASS_PARTS, plain } from './mass.ts';

export interface Imported {
    title: string;
    /** Who wrote it or which setting it is, when the header says ("Misa Rítmica Mejía"); "" otherwise */
    author: string;
    /** The Mass part named in the header ("ENTRADA: …"), as a MASS_PARTS id, or null */
    part: string | null;
    /** ChordPro */
    body: string;
    /** Things the person should look at, in Spanish */
    warnings: string[];
}

/** A chord: root, quality marks and an optional bass note. Everything else is a word. */
const CHORD_SHAPE = /^[A-G][#b]?(?:m(?!aj)|maj|min|dim|aug|sus|add|M|[0-9]|[#b+\-°ø]|\([0-9#b+\-]*\))*(?:\/[A-G][#b]?)?$/;

/** "A-" and "D-7" are A minor and D minor 7 */
const MINOR_DASH = /-(?=$|\d|\/)/;

/** Section labels written on a line of their own */
const LABEL_LINE = /^(coro|estribillo|puente|intro|introduccion|interludio|precoro|final|solo|estrofa|verso)(?:\s+\d+)?$/;

/** "1.", "2)", "3 -" before the first word of a line: the number of a verse */
const VERSE_NUMBER = /^(\s*)(\d{1,2})\s*[.)\-]\s+/;

type Kind = 'blank' | 'chords' | 'text';

interface Row {
    kind: Kind;
    text: string;
}

/** What the importer says about chords it wrote in the standard form: a report, not a problem (keep in step with its message) */
const NORMALISED_REPORT = /^\d+ acordes? escritos? con otra notación/;

/** What it says when it lined the chords up by the width of the letters: also a report (keep in step with its message) */
const ALIGNED_REPORT = /^Los acordes estaban alineados con letra de ancho variable/;

/**
 * What a person must look at in what the importer said, in a word each ("Sin acordes", "Dos columnas"…), each once.
 * The report of chords written in the standard form is not among them: it is on almost every sheet and says nothing is wrong.
 */
export function attentionOf(warnings: readonly string[]): string[] {
    const labels = warnings
        .filter((warning) => !NORMALISED_REPORT.test(warning) && !ALIGNED_REPORT.test(warning))
        .map((warning) => {
            if (warning.startsWith('No encontré acordes')) {
                return 'Sin acordes';
            }
            if (warning.startsWith('La hoja tenía dos columnas')) {
                return 'Dos columnas';
            }
            if (warning.startsWith('Acordes sin letra')) {
                return 'Acordes sin letra';
            }
            return warning.startsWith('Entendí “(C') ? 'Cejilla' : 'Revisar';
        });

    return [...new Set(labels)];
}

export function importChordsOverLyrics(source: string): Imported {
    const warnings: string[] = [];
    const prepared = source.split(/\r\n|[\n\r\u2028\u2029]/).map(prepare);
    const columns = splitColumns(prepared);
    if (columns.split) {
        warnings.push('La hoja tenía dos columnas: leí primero la izquierda y después la derecha.');
    }
    const rows = classify(columns.lines);

    const header = takeHeader(rows);
    const lines: string[] = [];
    let normalised = 0;
    const model = columnModel(rows);

    const blank = (): void => {
        const last = lines[lines.length - 1];
        // No empty line after a label: the label names what comes next
        if (last !== undefined && last !== '' && !last.startsWith('{c:')) {
            lines.push('');
        }
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row === undefined) {
            continue;
        }
        if (row.kind === 'blank') {
            blank();
            continue;
        }

        let chordRow: Row | null = null;
        let lyricRow: Row | null = null;
        if (row.kind === 'chords') {
            chordRow = row;
            const next = rows[i + 1];
            // Chords just before a label ("INTRO", "CORO") are not over the label: they stand alone
            if (next?.kind === 'text' && labelOf(next.text) === null) {
                lyricRow = next;
                i++;
            }
        } else {
            lyricRow = row;
        }

        const original = lyricRow?.text ?? '';
        let text = original;
        let offset = 0;
        // What was cut from the start of the lyric line (a verse number, an indent), and where the words begin on the page
        let cut = 0;
        let hanging: number | null = null;
        const label = chordRow === null && lyricRow !== null ? labelOf(text) : null;
        if (label !== null) {
            // A label on its own line names the lines that follow
            blank();
            lines.push(`{c: ${label}}`);
            continue;
        }

        const verse = VERSE_NUMBER.exec(text);
        if (verse !== null) {
            blank();
            lines.push(`{c: Verso ${verse[2]}}`);
            // The number hangs in the margin: the chords above are aligned to where the words
            // start on the page, which the other lines of the verse show (they are indented)
            hanging = hangingIndent(rows, i, verse[0].length);
            offset = hanging ?? verse[0].length;
            cut = verse[0].length;
            text = text.slice(cut);
        }

        // The indent came from the page, not from the words ("    a un mundo…" under "1. Un pueblo…")
        const indent = text.length - text.trimStart().length;
        text = text.slice(indent);
        offset += indent;
        cut += indent;
        const origin: Origin = {
            column: offset,
            x: hanging !== null ? (hanging + indent) * SPACE_WIDTH : textWidth(original.slice(0, cut)),
        };

        if (chordRow === null) {
            lines.push(text);
            continue;
        }
        const placed = place(chordRow.text, text, origin, lyricRow === null, model);
        normalised += placed.normalised;
        warnings.push(...placed.warnings.map((message) => `${message} (acordes “${chordRow?.text.trim()}”)`));
        lines.push(placed.line);
        if (lyricRow === null) {
            warnings.push(`Acordes sin letra debajo: ${chordRow.text.trim()}`);
        }
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    if (header.capo !== null) {
        lines.unshift(`{capo: ${header.capo}}`);
        warnings.push(`Entendí “(C${header.capo})” del encabezado como cejilla en el traste ${header.capo}.`);
    }
    if (model === 'widths' && lines.some((line) => line.includes('['))) {
        warnings.push(
            'Los acordes estaban alineados con letra de ancho variable (como en Word o en un PDF): '
            + 'los coloqué según el ancho de las letras. Revisa que cada uno quede sobre su sílaba.',
        );
    }
    if (normalised > 0) {
        warnings.push(
            `${normalised} acorde${normalised === 1 ? '' : 's'} escrito${normalised === 1 ? '' : 's'} con otra notación `
            + '(guion, paréntesis o nombres en español) se pasó a la forma estándar.',
        );
    }
    if (!lines.some((line) => line.includes('['))) {
        warnings.push('No encontré acordes: la letra se guardará sin ellos.');
    }

    return { title: header.title, author: header.author, part: header.part, body: lines.join('\n'), warnings };
}

/**
 * Tabs to spaces (4-column stops, so columns still line up), no non-breaking spaces, no trailing
 * space, and none of the zero-width characters that Word, Docs and PDFs leave between letters:
 * they take a place in the text and no place on the page, so they would shift every column.
 */
function prepare(line: string): string {
    let column = 0;
    let out = '';
    for (const char of line.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\u00A0/g, ' ')) {
        if (char === '\t') {
            const spaces = 4 - (column % 4);
            out += ' '.repeat(spaces);
            column += spaces;
        } else {
            out += char;
            column++;
        }
    }

    return out.replace(/\s+$/, '');
}

function classify(lines: string[]): Row[] {
    return lines.map((text) => {
        if (text.trim() === '') {
            return { kind: 'blank', text: '' };
        }

        return { kind: isChordLine(text) ? 'chords' : 'text', text };
    });
}

/** A sheet pasted into the editor, read with the chords it had above the words */
export interface PastedSheet extends Pick<Imported, 'title' | 'author' | 'body'> {
    /** How many chords were put in the text */
    chords: number;
}

/**
 * Reads text pasted into the editor as a sheet with the chords on a line above the words, or null when it
 * is not one: text that already has [chords] or {directives} is ChordPro and is left as it is, and so is
 * text with no chord line standing over a line of words (a plain lyric).
 */
export function convertPastedSheet(text: string): PastedSheet | null {
    if (/\[[^\]]*\]/.test(text) || /^\s*\{\w+/m.test(text)) {
        return null;
    }
    const lines = text.split(/\r\n|[\n\r\u2028\u2029]/);
    const overWords = lines.some((line, index) => {
        const below = lines[index + 1] ?? '';

        return line.trim() !== '' && isChordLine(line) && below.trim() !== '' && !isChordLine(below);
    });
    if (!overWords) {
        return null;
    }
    const { title, author, body } = importChordsOverLyrics(text);
    const chords = (body.match(/\[[^\]]*\]/g) ?? []).length;

    return chords === 0 ? null : { title, author, body, chords };
}

export function isChordLine(text: string): boolean {
    const tokens = text.trim().split(/\s+/);

    return tokens.every((token) => chordOf(token) !== null);
}

/**
 * The chord a token spells, in English notation, or null if it is a word.
 *
 * A chord starts with a capital: "la la la" is a lyric, "La" or "LA" a chord. A line made only
 * of Spanish words that are also note names ("Sol", "Si", "Mi") is still taken for chords;
 * the preview is where the person catches that.
 */
export function chordOf(token: string): string | null {
    // A chord wholly in parentheses ("(G)": played only on some repetitions) keeps them
    const optional = /^\(([^()]+)\)$/.exec(token);
    if (optional !== null) {
        const inner = chordOf(optional[1] ?? '');

        return inner === null ? null : `(${inner})`;
    }
    const bare = token.replace(/^\(+/, '').replace(/\)+$/, '');
    if (bare === '' || !/^[A-Z]/.test(bare)) {
        return null;
    }
    const candidate = english(bare.replace(MINOR_DASH, 'm'));

    return CHORD_SHAPE.test(candidate) ? candidate : null;
}

/**
 * The first line, if it says what the song is: "ENTRADA: Caminamos con alegría", "GLORIA",
 * "CORDERO DE DIOS   Misa Rítmica Mejía.". Removed from `rows` when it is a header.
 */
function takeHeader(rows: Row[]): { title: string; author: string; part: string | null; capo: string | null } {
    const none = { title: '', author: '', part: null, capo: null };
    const index = rows.findIndex((row) => row.kind !== 'blank');
    const row = rows[index];
    if (row === undefined || row.kind !== 'text') {
        return none;
    }

    const text = row.text.trim();
    const match = partOf(text);
    const next = rows.slice(index + 1).find((r) => r.kind !== 'blank');
    const aloneOnItsLine = rows[index + 1]?.kind === 'blank' && next?.kind === 'chords';
    if (match === null && !aloneOnItsLine) {
        return none;
    }

    rows.splice(0, index + 1);
    const capo = /\(\s*C\s*(\d{1,2})\s*\)\s*$/i.exec(text);
    const line = (capo !== null ? text.slice(0, capo.index) : text).replace(/\s+/g, ' ').trim();
    const colon = line.indexOf(':');
    const after = colon > 0 ? line.slice(colon + 1).trim().replace(/\.$/, '') : '';
    const fixed = MASS_PARTS.find((part) => part.id === match)?.fixedText === true;

    let title: string;
    let author = '';
    if (match !== null && after !== '' && fixed) {
        // "PADRE NUESTRO: Martín Valverde": the words are the liturgy's, the rest says whose setting
        title = MASS_PARTS.find((part) => part.id === match)?.name ?? line;
        author = after;
    } else if (match !== null && after !== '') {
        // "ENTRADA: Caminamos con alegría": the song is what follows the colon
        title = after;
    } else {
        // "GLORIA", "Piedad Kyrie:", "ALELUYA Junto a ti Jesús": no colon, the whole line is the title
        title = line.replace(/:$/, '').replace(/\.$/, '').trim();
    }

    return {
        title: title === title.toUpperCase() ? capitalise(title) : title,
        author,
        part: match,
        capo: capo?.[1] ?? null,
    };
}

/** The Mass part a header line starts with (longest alias first), or null */
function partOf(text: string): string | null {
    const head = plain(text.split(':')[0] ?? text);
    const whole = plain(text);
    let best: { id: string; length: number } | null = null;
    for (const part of MASS_PARTS) {
        for (const alias of part.aliases) {
            const matches = head === alias || whole === alias || whole.startsWith(alias + ' ');
            if (matches && (best === null || alias.length > best.length)) {
                best = { id: part.id, length: alias.length };
            }
        }
    }

    return best?.id ?? null;
}

function capitalise(text: string): string {
    const lower = text.toLowerCase();

    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "CORO" → "Coro", "coro 2" → "Coro 2"; null when the line is not a label */
function labelOf(text: string): string | null {
    const label = text.trim().replace(/:$/, '');
    if (!LABEL_LINE.test(plain(label))) {
        return null;
    }

    return capitalise(label);
}

/**
 * How the columns of a pasted sheet are read:
 *
 * - `columns`: one character is one column (a monospaced font, a text file, an editor): a chord goes at the column it was over.
 * - `widths`: the sheet was written in a proportional font (Word, Docs, a PDF) and its chords lined up by eye with spaces,
 *   which are half a letter wide: the same column is farther along the lyric line, and more so the farther along the line.
 *   Each line is measured with the widths of the letters (`glyph-width.ts`) and the chord goes over the syllable it was over.
 */
type ColumnModel = 'columns' | 'widths';

/** Where the words of a lyric line begin on the page: in columns, and as a width */
interface Origin {
    column: number;
    x: number;
}

/** A lyric line shorter than this says nothing about the font: a chord past its end is as likely a chord after the words */
const MIN_EVIDENCE = 12;

/** A chord is past the end of its line when it starts this many columns after it: at least 2, or a tenth of the line */
const pastTheEnd = (length: number): number => length + Math.max(2, length * 0.1);

/**
 * Tells a sheet written in a proportional font from a monospaced one. Read one character per column, the chords of a
 * proportional sheet run past the end of their lines (a space is narrower than a letter, so the chord line is longer than
 * the words under it); in a monospaced sheet a chord stays over its words, or just after them. The sheet is proportional
 * when half or more of its chord lines run past the end of a lyric of some length, and that is shown by two lines, or by
 * one that runs well past (a single chord after the words is how a monospaced sheet ends a line).
 */
function columnModel(rows: readonly Row[]): ColumnModel {
    let votes = 0;
    let past = 0;
    let wellPast = 0;
    rows.forEach((row, index) => {
        const lyric = rows[index + 1];
        if (row.kind !== 'chords' || lyric?.kind !== 'text' || lyric.text.length < MIN_EVIDENCE || labelOf(lyric.text) !== null) {
            return;
        }
        votes++;
        const last = (([...row.text.matchAll(/\S+/g)].pop()?.index) ?? 0);
        if (last >= pastTheEnd(lyric.text.length)) {
            past++;
            wellPast += last >= lyric.text.length * 1.3 ? 1 : 0;
        }
    });

    return past > 0 && past * 2 >= votes && (past >= 2 || wellPast > 0) ? 'widths' : 'columns';
}

/**
 * Puts each chord of `chords` inside `lyric` where it was over. `origin` is where the words of `lyric` begin on the page
 * (a verse number or an indent was cut before them), which the chord line is still aligned to.
 */
function place(chords: string, lyric: string, origin: Origin, chordsOnly: boolean, model: ColumnModel) {
    const warnings: string[] = [];
    let normalised = 0;
    const found: { column: number; x: number; chord: string }[] = [];
    for (const match of chords.matchAll(/\S+/g)) {
        const chord = chordOf(match[0]);
        if (chord === null) {
            continue;
        }
        // Parentheses around a whole chord are part of what was written; stray ones are not
        const written = /^\([^()]+\)$/.test(match[0]) ? match[0] : match[0].replace(/^\(+|\)+$/g, '');
        if (chord !== written) {
            normalised++;
        }
        found.push({ column: match.index ?? 0, x: textWidth(chords.slice(0, match.index ?? 0)), chord });
    }

    if (chordsOnly) {
        return { line: found.map((f) => `[${f.chord}]`).join(' '), normalised, warnings };
    }

    // Every position is read on the lyric as it was written; inserting from the last chord to the
    // first keeps the earlier columns right
    const length = lyric.length;
    const at = model === 'widths' ? widthSpots(lyric, origin, found) : found.map(({ column }) => snap(lyric, Math.max(0, column - origin.column)));
    const spots = found.map(({ chord }, order) => ({ at: at[order] ?? length, chord, order }));
    const tail = spots.filter((spot) => spot.at >= length).map((spot) => `[${spot.chord}]`);
    let line = lyric;
    const inside = spots.filter((spot) => spot.at < length).sort((a, b) => b.at - a.at || b.order - a.order);
    for (const { at: index, chord } of inside) {
        line = `${line.slice(0, index)}[${chord}]${line.slice(index)}`;
    }
    if (tail.length > 0) {
        line += tail.join(' ');
    }

    return { line, normalised, warnings };
}

/**
 * Where each chord goes in a line written in a proportional font: the start of the syllable whose left edge is nearest to
 * the chord's (the person lined them up by eye, so a chord can sit a little either side of it), or the end of the line
 * when it is past the last letter. Edges are measured with the widths of the letters, from where the words begin.
 */
function widthSpots(lyric: string, origin: Origin, chords: readonly { x: number }[]): number[] {
    const starts = syllableStarts(lyric);
    const edges = starts.map((start) => origin.x + textWidth(lyric.slice(0, start)));
    const end = origin.x + textWidth(lyric);

    return chords.map(({ x }) => {
        if (x >= end || starts.length === 0) {
            return lyric.length;
        }
        let best = 0;
        for (let i = 1; i < starts.length; i++) {
            if (Math.abs((edges[i] ?? 0) - x) < Math.abs((edges[best] ?? 0) - x)) {
                best = i;
            }
        }

        return starts[best] ?? lyric.length;
    });
}

/** The index a chord over column `at` goes to: over a gap between words, the next word's start */
function snap(lyric: string, at: number): number {
    if (at >= lyric.length) {
        return lyric.length;
    }
    if (lyric.charAt(at) !== ' ') {
        return at;
    }
    const next = lyric.slice(at).search(/\S/);

    return next === -1 ? lyric.length : at + next;
}

/**
 * Where the words of a numbered verse start on the page: the indent of the other lines of the
 * verse ("    a un mundo…" under "1. Un pueblo…"), when it is a little more than the number itself.
 */
function hangingIndent(rows: Row[], from: number, prefix: number): number | null {
    const indents: number[] = [];
    for (let j = from + 1; j < rows.length; j++) {
        const row = rows[j];
        if (row === undefined || row.kind === 'blank') {
            break;
        }
        if (row.kind === 'text' && !VERSE_NUMBER.test(row.text)) {
            indents.push(row.text.length - row.text.trimStart().length);
        }
    }
    const indent = indents.length > 0 ? Math.min(...indents) : null;

    return indent !== null && indent >= prefix && indent <= prefix + 6 ? indent : null;
}

/**
 * A sheet laid out in two columns (some songs are printed that way): the lines of both columns
 * come joined, chords included. Finds the gutter, a run of at least three columns where no
 * line has anything, and reads the left column and then the right. Without such a gutter, or
 * when one side is nearly empty, the lines are left alone.
 */
function splitColumns(lines: string[]): { lines: string[]; split: boolean } {
    const filled = lines.filter((line) => line.trim() !== '');
    const width = Math.max(0, ...lines.map((line) => line.length));
    if (filled.length < 8 || width < 40) {
        return { lines, split: false };
    }

    const used = new Array<number>(width).fill(0);
    for (const line of filled) {
        for (let i = 0; i < line.length; i++) {
            if (line.charAt(i) !== ' ') {
                used[i] = (used[i] ?? 0) + 1;
            }
        }
    }

    let gutter: { start: number; end: number } | null = null;
    for (let i = Math.floor(width * 0.3); i < Math.ceil(width * 0.7); ) {
        if (used[i] !== 0) {
            i++;
            continue;
        }
        let end = i;
        while (end < width && used[end] === 0) {
            end++;
        }
        if (end - i >= 3 && (gutter === null || end - i > gutter.end - gutter.start)) {
            gutter = { start: i, end };
        }
        i = end;
    }
    if (gutter === null) {
        return { lines, split: false };
    }

    const { start, end } = gutter;
    const left = filled.filter((line) => line.slice(0, start).trim() !== '').length;
    const right = filled.filter((line) => line.slice(end).trim() !== '').length;
    if (left < filled.length * 0.3 || right < filled.length * 0.3) {
        return { lines, split: false };
    }

    const side = (cut: (line: string) => string): string[] => {
        const part = lines.map((line) => cut(line).replace(/\s+$/, ''));
        while (part.length > 0 && part[part.length - 1] === '') {
            part.pop();
        }

        return part;
    };

    return { lines: [...side((line) => line.slice(0, start)), '', ...side((line) => line.slice(end))], split: true };
}

/**
 * Several songs in one text (a whole Mass printed one song per page): split where a page ends
 * (form feed, which PDF text carries) or, without page marks, where a line is plainly a header:
 * "PART:" with a colon, or a part's name alone on a line. "Santo, Santo, Santo" is a lyric, not
 * a header; a header never has a comma.
 */
export function splitSongs(source: string): string[] {
    const pages = source.split('\f').filter((page) => page.trim() !== '');
    if (pages.length > 1) {
        return pages;
    }

    const lines = (pages[0] ?? '').split(/\r\n|[\n\r\u2028\u2029]/);
    const songs: string[][] = [];
    lines.forEach((line, index) => {
        if (isStrongHeader(line, lines, index) && songs.length > 0 && (songs[songs.length - 1] ?? []).some((l) => l.trim() !== '')) {
            songs.push([]);
        }
        if (songs.length === 0) {
            songs.push([]);
        }
        songs[songs.length - 1]?.push(line);
    });

    return songs.map((song) => song.join('\n')).filter((song) => song.trim() !== '');
}

/** A line that opens a song: a part's name with a colon, alone, or after a blank with chords below */
function isStrongHeader(line: string, lines: string[], index: number): boolean {
    const text = prepare(line).trim();
    if (text === '' || text.includes(',') || isChordLine(text) || partOf(text) === null) {
        return false;
    }
    if (/^[^:]{2,30}:/.test(text) || MASS_PARTS.some((part) => part.aliases.includes(plain(text)))) {
        return true;
    }
    // "Santo Alegre": no colon, but set apart: a blank line above and chords right below
    const above = lines[index - 1];
    const below = lines.slice(index + 1).find((l) => l.trim() !== '');

    return (index === 0 || above?.trim() === '') && below !== undefined && isChordLine(prepare(below)) && text.length <= 60;
}

/** Every song in a text: one per page of a PDF, or one if there is no sign of more */
export function importMany(source: string): Imported[] {
    return splitSongs(source).map((song) => importChordsOverLyrics(song));
}
