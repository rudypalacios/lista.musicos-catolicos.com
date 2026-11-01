import type { App } from './app.ts';
import { transposeBody } from './chordpro/transpose-body.ts';
import type { Song } from './data/types.ts';
import { nearestShift } from './keys.ts';
import { todayKeys } from './today-keys.ts';

/**
 * The keys of today (kept on this device) of the uses of a song whose written key moved by `moved` semitones: they
 * move the other way, like the saved ones, so what is sung does not change.
 */
export function retuneTodayKeys(touched: readonly { setlistId: string; itemId: string }[], moved: number): void {
    for (const { setlistId, itemId } of touched) {
        const today = todayKeys.get(setlistId, itemId);
        if (today !== null) {
            todayKeys.set(setlistId, itemId, nearestShift(today - moved));
        }
    }
}

/**
 * Writes the key on screen as the key the song is written in: every chord moves by `by` semitones (the shift on
 * screen, from the written key) and the keys people sing it in (the person's own and each use in a list) move the
 * other way, so every list keeps sounding as it did. A move of 0 leaves the text alone.
 *
 * It is the same compensation as editing the chart does (`App.updateKeepingKeys`); the caller then decides
 * what the song is sung at where it was changed (the list it was sung in, or the person's own key), which is
 * normally 0: the key on screen is now the written one.
 */
export async function writeKeyToSong(app: App, song: Song, by: number): Promise<Song> {
    if (by === 0) {
        return song;
    }
    const { song: written, touched } = await app.updateKeepingKeys(
        song.id,
        { title: song.title, author: song.author, body: transposeBody(song.body, by) },
        by,
    );
    retuneTodayKeys(touched, by);

    return written;
}
