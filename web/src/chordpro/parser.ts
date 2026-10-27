/**
 * Reads a song's lyrics written in ChordPro (https://www.chordpro.org), the subset an editor
 * needs. Ported line by line from ChordPro.php of musicos-catolicos, which decides what every
 * directive means; the golden fixtures keep the two identical (see scripts/fixtures).
 *
 *     {key: G}   {capo: 2}   {tempo: 72}   {time: 4/4}        ← the note above the lyrics
 *     {c: Verso 1}                                            ← a labelled section
 *     [G]Cuánto he es[D]perado este [Em]momento
 *     {ci: x2}                                                ← an annotation in the stanza
 *                                                             ← a blank line ends a stanza
 *     {soc} … {eoc}                                           ← chorus ("Coro" unless labelled)
 *
 * Every section has a kind, which the page shows differently:
 *
 * - chorus: {soc} … {eoc} (or {start_of_chorus}), which may hold several stanzas separated by
 *   blank lines; a section labelled "Coro" / "Estribillo" ({c: Coro}, one stanza); and
 *   {chorus}, "repeat the chorus": its label alone.
 * - other: {sob} … {eob} (bridge, "Puente" unless labelled), and sections labelled Puente,
 *   Intro, Interludio, Precoro, Final, Solo, Instrumental… (OTHER_LABELS).
 * - verse: {sov} … {eov}, sections labelled "Verso" / "Estrofa", any other label, and stanzas
 *   without a label.
 *
 * Annotations ({ci: …}, {comment_italic: …}) are lines of the stanza they are in ("x2",
 * "Repetir coro"), not sections. Chords are optional: lyrics without any [chord] are plain
 * lyrics. "#" lines are comments. Other directives ({title}, {artist}…) are ignored: those
 * come from the song's own fields.
 *
 * Pure: text in, plain data out (sheet.ts renders it).
 */
import { english, key as chordKey } from './chord.ts';
import { ltrim, rtrim, trim } from './php.ts';

export type SectionKind = 'verse' | 'chorus' | 'other';

/** A chord (English notation, or null) and the text sung from it */
export interface Segment {
    chord: string | null;
    text: string;
}

/** A line of sung segments, or an annotation ("x2") */
export type Line = Segment[] | string;

export interface Section {
    label: string | null;
    kind: SectionKind;
    lines: Line[];
}

export interface Sheet {
    sections: Section[];
    meta: Record<string, string>;
    hasChords: boolean;
    firstChord: string | null;
}

/** Metadata directives shown in the note above the lyrics */
const META: Readonly<Record<string, string>> = { key: 'key', capo: 'capo', tempo: 'tempo', time: 'time' };

/** Directives that label a new section */
const LABELS = ['c', 'comment', 'cb', 'comment_box'];

/** Directives that add an annotation line to the current stanza */
const ANNOTATIONS = ['ci', 'comment_italic'];

/** Environment directive → [its end directive, default label, kind] */
const ENVIRONMENTS: Readonly<Record<string, readonly [string, string | null, SectionKind]>> = {
    soc: ['eoc', 'Coro', 'chorus'],
    start_of_chorus: ['end_of_chorus', 'Coro', 'chorus'],
    sov: ['eov', null, 'verse'],
    start_of_verse: ['end_of_verse', null, 'verse'],
    sob: ['eob', 'Puente', 'other'],
    start_of_bridge: ['end_of_bridge', 'Puente', 'other'],
};

/** First word of a label (lower case, without accents) that only says "a verse" */
const VERSE_LABELS = ['verso', 'estrofa', 'verse', 'stanza', 'estr'];

/** First word of a label that makes the section a chorus */
const CHORUS_LABELS = ['coro', 'estribillo', 'chorus', 'refrain'];

/** First word of a label that makes the section neither verse nor chorus */
const OTHER_LABELS = [
    'puente', 'bridge', 'intro', 'introduccion', 'interludio', 'interlude', 'pre', 'precoro',
    'prechorus', 'final', 'outro', 'coda', 'ending', 'solo', 'instrumental', 'tag',
];

const END_DIRECTIVES = Object.values(ENVIRONMENTS).map(([end]) => end);

/** PCRE's \R: a line break of any kind, \r\n as one */
const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/;

/** `{name: value}` on a line of its own. PHP's \s is ASCII only, hence the explicit class */
const DIRECTIVE = /^[ \t\n\v\f\r]*\{[ \t\n\v\f\r]*([a-z_]+)[ \t\n\v\f\r]*(?::[ \t\n\v\f\r]*(.*?))?[ \t\n\v\f\r]*\}[ \t\n\v\f\r]*$/i;

