import type { PrintVersion } from './layout.ts';
import type { Setlist, Song } from '../data/types.ts';
import { readNotation } from '../prefs.ts';
import { todayKeys } from '../today-keys.ts';
import { listPlans, planSheet } from './plan.ts';
import { printPlans } from './print.ts';

/**
 * Prints one song, in the key `shift` (semitones from its own): the one on screen or in its list. The saved
 * PDF is called as the song. Call it straight from the tap: a browser may refuse to print from anything later.
 */
export function printSong(song: Song, version: PrintVersion, shift: number, part?: string): Promise<void> {
    return printPlans([planSheet(song, { version, shift, notation: readNotation(), ...(part !== undefined ? { part } : {}) })], song.title);
}

/**
 * Prints a whole list, each song in the key it is seen in (a key of today, if the person set one, over the saved one).
 * The saved PDF is called as the list.
 */
export function printList(list: Setlist, songs: ReadonlyMap<string, Song>, version: PrintVersion): Promise<void> {
    const plans = listPlans(list, songs, {
        version,
        notation: readNotation(),
        shiftOf: (item) => todayKeys.get(list.id, item.id) ?? item.transpose,
    });

    return printPlans(plans, list.title);
}
