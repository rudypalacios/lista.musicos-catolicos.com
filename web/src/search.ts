import { plain } from './mass.ts';
import type { Song } from './data/types.ts';

/** The songs whose title or author contain every word typed, ignoring accents and case */
export function filterSongs(songs: readonly Song[], query: string): Song[] {
    const words = plain(query).split(' ').filter((word) => word !== '');
    if (words.length === 0) {
        return [...songs];
    }

    return songs.filter((song) => {
        const haystack = plain(`${song.title} ${song.author}`);

        return words.every((word) => haystack.includes(word));
    });
}