export function parse(source: string | null | undefined): Sheet {
    const sheet: Sheet = { sections: [], meta: {}, hasChords: false, firstChord: null };
    // The section new lines go to; null = the next line opens a new, unlabelled one
    let current: number | null = null;
    // The kind of the open environment ({soc} … {eoc}), which outlives blank lines
    let environment: SectionKind | null = null;

    for (const raw of (source ?? '').split(LINE_BREAK)) {
        const line = rtrim(raw);

        if (ltrim(line) === '') {
            // A blank line ends the stanza, unless the section has no lines yet ({c: Coro} + blank)
            if (current !== null && (sheet.sections[current]?.lines.length ?? 0) > 0) {
                current = null;
            }
            continue;
        }
        if (ltrim(line).startsWith('#')) {
            continue;
        }

        const directive = DIRECTIVE.exec(line);
        if (directive !== null) {
            const name = (directive[1] ?? '').toLowerCase();
            const value = trim(directive[2] ?? '');

            if (name in META) {
                if (value !== '') {
                    sheet.meta[META[name] ?? name] = value;
                }
            } else if (LABELS.includes(name)) {
                const label = value !== '' ? value : null;
                const kind: SectionKind = environment ?? (label !== null ? kindOf(label) : 'verse');
                current = openSection(sheet, current, label, kind);
            } else if (ANNOTATIONS.includes(name)) {
                if (value !== '') {
                    current ??= openSection(sheet, null, null, environment ?? 'verse');
                    sheet.sections[current]?.lines.push(value);
                }
            } else if (name in ENVIRONMENTS) {
                const [, defaultLabel, kind] = ENVIRONMENTS[name] as readonly [string, string | null, SectionKind];
                environment = kind;
                current = openSection(sheet, current, value !== '' ? value : defaultLabel, kind);
            } else if (END_DIRECTIVES.includes(name)) {
                environment = null;
                current = null;
            } else if (name === 'chorus') {
                // "Repeat the chorus": its label, with no lines
                openSection(sheet, current, value !== '' ? value : 'Coro', 'chorus');
                current = null;
            }
            continue;
        }

        const segments = segmentsOf(line);
        for (const segment of segments) {
            if (segment.chord !== null) {
                sheet.hasChords = true;
                sheet.firstChord ??= segment.chord;
            }
        }

        // Inside {soc} … {eoc}, a stanza after a blank line is still the chorus
        current ??= openSection(sheet, null, null, environment ?? 'verse');
        sheet.sections[current]?.lines.push(segments);
    }

    return sheet;
}

/**
 * The kind of section a label names: "Coro 2" → chorus, "Intro" → other, "Verso 1" or
 * anything else → verse. Only its first word counts, without case or accents.
 */
export function kindOf(label: string): SectionKind {
    const first = firstWord(label);
    if (CHORUS_LABELS.includes(first)) {
        return 'chorus';
    }

    return OTHER_LABELS.includes(first) ? 'other' : 'verse';
}

/**
 * Whether a label only numbers a verse ("Verso 1", "Estrofa 2"): the printed sheet numbers the
 * verses itself and leaves these out. A verse label that says something else ("Solista",
 * "Todos") is kept.
 */
export function isVerseLabel(label: string): boolean {
    return VERSE_LABELS.includes(firstWord(label));
}

/**
 * The song's key: {key}, else the first chord's (its root, minor or major). Null without either.
 */
export function songKey(sheet: Pick<Sheet, 'meta' | 'firstChord'>): string | null {
    const declared = sheet.meta['key'] !== undefined ? chordKey(english(sheet.meta['key'])) : null;

    return declared ?? (sheet.firstChord !== null ? chordKey(sheet.firstChord) : null);
}

/**
 * "[G]Primera lí[D/F#]nea" → text before the first chord (if any), then one segment per chord
 * with the text sung from it.
 */
function segmentsOf(line: string): Segment[] {
    const parts = line.split(/\[([^\]]*)\]/);
    const first = parts[0] ?? '';
    const segments: Segment[] = first !== '' ? [{ chord: null, text: first }] : [];

    for (let i = 1; i < parts.length; i += 2) {
        const chord = trim(parts[i] ?? '');
        const text = parts[i + 1] ?? '';
        if (chord === '') {
            // "[]": no chord; the text belongs to the previous segment
            const previous = segments[segments.length - 1];
            if (previous === undefined) {
                segments.push({ chord: null, text });
            } else {
                previous.text += text;
            }
            continue;
        }
        segments.push({ chord: english(chord), text });
    }

    return segments;
}

/** A label's first word, in lower case and without accents */
function firstWord(label: string): string {
    const ascii = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    return ascii.split(/[^a-z]+/).find((word) => word !== '') ?? '';
}

/**
 * Starts a section and returns its index. An empty, unlabelled section that is still open (a
 * stanza that has not started) takes the label instead of leaving a gap.
 */
function openSection(sheet: Sheet, current: number | null, label: string | null, kind: SectionKind): number {
    if (current !== null) {
        const section = sheet.sections[current];
        if (section !== undefined && section.lines.length === 0 && section.label === null) {
            section.label = label;
            section.kind = kind;

            return current;
        }
    }

    sheet.sections.push({ label, kind, lines: [] });

    return sheet.sections.length - 1;
}
