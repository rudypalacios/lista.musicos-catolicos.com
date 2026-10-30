/**
 * Chord names, ported from Chord.php (storage, Latin names, key) and song.js (transposition)
 * of musicos-catolicos. Songs store chords in English notation (C, F#m7, D/F#); people see
 * Latin (Do, Fa#m7, Re/Fa#) by default. Only the root and the bass note change; the rest of
 * the name (m, 7, sus4, maj7…) stays as written. Checked against golden fixtures made by the
 * PHP and the browser code themselves (see scripts/fixtures).
 */
import { trim } from './php.ts';

export type Notation = 'latin' | 'english';

const LATIN: Readonly<Record<string, string>> = {
    C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si',
};

/** Root, quality and optional bass: "F#m7/C#" → F, #, m7, C, # */
const ENGLISH_PATTERN = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/;

/**
 * The same with Latin note names, for editors who type [Sol] instead of [G]. Only "Fa" can
 * be read as an English chord too (F + add9, F + aug): those stay English.
 */
const LATIN_PATTERN = /^(Do|Re|Mi|Fa(?!dd|ug)|Sol|La|Si)([#b]?)([^/]*)(?:\/(Do|Re|Mi|Fa|Sol|La|Si)([#b]?))?$/i;

const ENGLISH_OF: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(LATIN).map(([english, latin]) => [latin.toLowerCase(), english]),
);

/**
 * A chord in parentheses ("(G)": played only on some repetitions). The parentheses are kept in every
 * notation and through transposition; the chord inside is read like any other.
 */
const OPTIONAL_PATTERN = /^\([ \t\n\v\f\r]*([^()]+?)[ \t\n\v\f\r]*\)$/;

/** Chromatic scale for transposing: flats for the black keys, as the site does */
const SCALE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const SEMITONE: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * The chord in English notation, as it is stored. A chord typed with Latin names is
 * converted; anything else that is not a chord ("N.C.", "x2") is returned trimmed and unchanged.
 */
export function english(chord: string): string {
    // Latin first: "Fa#m7" would also match the English pattern (F + "a#m7")
    const name = trim(chord);
    const optional = OPTIONAL_PATTERN.exec(name);
    if (optional !== null) {
        return `(${english(optional[1] ?? '')})`;
    }
    const m = LATIN_PATTERN.exec(name);
    if (m === null) {
        return name;
    }
    const root = ENGLISH_OF[(m[1] ?? '').toLowerCase()] ?? '';
    const bass = m[4] ?? '';

    return root + (m[2] ?? '') + (m[3] ?? '') + (bass !== '' ? '/' + (ENGLISH_OF[bass.toLowerCase()] ?? '') + (m[5] ?? '') : '');
}

/** "F#m7/C#" → "Fa#m7/Do#". Only the note names change; unknown names are returned as is. */
export function latin(chord: string): string {
    const optional = OPTIONAL_PATTERN.exec(chord);
    if (optional !== null) {
        return `(${latin(optional[1] ?? '')})`;
    }
    const m = ENGLISH_PATTERN.exec(chord);
    if (m === null) {
        return chord;
    }
    const bass = m[4] ?? '';

    return (LATIN[m[1] ?? ''] ?? '') + (m[2] ?? '') + (m[3] ?? '')
        + (bass !== '' ? '/' + (LATIN[bass] ?? '') + (m[5] ?? '') : '');
}

/**
 * The key a chord stands for: its root, plus "m" when it is minor. "Em7" → "Em",
 * "Cmaj7" → "C", "D/F#" → "D". Null when it is not a chord.
 */
export function key(chord: string): string | null {
    const optional = OPTIONAL_PATTERN.exec(chord);
    if (optional !== null) {
        return key(optional[1] ?? '');
    }
    const m = ENGLISH_PATTERN.exec(chord);
    if (m === null) {
        return null;
    }
    const minor = /^m(?!aj)/.test(m[3] ?? '');

    return (m[1] ?? '') + (m[2] ?? '') + (minor ? 'm' : '');
}

/** One note moved by `shift` semitones, in the given notation (song.js `note`) */
function note(letter: string, accidental: string, shift: number, notation: Notation): string {
    let name: string;
    if (shift === 0) {
        name = letter + accidental; // untransposed: exactly as written (D# stays D#)
    } else {
        const index = (SEMITONE[letter] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + shift;
        name = SCALE[((index % 12) + 12) % 12] ?? letter;
    }

    return notation === 'latin' ? (LATIN[name.charAt(0)] ?? '') + name.slice(1) : name;
}

/**
 * A stored (English) chord moved by `shift` semitones and written in `notation`: "D/F#"
 * +2 → "E/G#". Anything that is not a chord stays as written (song.js `chordName`).
 */
export function transpose(chord: string, shift: number, notation: Notation): string {
    const optional = OPTIONAL_PATTERN.exec(chord);
    if (optional !== null) {
        return `(${transpose(optional[1] ?? '', shift, notation)})`;
    }
    const m = ENGLISH_PATTERN.exec(chord);
    if (m === null) {
        return chord;
    }
    const bass = m[4];

    return note(m[1] ?? '', m[2] ?? '', shift, notation) + (m[3] ?? '')
        + (bass !== undefined ? '/' + note(bass, m[5] ?? '', shift, notation) : '');
}
