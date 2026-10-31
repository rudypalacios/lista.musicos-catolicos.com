/**
 * What the review of an import works out about each song, without touching the screen: how big it is,
 * which title the first line suggests, whether the person already has it, and what stops the save.
 */
import type { Song } from './data/types.ts';

/** Longest title suggested (the field itself allows more): a first line that long is a verse, not a name */
const SUGGESTED_TITLE_MAX = 80;

/** How many chords the song has and how many lines its text takes */
export function sizeOf(body: string): { chords: number; lines: number } {
    return {
        chords: (body.match(/\[[^\]]+\]/g) ?? []).length,
        lines: body === '' ? 0 : body.split('\n').length,
    };
}

/** "17 acordes · 36 líneas" */
export function sizeLabel(body: string): string {
    const { chords, lines } = sizeOf(body);

    return `${chords} ${chords === 1 ? 'acorde' : 'acordes'} · ${lines} ${lines === 1 ? 'línea' : 'líneas'}`;
}

/**
 * The first line of the lyrics, without chords or directives, as a title to offer when the sheet gave none.
 * Null when there is no such line. Cut at a word when it is too long.
 */
export function suggestedTitle(body: string): string | null {
    for (const raw of body.split('\n')) {
        const line = raw.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
        if (line === '' || line.startsWith('{') || line.startsWith('#')) {
            continue;
        }
        if (line.length <= SUGGESTED_TITLE_MAX) {
            return line;
        }
        const cut = line.slice(0, SUGGESTED_TITLE_MAX);

        return cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
    }

    return null;
}

/** Whether the person already has this very song: the same title and the same text (a repeated title alone is allowed) */
export function alreadyHave(song: { title: string; body: string }, saved: readonly Pick<Song, 'title' | 'body'>[]): boolean {
    const title = song.title.trim().toLowerCase();
    const body = song.body.trim();

    return title !== '' && saved.some((other) => other.title.trim().toLowerCase() === title && other.body.trim() === body);
}

/** One row of the review, as far as saving goes */
export interface RowState {
    included: boolean;
    title: string;
}

/** What the foot of the review says and whether it lets the person save */
export function footOf(rows: readonly RowState[]): { message: string; canSave: boolean; saving: number } {
    const included = rows.filter((row) => row.included);
    const untitled = included.filter((row) => row.title.trim() === '').length;
    if (included.length === 0) {
        return { message: 'Marca al menos un canto', canSave: false, saving: 0 };
    }
    if (untitled > 0) {
        return {
            message: `Falta el título de ${untitled} ${untitled === 1 ? 'canto' : 'cantos'}`,
            canSave: false,
            saving: included.length,
        };
    }

    return { message: '', canSave: true, saving: included.length };
}
