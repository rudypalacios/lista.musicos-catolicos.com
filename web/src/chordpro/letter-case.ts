/**
 * Changes the case of the words of a song written in ChordPro, for the editor's format buttons: minúsculas, MAYÚSCULAS and
 * Tipo oración. Only the lyrics change: the chords ([G]), the directives ({c: Coro}, {ci: bis}) and the "#" lines are left
 * exactly as they are, and a chord in the middle of a word does not split it ("se[D]ñor" is one word). Pure: text in, text out.
 */

export type CaseMode = 'lower' | 'upper' | 'sentence';

/** Words of the faith that keep their capital in "Tipo oración": a song is full of them and lowercase reads as a mistake */
const NAMES = ['dios', 'señor', 'jesús', 'jesucristo', 'cristo', 'espíritu santo', 'maría', 'emmanuel'];
const NAME = new RegExp(`(?<![\\p{L}\\p{N}])(${NAMES.join('|')})(?![\\p{L}\\p{N}])`, 'giu');

/** What the person sees as a piece of the text: something that is left alone (a chord, a directive, a "#" line) or words */
interface Piece {
    text: string;
    opaque: boolean;
}

/** A chord or a directive: never split across lines */
const OPAQUE = /(\[[^\]\n]*\]|\{[^}\n]*\})/;

/** One character, in the other case, only when it stays one character (ß, ŉ… would change the length of the text) */
const lowerOf = (char: string): string => {
    const lower = char.toLowerCase();

    return lower.length === char.length ? lower : char;
};
const upperOf = (char: string): string => {
    const upper = char.toUpperCase();

    return upper.length === char.length ? upper : char;
};

const isLetter = (char: string): boolean => /\p{L}/u.test(char);

/** The text as pieces: words, and what is left alone */
function split(text: string): Piece[] {
    const pieces: Piece[] = [];
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (line.trimStart().startsWith('#')) {
            pieces.push({ text: line, opaque: true });
        } else {
            for (const part of line.split(OPAQUE)) {
                if (part !== '') {
                    pieces.push({ text: part, opaque: /^[[{]/.test(part) && OPAQUE.test(part) });
                }
            }
        }
        if (index < lines.length - 1) {
            pieces.push({ text: '\n', opaque: false });
        }
    });

    return pieces;
}

/** A line that is only a directive ({c: Verso 1}): the words after it start a new paragraph */
const isDirectiveLine = (line: string): boolean => /^\s*\{[^}\n]*\}\s*$/.test(line);

/**
 * `text` with its words in the case `mode` says.
 *
 * - `lower` / `upper`: every word.
 * - `sentence`: lowercase, then a capital at the start of the text, of every paragraph (after a blank line or a directive
 *   line such as {c: Coro}), after . ! ? … and after ¿ ¡, and on the names of the faith (Dios, Señor, Jesús…).
 *
 * The length never changes, so a chord keeps its place in the word it was in.
 */
export function changeCase(text: string, mode: CaseMode): string {
    const pieces = split(text);
    // The words as one string (the chords out of the way), remembering where each character came from
    const flow: string[] = [];
    const origin: ({ piece: number; at: number } | null)[] = [];
    let line = '';
    pieces.forEach((piece, pieceIndex) => {
        if (piece.text === '\n') {
            if (isDirectiveLine(line)) {
                // A paragraph begins after it, as after a blank line
                flow.push('\n', '\n');
                origin.push(null, null);
            }
            line = '';
        } else {
            line += piece.text;
        }
        if (!piece.opaque) {
            [...piece.text].forEach((char, at) => {
                flow.push(char);
                origin.push({ piece: pieceIndex, at });
            });
        }
    });
    if (isDirectiveLine(line)) {
        flow.push('\n', '\n');
        origin.push(null, null);
    }

    let changed = flow.map((char) => (mode === 'upper' ? upperOf(char) : lowerOf(char)));
    if (mode === 'sentence') {
        let capital = true;
        let breaks = 0;
        changed = changed.map((char) => {
            if (char === '\n') {
                breaks++;
                capital = capital || breaks >= 2;

                return char;
            }
            if (/\s/u.test(char)) {
                return char;
            }
            breaks = 0;
            if (capital && isLetter(char)) {
                capital = false;

                return upperOf(char);
            }
            if (/[.!?…¿¡]/u.test(char)) {
                capital = true;
            } else if (!/["'«»“”‘’(]/u.test(char)) {
                capital = false;
            }

            return char;
        });
        const joined = changed.join('').replace(NAME, (name) => name.replace(/(^|\s)(\p{L})/gu, (_all, space: string, first: string) => space + upperOf(first)));
        changed = [...joined];
    }

    // Back to the pieces they came from
    const rebuilt = pieces.map((piece) => [...piece.text]);
    changed.forEach((char, index) => {
        const from = origin[index];
        if (from !== null && from !== undefined) {
            (rebuilt[from.piece] as string[])[from.at] = char;
        }
    });

    return rebuilt.map((chars) => chars.join('')).join('');
}

/**
 * The same, for the lines a selection touches (`from` and `to` are offsets in `text`): a selection that starts or ends in
 * the middle of a line takes the whole line, so a chord is never cut in two. Returns the new text and the new range.
 */
export function changeCaseInRange(text: string, from: number, to: number, mode: CaseMode): { text: string; from: number; to: number } {
    const start = text.lastIndexOf('\n', Math.max(0, from) - 1) + 1;
    const end = text.indexOf('\n', Math.max(to, from));
    const stop = end < 0 ? text.length : end;
    const changed = changeCase(text.slice(start, stop), mode);

    return { text: text.slice(0, start) + changed + text.slice(stop), from: start, to: start + changed.length };
}
