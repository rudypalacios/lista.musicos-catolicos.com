import { parse } from './chordpro/parser.ts';
import { plain } from './mass.ts';
import type { Setlist, Song } from './data/types.ts';

/** How many lines of the lyrics a row shows to tell one song from another */
export const SNIPPET_LINES = 2;

interface Indexed {
    /** Title and author, as compared */
    head: string;
    /** The sung lines of the song, without chords, section labels or annotations */
    lines: string[];
    /** Each of `lines`, as compared */
    plainLines: string[];
}

/** A song object is replaced when it is edited, so what was read from it stays right while it lives */
const indexes = new WeakMap<Song, Indexed>();

function indexOf(song: Song): Indexed {
    let found = indexes.get(song);
    if (found === undefined) {
        const lines = parse(song.body).sections
            .flatMap((section) => section.lines)
            .flatMap((line) => (typeof line === 'string' ? [] : [line.map((segment) => segment.text).join('').replace(/\s+/g, ' ').trim()]))
            .filter((line) => line !== '');
        found = { head: plain(`${song.title} ${song.author}`), lines, plainLines: lines.map(plain) };
        indexes.set(song, found);
    }

    return found;
}

const wordsOf = (query: string): string[] => plain(query).split(' ').filter((word) => word !== '');

/**
 * The songs that have every word typed, ignoring accents and case, in the title, the author or the
 * lyrics (the words may be on different lines). Those with the words in the title or the author come
 * first; the ones found only in the lyrics follow, each group in the order it came in.
 */
export function filterSongs(songs: readonly Song[], query: string): Song[] {
    const words = wordsOf(query);
    if (words.length === 0) {
        return [...songs];
    }
    const inHead: Song[] = [];
    const inLyrics: Song[] = [];
    for (const song of songs) {
        const { head, plainLines } = indexOf(song);
        if (words.every((word) => head.includes(word))) {
            inHead.push(song);
        } else if (words.every((word) => (head + ' ' + plainLines.join(' ')).includes(word))) {
            inLyrics.push(song);
        }
    }

    return [...inHead, ...inLyrics];
}

/** Whether the search found this song through its lyrics only (the title and author do not have the words) */
export function foundInLyricsOnly(song: Song, query: string): boolean {
    const words = wordsOf(query);

    return words.length > 0 && !words.every((word) => indexOf(song).head.includes(word));
}

/**
 * A few lines of the lyrics to tell a song from another by. Those where the search matched when the
 * song was found through its lyrics; the beginning of the song otherwise.
 */
export function songSnippet(song: Song, query: string, count = SNIPPET_LINES): string[] {
    const { lines, plainLines } = indexOf(song);
    const words = wordsOf(query);
    let start = 0;
    if (foundInLyricsOnly(song, query)) {
        // The line with the most of the words, the first one when it ties
        let best = 0;
        plainLines.forEach((line, index) => {
            const hits = words.filter((word) => line.includes(word)).length;
            if (hits > best) {
                best = hits;
                start = index;
            }
        });
    }

    return lines.slice(start, start + count);
}

/** The lists whose title contains every word typed, ignoring accents and case */
export function filterSetlists(lists: readonly Setlist[], query: string): Setlist[] {
    const words = plain(query).split(' ').filter((word) => word !== '');
    if (words.length === 0) {
        return [...lists];
    }

    return lists.filter((list) => {
        const haystack = plain(list.title);

        return words.every((word) => haystack.includes(word));
    });
}
