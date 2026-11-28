/**
 * What the person takes with them ("Descargar mis cantos"): a `.zip` with one text file per song (ChordPro, with its chords, so it
 * opens anywhere and the importer reads it back) and one `listados.txt` with every list in the order of the Mass, each song in the
 * key it has there. It is made on the device from what it holds, so it works with no connection. Pure: the download itself is
 * `download.ts`.
 */
import type { Notation } from './chordpro/chord.ts';
import { transpose } from './chordpro/chord.ts';
import { parse, songKey } from './chordpro/parser.ts';
import { itemsOfPart, visibleParts } from './data/setlists.ts';
import type { Setlist, Song } from './data/types.ts';

export interface ExportFile {
    /** With its folder: `cantos/Aleluya.txt` */
    readonly name: string;
    readonly text: string;
}

/** What Windows, macOS and the zip format do not accept in a file name, and what only confuses ("../") */
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

/** A song's title as a file name: no forbidden characters, no dots at the ends, not too long, never empty */
export function fileNameOf(title: string): string {
    const clean = title
        .replace(FORBIDDEN, ' ')
        // A word of only dots ("..") is how a path climbs: it is not part of a title
        .replace(/(^|\s)\.+(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        .trim()
        .slice(0, 80)
        .trim();

    return clean === '' ? 'Canto sin título' : clean;
}

/** One ChordPro file for a song: its title and author as directives, then the text as it is written */
export function songText(song: Pick<Song, 'title' | 'author' | 'body'>): string {
    const head = [`{title: ${song.title}}`, ...(song.author.trim() === '' ? [] : [`{artist: ${song.author.trim()}}`])];

    return `${head.join('\n')}\n\n${song.body.replace(/\s+$/, '')}\n`;
}

/** The key of this use of a song in a list: its own key moved by the list's change, or only the change when the song has no key */
function keyText(song: Song, shift: number, notation: Notation): string {
    const original = songKey(parse(song.body));
    if (original === null) {
        return shift === 0 ? '' : `${shift > 0 ? '+' : ''}${shift}`;
    }

    return transpose(original, shift, notation);
}

/** Every list, written out: title, then its sections in order with their songs, the key of each and the note if it has one */
export function listsText(songs: readonly Song[], lists: readonly Setlist[], notation: Notation): string {
    const byId = new Map(songs.map((song) => [song.id, song]));
    const blocks = lists.map((list) => {
        const lines = [list.title.trim() === '' ? 'Listado sin título' : list.title.trim(), '='.repeat(Math.max(3, Math.min(list.title.length, 60)))];
        if (list.notes.trim() !== '') {
            lines.push(list.notes.trim());
        }
        for (const part of visibleParts(list)) {
            const items = itemsOfPart(list.items, part.id);
            if (items.length === 0) {
                continue;
            }
            lines.push('', part.name);
            items.forEach((item, index) => {
                const song = byId.get(item.songId);
                const key = song === undefined ? '' : keyText(song, item.transpose, notation);
                const note = item.note.trim() === '' ? '' : ` (${item.note.trim()})`;
                lines.push(`  ${index + 1}. ${song?.title ?? 'Canto eliminado'}${key === '' ? '' : ` — ${key}`}${note}`);
            });
        }

        return lines.join('\n');
    });

    return `${blocks.join('\n\n\n')}\n`;
}

/** The files of the copy: `cantos/<title>.txt` for each song (two with one title get "(2)") and `listados.txt` when there are lists */
export function libraryFiles(songs: readonly Song[], lists: readonly Setlist[], notation: Notation): ExportFile[] {
    const taken = new Set<string>();
    const files: ExportFile[] = songs.map((song) => {
        const base = fileNameOf(song.title);
        let name = base;
        for (let n = 2; taken.has(name.toLowerCase()); n++) {
            name = `${base} (${n})`;
        }
        taken.add(name.toLowerCase());

        return { name: `cantos/${name}.txt`, text: songText(song) };
    });
    if (lists.length > 0) {
        files.push({ name: 'listados.txt', text: listsText(songs, lists, notation) });
    }

    return files;
}

/** Whether there is anything to take: a copy of nothing would be a trap */
export function hasLibrary(songs: readonly Song[], lists: readonly Setlist[]): boolean {
    return songs.length > 0 || lists.length > 0;
}
