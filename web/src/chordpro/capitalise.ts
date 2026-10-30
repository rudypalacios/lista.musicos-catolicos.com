/**
 * Chords typed with a lowercase letter ([c], [am], [bb], [g/b]) are the English names the parser stores,
 * only not capitalised: the parser reads capitals (as the public site's does), so the editor capitalises them
 * when the text is previewed and saved. This is not part of the port: the parser itself still takes only what
 * it is given.
 *
 * Only a bracket that is wholly a chord is touched, so [bis] or [x2] stay as written.
 */

const LOWERCASE_CHORD = /^([a-g])([#b]?)((?:maj|min|dim|aug|sus|add|m|M|\+|°|-|\d|#|b|\(|\))*)(?:\/([a-g])([#b]?))?$/;

/** "[c]Hola [am7]mundo [g/b]" → "[C]Hola [Am7]mundo [G/B]" */
export function capitaliseChords(text: string): string {
    return text.replace(/\[([^\]]*)\]/g, (bracket: string, inner: string) => {
        const m = LOWERCASE_CHORD.exec(inner.trim());
        if (m === null) {
            return bracket;
        }
        const bass = m[4] === undefined ? '' : `/${m[4].toUpperCase()}${m[5] ?? ''}`;

        return `[${(m[1] ?? '').toUpperCase()}${m[2] ?? ''}${m[3] ?? ''}${bass}]`;
    });
}
