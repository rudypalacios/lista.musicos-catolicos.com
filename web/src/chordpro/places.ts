/**
 * Where a chord can be put in a song's text, for the editor's preview: every syllable of every line of lyrics, and every
 * chord already written (to change it or take it out). Pure: the text in, the places and the new text out.
 *
 * The preview draws each place as its own piece (`.seg`), so a person touches the syllable instead of typing `[G]`. A
 * chord is a `[bracket]` written just before the text sung from it, so putting a chord at a place is writing a bracket
 * at that offset of the text, and changing or taking one out is editing the bracket that is already there.
 *
 *     "Cuán[G]to he es[D]perado"   →   Cuán · [G]to · he · es · [D]pe · ra · do
 *
 * A place is named `line:plain:k`: the line among the lines of lyrics, where the piece starts in that line's words (the
 * chords left out, so it does not move when a chord is written), and `k` for the chords that share that spot ("[G][D]más":
 * the G has nothing to sing and is the first). The name survives writing a chord on a place, which is what lets the sheet
 * of chords stay on it.
 *
 * What counts as a line of lyrics is what `parse` says: this module asks it, line by line, so the two cannot disagree.
 */
import { english } from './chord.ts';
import { parse, type Segment } from './parser.ts';
import { rtrim, trim } from './php.ts';
import { syllableStarts } from './syllable-starts.ts';

/** A piece of a line of lyrics: a chord (or none) and the text sung from it, up to the next place */
export interface Piece {
    /** Where it is: `line:plain:k` */
    id: string;
    /** The chord in English notation, or null when the piece has none */
    chord: string | null;
    text: string;
    /** Whether a chord can be put here or the one here changed: the start of a syllable, the space between two words, or a chord already written */
    place: boolean;
    /** Where the chord's `[bracket]` is in the text, [from, to), or null without a chord */
    bracket: readonly [number, number] | null;
    /** Where a chord written for this piece goes: just before its text */
    at: number;
}

/** A line of lyrics, with its pieces */
export interface LinePieces {
    /** The note at its end ({ci: bis}), which belongs to the line */
    note: string | null;
    pieces: Piece[];
}

/** PCRE's \R, as the parser splits lines */
const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/g;

const BRACKET = /\[([^\]]*)\]/g;

/** The lines of lyrics of a text, in order, each cut into pieces */
export function linesOf(source: string): LinePieces[] {
    const lines: LinePieces[] = [];
    let start = 0;
    const read = (end: number): void => {
        const found = linePieces(source.slice(start, end), start, lines.length);
        if (found !== null) {
            lines.push(found);
        }
    };
    for (const match of source.matchAll(LINE_BREAK)) {
        read(match.index);
        start = match.index + match[0].length;
    }
    read(source.length);

    return lines;
}

/** Every piece of every line, in the order the preview draws them */
export function piecesOf(source: string): Piece[] {
    return linesOf(source).flatMap((line) => line.pieces);
}

/**
 * Puts a chord at a place (English notation), or takes the one there out with null. Returns the new text, or null when there
 * is no such place or nothing would change.
 */
export function setChordAt(source: string, id: string, chord: string | null): string | null {
    const piece = piecesOf(source).find((candidate) => candidate.id === id);
    if (piece === undefined) {
        return null;
    }
    if (piece.bracket !== null) {
        const [from, to] = piece.bracket;
        const next = `${source.slice(0, from)}${chord === null ? '' : `[${chord}]`}${source.slice(to)}`;

        return next === source ? null : next;
    }
    if (chord === null || !piece.place) {
        return null;
    }

    return `${source.slice(0, piece.at)}[${chord}]${source.slice(piece.at)}`;
}

/**
 * The line as pieces, or null when it is not a line of lyrics (blank, a comment, a directive): `parse` decides, so a
 * line is a line of lyrics here exactly when it is one there.
 */
function linePieces(raw: string, lineStart: number, index: number): LinePieces | null {
    const line = rtrim(raw);
    const segments = parse(line).sections.flatMap((section) => section.lines).find((candidate): candidate is Segment[] => Array.isArray(candidate));
    if (segments === undefined) {
        return null;
    }
    // A note at the end ({ci: bis}) is the last "{" of the line: what is left of it is the lyrics
    const note = segments[segments.length - 1]?.note ?? null;
    const lyrics = (note === null ? line : line.slice(0, line.lastIndexOf('{'))).replace(/[ \t\n\v\f\r]+$/, '');

    // The words with the chords left out, where each of their characters is in the text, and where each chord stands in them
    let plain = '';
    const offsets: number[] = [];
    const markers: Array<{ plain: number; chord: string; from: number; to: number }> = [];
    let cursor = 0;
    const takeText = (until: number): void => {
        for (; cursor < until; cursor++) {
            plain += lyrics.charAt(cursor);
            offsets.push(lineStart + cursor);
        }
    };
    for (const match of lyrics.matchAll(BRACKET)) {
        takeText(match.index);
        // "[]" is no chord: the words go on as if it were not there
        if (trim(match[1] ?? '') !== '') {
            markers.push({ plain: plain.length, chord: english(trim(match[1] ?? '')), from: lineStart + match.index, to: lineStart + match.index + match[0].length });
        }
        cursor = match.index + match[0].length;
    }
    takeText(lyrics.length);

    // The space between two words is a place too: a note is sometimes played there, between "to" and "he"
    const gaps = [...plain.matchAll(/(?<=\S)\s+(?=\S)/gu)].map((match) => match.index);
    const cuts = [...new Set([0, ...syllableStarts(plain), ...gaps, ...markers.map((marker) => marker.plain)])].sort((a, b) => a - b);
    const pieces: Piece[] = [];
    for (const [position, cut] of cuts.entries()) {
        const text = plain.slice(cut, cuts[position + 1] ?? plain.length);
        const here = markers.filter((marker) => marker.plain === cut);
        // Chords with nothing sung from them ("[G][D]más": the G) are pieces of their own, before the one that has the words
        const alone = text === '' ? here : here.slice(0, -1);
        const withText = text === '' ? [] : here.slice(-1);
        const make = (marker: (typeof markers)[number] | undefined, words: string): Piece => ({
            id: `${index}:${cut}:${pieces.filter((piece) => piece.id.startsWith(`${index}:${cut}:`)).length}`,
            chord: marker?.chord ?? null,
            text: words,
            place: marker !== undefined || /^\S/u.test(words) || gaps.includes(cut),
            bracket: marker === undefined ? null : [marker.from, marker.to],
            at: offsets[cut] ?? lineStart + lyrics.length,
        });
        for (const marker of alone) {
            pieces.push(make(marker, ''));
        }
        if (text !== '' || here.length === 0) {
            pieces.push(make(withText[0], text));
        }
    }

    return { note, pieces };
}
