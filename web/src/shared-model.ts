/**
 * A list as a visitor reads it (GET /api/shared/:code): the order the songs are in, how they group under their sections,
 * the key each is in and the words for the counts and the date. Pure, so it is tested without a screen.
 */
import { transpose, type Notation } from './chordpro/chord.ts';
import { parse, songKey } from './chordpro/parser.ts';
import type { Song } from './data/types.ts';

export interface SharedSong {
    id: string;
    title: string;
    author: string;
    /** The lyrics in ChordPro; missing when the person shared only the order */
    body?: string;
}

export interface SharedItem {
    id: string;
    part: string;
    songId: string;
    /** Semitones from the song's own key: the key the list has it in */
    transpose: number;
}

export interface SharedList {
    title: string;
    withLyrics: boolean;
    /** Epoch ms of the latest change in the list or in one of its songs */
    updatedAt: number;
    parts: { id: string; name: string }[];
    items: SharedItem[];
    songs: SharedSong[];
}

/** A song of the list, in its place */
export interface Row {
    /** Where it stands in the list, from 1 (the number of its address) */
    n: number;
    part: { id: string; name: string };
    song: SharedSong;
    item: SharedItem;
}

/** The songs in the order of the list: by section, and inside a section in the order they were added */
export function readingOrder(list: SharedList): Row[] {
    const songs = new Map(list.songs.map((song) => [song.id, song]));
    const rows: Omit<Row, 'n'>[] = [];
    for (const part of list.parts) {
        for (const item of list.items) {
            const song = songs.get(item.songId);
            if (item.part === part.id && song !== undefined) {
                rows.push({ part, song, item });
            }
        }
    }

    return rows.map((row, index) => ({ ...row, n: index + 1 }));
}

/** The rows under their sections, in order; a section with no song is left out (a visitor has no use for an empty one) */
export function bySection(rows: readonly Row[]): { part: { id: string; name: string }; rows: Row[] }[] {
    const groups: { part: { id: string; name: string }; rows: Row[] }[] = [];
    for (const row of rows) {
        const last = groups[groups.length - 1];
        if (last !== undefined && last.part.id === row.part.id) {
            last.rows.push(row);
        } else {
            groups.push({ part: row.part, rows: [row] });
        }
    }

    return groups;
}

/** The key a song is in, in the notation shown; null when the song has none or the lyrics were not shared */
export function keyOf(song: SharedSong, shift: number, notation: Notation): string | null {
    if (song.body === undefined) {
        return null;
    }
    const written = songKey(parse(song.body));

    return written === null ? null : transpose(written, shift, notation);
}

/** The song as the app's printing wants it (the visitor keeps nothing: the rest is empty) */
export function asSong(song: SharedSong, updatedAt: number): Song {
    return { id: song.id, title: song.title, author: song.author, body: song.body ?? '', tags: [], myShift: 0, updatedAt, deletedAt: null };
}

export function countLabel(count: number): string {
    return count === 1 ? '1 canto' : `${count} cantos`;
}

/** "31 de octubre": when the list last changed, by the visitor's clock */
export function updatedLabel(updatedAt: number): string {
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(updatedAt));
}

/**
 * What the page says when it shows the copy kept on the device and not the list at the server: the first words are the
 * reason (no connection, or the server did not answer) and the rest says how old the copy is.
 */
export function copyNote(offline: boolean, savedAt: number): { lead: string; rest: string } {
    return {
        lead: offline ? 'Sin conexión.' : 'No se pudo actualizar.',
        rest: ` Estás leyendo la copia guardada el ${updatedLabel(savedAt)}.`,
    };
}
