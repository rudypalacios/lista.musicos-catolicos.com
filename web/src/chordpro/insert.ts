/**
 * What the editor's "Insertar" menu writes into the lyrics (a ChordPro text), for the cursor or for a selection. Pure: the
 * text and the selection in, the new text and the new selection out.
 *
 * - Sección `{c: }` and Indicación `{ci: }`: on a line of its own with the cursor inside the braces; with text selected, the
 *   lines selected become the label or the note ("Coro" → `{c: Coro}`).
 * - Coro `{soc}` … `{eoc}`: the pair with the cursor between; with text selected, the opening goes before the first selected
 *   line and the closing after the last, and the lines stay selected between them.
 * - Capo `{capo: }`, Tempo `{tempo: }` and Compás `{time: }` are notes above the lyrics: they go at the top of the text, whatever
 *   the cursor, and when the song already has one the cursor goes to its value instead of writing a second.
 */
import { lineRange } from './lines.ts';

export type InsertKind = 'section' | 'note' | 'chorus' | 'capo' | 'tempo' | 'time';

export interface Edit {
    text: string;
    /** The selection after the edit (a cursor when both are equal) */
    from: number;
    to: number;
}

const DIRECTIVE: Readonly<Record<InsertKind, string>> = { section: 'c', note: 'ci', chorus: 'soc', capo: 'capo', tempo: 'tempo', time: 'time' };

/** The notes that go above the lyrics */
const ABOVE: readonly InsertKind[] = ['capo', 'tempo', 'time'];

export function insertItem(text: string, from: number, to: number, kind: InsertKind): Edit {
    if (ABOVE.includes(kind)) {
        return aboveTheLyrics(text, DIRECTIVE[kind]);
    }
    if (from !== to) {
        return kind === 'chorus' ? wrapLines(text, from, to) : turnIntoDirective(text, from, to, DIRECTIVE[kind]);
    }

    return atCursor(text, from, kind);
}

function aboveTheLyrics(text: string, name: string): Edit {
    const existing = new RegExp(`^(\\{${name}:[ \\t]*)([^}\\n]*)\\}`, 'm').exec(text);
    if (existing !== null) {
        const start = existing.index + (existing[1] ?? '').length;

        return { text, from: start, to: start + (existing[2] ?? '').length };
    }
    const note = `{${name}: }`;
    const caret = `{${name}: `.length;

    return { text: `${note}\n${text}`, from: caret, to: caret };
}

function atCursor(text: string, at: number, kind: InsertKind): Edit {
    const name = DIRECTIVE[kind];
    const block = kind === 'chorus' ? '{soc}\n\n{eoc}' : `{${name}: }`;
    const inside = kind === 'chorus' ? '{soc}\n'.length : `{${name}: `.length;
    // On a line of its own
    const lead = at > 0 && text.charAt(at - 1) !== '\n' ? '\n' : '';
    const tail = at < text.length && text.charAt(at) !== '\n' ? '\n' : '';
    const caret = at + lead.length + inside;

    return { text: text.slice(0, at) + lead + block + tail + text.slice(at), from: caret, to: caret };
}

/** `{soc}` before the first selected line and `{eoc}` after the last; the lines stay selected */
function wrapLines(text: string, from: number, to: number): Edit {
    const { start, end } = lineRange(text, from, to);
    const open = '{soc}\n';

    return { text: `${text.slice(0, start)}${open}${text.slice(start, end)}\n{eoc}${text.slice(end)}`, from: start + open.length, to: end + open.length };
}

/** The lines selected become the label or the note: one line of words, without the directive they may already be */
function turnIntoDirective(text: string, from: number, to: number, name: string): Edit {
    const { start, end } = lineRange(text, from, to);
    const words = text.slice(start, end).replace(/\s*\n\s*/g, ' ').trim().replace(/^\{(?:c|ci):\s*([^}]*)\}$/, '$1');
    const made = `{${name}: ${words}}`;
    const caret = start + made.length;

    return { text: text.slice(0, start) + made + text.slice(end), from: caret, to: caret };
}
