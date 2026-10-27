/**
 * Turns a song pasted the way it is usually written, chords on their own line above the
 * words (from a document, a PDF or a chat), into ChordPro: the chords go inside the line, at
 * the column they were over.
 *
 *     ENTRADA: Vienen con alegría          →  title "Vienen con alegría", part "entrada"
 *     C            Am
 *     1. Vienen trayendo la esperanza,     →  {c: Verso 1}
 *                                              [C]Vienen trayendo [Am]la esperanza,
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

export function importChordsOverLyrics(source: string): Imported {
    const warnings: string[] = [];
    const rows = classify(source.split(/\r\n|[\n\r\u2028\u2029]/).map(prepare));

    const header = takeHeader(rows);
    const lines: string[] = [];
    let normalised = 0;

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

        let text = lyricRow?.text ?? '';
        let offset = 0;
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
            offset = verse[0].length;
            text = text.slice(offset);
        }

        if (chordRow === null) {
            lines.push(text);
            continue;
        }
        const placed = place(chordRow.text, text, offset, lyricRow === null);
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

/** Tabs to spaces (4-column stops, so columns still line up), no non-breaking spaces, no trailing space */
function prepare(line: string): string {
    let column = 0;
    let out = '';
    for (const char of line.replace(/ /g, ' ')) {
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
    const bare = token.replace(/^\(+/, '').replace(/\)+$/, '');
    if (bare === '' || !/^[A-Z]/.test(bare)) {
        return null;
    }
    const candidate = english(bare.replace(MINOR_DASH, 'm'));

    return CHORD_SHAPE.test(candidate) ? candidate : null;
}

/**
 * The first line, if it says what the song is: "ENTRADA: Vienen con alegría", "GLORIA",
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
        // "ENTRADA: Vienen con alegría": the song is what follows the colon
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
 * Puts each chord of `chords` inside `lyric` at the column it was over. `offset` is how many
 * characters were cut from the start of the lyric line (a verse number), which the chord line
 * is still aligned to.
 */
function place(chords: string, lyric: string, offset: number, chordsOnly: boolean) {
    const warnings: string[] = [];
    let normalised = 0;
    const found: { column: number; chord: string }[] = [];
    for (const match of chords.matchAll(/\S+/g)) {
        const chord = chordOf(match[0]);
        if (chord === null) {
            continue;
        }
        if (chord !== match[0].replace(/^\(+|\)+$/g, '')) {
            normalised++;
        }
        found.push({ column: match.index ?? 0, chord });
    }

    if (chordsOnly) {
        return { line: found.map((f) => `[${f.chord}]`).join(' '), normalised, warnings };
    }

    // Every position is read on the lyric as it was written; inserting from the last chord to the
    // first keeps the earlier columns right
    const length = lyric.length;
    const spots = found.map(({ column, chord }, order) => ({ at: snap(lyric, Math.max(0, column - offset)), chord, order }));
    const tail = spots.filter((spot) => spot.at >= length).map((spot) => `[${spot.chord}]`);
    let line = lyric;
    const inside = spots.filter((spot) => spot.at < length).sort((a, b) => b.at - a.at || b.order - a.order);
    for (const { at, chord } of inside) {
        line = `${line.slice(0, at)}[${chord}]${line.slice(at)}`;
    }
    if (tail.length > 0) {
        line += tail.join(' ');
    }

    return { line, normalised, warnings };
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
