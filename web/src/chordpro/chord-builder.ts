/**
 * A chord put together from its pieces instead of typed or picked from a list (there are too many): the note, a sharp or flat,
 * a number, the terms (m, maj, dim, aug, sus2, sus4, add9), a note of the bass, and "otro" for anything else. Pure and
 * immutable: every step returns a new builder.
 *
 *     { root: 'D', accidental: 0, number: '7', terms: ['sus4'], bass: null }   →   "D7sus4"
 *
 * The name comes out in English notation, as songs store it, and with the app's spelling of the black keys (C# D# F# G# Bb:
 * `transpose` applies it), whatever notation the person reads.
 */
import { transpose } from './chord.ts';

export const NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export const NUMBERS = ['5', '6', '7', '9', '11', '13'] as const;
export const TERMS = ['m', 'maj', 'dim', 'aug', 'sus2', 'sus4', 'add9'] as const;

export type Note = (typeof NOTES)[number];
export type Term = (typeof TERMS)[number];
/** 1 a sharp, -1 a flat, 0 neither */
export type Accidental = -1 | 0 | 1;

export interface Builder {
    root: Note | null;
    accidental: Accidental;
    /** One of NUMBERS, or '' */
    number: string;
    terms: readonly Term[];
    /** Anything else, as typed ("(b5)", "6/9"), written after the rest */
    extra: string;
    bass: { root: Note | null; accidental: Accidental } | null;
}

/** What each term rules out: a chord is minor or diminished or augmented, and has one sus */
const EXCLUDES: Readonly<Record<string, readonly Term[]>> = { m: ['dim', 'aug'], dim: ['m', 'aug'], aug: ['m', 'dim'], sus2: ['sus4'], sus4: ['sus2'] };

/** The numbers a "maj" can go with: the others read as a major seventh */
const MAJOR_NUMBERS = ['7', '9', '11', '13'];

/** What cannot be in a chord written in brackets */
const NOT_ALLOWED = /[^\w#/+()-]/g;

export function blank(): Builder {
    return { root: null, accidental: 0, number: '', terms: [], extra: '', bass: null };
}

export function setRoot(builder: Builder, root: Note): Builder {
    return { ...builder, root };
}

export function toggleAccidental(builder: Builder, accidental: 1 | -1): Builder {
    return { ...builder, accidental: builder.accidental === accidental ? 0 : accidental };
}

export function toggleNumber(builder: Builder, number: string): Builder {
    return { ...builder, number: builder.number === number ? '' : number };
}

export function toggleTerm(builder: Builder, term: Term): Builder {
    if (builder.terms.includes(term)) {
        return { ...builder, terms: builder.terms.filter((other) => other !== term) };
    }

    return { ...builder, terms: [...builder.terms.filter((other) => !(EXCLUDES[term] ?? []).includes(other)), term] };
}

export function setExtra(builder: Builder, text: string): Builder {
    return { ...builder, extra: text.replace(NOT_ALLOWED, '') };
}

/** Opens the bass note (still with no note), or takes it away with whatever it had */
export function toggleBass(builder: Builder): Builder {
    return { ...builder, bass: builder.bass === null ? { root: null, accidental: 0 } : null };
}

export function setBassRoot(builder: Builder, root: Note): Builder {
    const bass = builder.bass ?? { root: null, accidental: 0 };

    return { ...builder, bass: { ...bass, root: bass.root === root ? null : root } };
}

export function toggleBassAccidental(builder: Builder, accidental: 1 | -1): Builder {
    const bass = builder.bass ?? { root: null, accidental: 0 };

    return { ...builder, bass: { ...bass, accidental: bass.accidental === accidental ? 0 : accidental } };
}

/** The chord in English notation, or '' while it has no note */
export function nameOf(builder: Builder): string {
    if (builder.root === null) {
        return '';
    }
    const bass = builder.bass?.root ?? null;

    return spell(builder.root, builder.accidental) + suffix(builder)
        + (bass === null || builder.bass === null ? '' : `/${spell(bass, builder.bass.accidental)}`);
}

/** The builder of a chord written in English notation, so a small change to it keeps all the rest. A name it cannot read gives a blank one. */
export function readChord(name: string): Builder {
    const match = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(name);
    if (match === null) {
        return blank();
    }
    let rest = match[3] ?? '';
    const terms: Term[] = [];
    const take = (term: Term): void => {
        if (rest.startsWith(term)) {
            terms.push(term);
            rest = rest.slice(term.length);
        }
    };
    take('dim');
    take('aug');
    take('maj');
    // "maj" is a term of its own, "m" before it is the minor of "mmaj7"
    if (terms.length === 0 && rest.startsWith('m') && !rest.startsWith('maj')) {
        terms.push('m');
        rest = rest.slice(1);
        take('maj');
    }
    // "maj" with no number after it is not a term of the builder (it would be written back as a major seventh): it stays as typed
    if (terms.includes('maj') && !/^(?:7|9|11|13)/.test(rest)) {
        terms.splice(terms.indexOf('maj'), 1);
        rest = `maj${rest}`;
    }
    const number = /^(?:5|6|7|9|11|13)/.exec(rest)?.[0] ?? '';
    rest = rest.slice(number.length);
    take('sus2');
    take('sus4');
    take('add9');

    return {
        root: match[1] as Note,
        accidental: accidentalOf(match[2]),
        number,
        terms: orderedTerms(terms),
        extra: rest,
        bass: match[4] === undefined ? null : { root: match[4] as Note, accidental: accidentalOf(match[5]) },
    };
}

function accidentalOf(sign: string | undefined): Accidental {
    return sign === '#' ? 1 : sign === 'b' ? -1 : 0;
}

/** The note with its sharp or flat, spelled as the app spells it */
function spell(root: Note, accidental: Accidental): string {
    return transpose(`${root}${accidental === 1 ? '#' : accidental === -1 ? 'b' : ''}`, 0, 'english');
}

/** m / dim / aug, then maj with its number, then sus and add, as chords are written: "Cmaj7", "Dm7", "G7sus4" */
function suffix(builder: Builder): string {
    const has = (term: Term): boolean => builder.terms.includes(term);
    const quality = (['m', 'dim', 'aug'] as const).filter(has).join('');
    const number = has('maj') ? `maj${MAJOR_NUMBERS.includes(builder.number) ? builder.number : '7'}` : builder.number;
    const added = (['sus2', 'sus4', 'add9'] as const).filter(has).join('');

    return `${quality}${number}${added}${builder.extra}`;
}

function orderedTerms(terms: readonly Term[]): Term[] {
    return TERMS.filter((term) => terms.includes(term));
}
