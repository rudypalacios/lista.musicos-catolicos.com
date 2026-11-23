/**
 * Changes the case of the words of a song written in ChordPro, for the editor's format buttons: minúsculas, MAYÚSCULAS and
 * Tipo oración. A chord ([Am]) and a directive ({c: Coro}) are left as they are: in capitals "Am" would become "AM", another
 * chord, and "{C: CORO}" would no longer be a directive. Pure: text in, text out.
 */

export type CaseMode = 'lower' | 'upper' | 'sentence';

/** A chord or a directive; as the pattern has a group, `split` returns them at the odd places */
const OPAQUE = /(\[[^\]\n]*\]|\{[^}\n]*\})/;

/**
 * `text` with its words in the case `mode` says. `sentence`: lowercase, with a capital at the start of the text, of every
 * paragraph (after a blank line, or after a directive line such as {c: Coro}) and of every sentence (after . ! ? … ¿ ¡).
 */
export function changeCase(text: string, mode: CaseMode): string {
    const parts = text.split(OPAQUE);
    if (mode !== 'sentence') {
        return parts.map((part, index) => (index % 2 === 1 ? part : mode === 'upper' ? part.toUpperCase() : part.toLowerCase())).join('');
    }

    let out = '';
    /** The next letter starts a sentence */
    let capital = true;
    let breaks = 0;
    for (const [index, part] of parts.entries()) {
        if (index % 2 === 1) {
            // A directive on a line of its own: what comes after it is a new paragraph
            capital = capital || (part.startsWith('{') && (out === '' || out.endsWith('\n')));
            out += part;
            continue;
        }
        for (const char of part.toLowerCase()) {
            breaks = char === '\n' ? breaks + 1 : /\s/u.test(char) ? breaks : 0;
            capital = capital || breaks >= 2;
            if (capital && /\p{L}/u.test(char)) {
                out += char.toUpperCase();
                capital = false;
            } else {
                capital = /[.!?…¿¡]/u.test(char) || (capital && !/\d/u.test(char));
                out += char;
            }
        }
    }

    return out;
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
