/**
 * The text of a song with every chord moved by `by` semitones: the way to make a new key the one the song is
 * written in. Not part of the port (the public site never rewrites a song): the parser and `transpose` are
 * what read and move one chord, this only walks the text.
 *
 * What moves: a bracket that is wholly a chord ("[Am7/G]", "[(D)]", also typed in Latin) and the `{key: …}`
 * directive. Everything else (lyrics, "[x2]", "[bis]", other directives, blank lines) is left byte for byte.
 */
import { english, key, transpose } from './chord.ts';

const BRACKET = /\[([^\]]*)\]/g;
const KEY_DIRECTIVE = /\{([ \t]*key[ \t]*:[ \t]*)([^{}]*?)([ \t]*)\}/gi;

/** The chord (English, as stored) moved, or null when what is written is not a chord */
function moved(written: string, by: number): string | null {
    const name = english(written);

    return key(name) === null ? null : transpose(name, by, 'english');
}

/** "[G]Hola [Em]mundo" +2 → "[A]Hola [F#m]mundo"; `by` 0 gives the text back as it is */
export function transposeBody(text: string, by: number): string {
    if (by === 0) {
        return text;
    }

    return text
        .replace(BRACKET, (bracket: string, inner: string) => {
            const chord = moved(inner, by);

            return chord === null ? bracket : `[${chord}]`;
        })
        .replace(KEY_DIRECTIVE, (directive: string, head: string, value: string, tail: string) => {
            const chord = moved(value, by);

            return chord === null ? directive : `{${head}${chord}${tail}}`;
        });
}
