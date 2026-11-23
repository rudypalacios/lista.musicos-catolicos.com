/**
 * The lines a selection touches in a text: where the first starts and where the last ends (`end` is at its newline, or the
 * end of the text). A selection that ends at the start of a line, as when a whole line is picked with its newline, does
 * not take the next one. Shared by the editor's format and insert tools, which work on whole lines so a chord is never cut.
 */
export function lineRange(text: string, from: number, to: number): { start: number; end: number } {
    const last = to > from && text.charAt(to - 1) === '\n' ? to - 1 : to;
    const start = text.lastIndexOf('\n', Math.max(0, from) - 1) + 1;
    const end = text.indexOf('\n', Math.max(last, from));

    return { start, end: end < 0 ? text.length : end };
}
