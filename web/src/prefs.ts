/**
 * Preferences of this device (localStorage, which may be blocked: then they last for the visit).
 * Notation uses the same key as the public site, so the habit carries over.
 */
import type { Notation } from './chordpro/chord.ts';
import type { ColumnMode } from './fit.ts';

const NOTATION = 'mc-notacion';
const FIT = 'lista:ajuste';

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage blocked (private mode): the choice lasts for this visit
    }
}

/** Latin (Do, Re, Mi) unless the person chose English (C, D, E) */
export function readNotation(): Notation {
    return read(NOTATION) === 'en' ? 'english' : 'latin';
}

export function saveNotation(notation: Notation): void {
    write(NOTATION, notation === 'english' ? 'en' : 'lat');
}

/** "Ajustar a la pantalla": on by default, per device (a tablet on a stand wants it, a phone may not) */
export function readFit(): boolean {
    return read(FIT) !== 'no';
}

export function saveFit(on: boolean): void {
    write(FIT, on ? 'si' : 'no');
}

const CHORDS = 'lista:acordes';

/** Whether the chords are drawn over the lyrics (a visitor of a shared list can turn them off): on unless the person said no */
export function readChords(): boolean {
    return read(CHORDS) !== 'no';
}

export function saveChords(on: boolean): void {
    write(CHORDS, on ? 'si' : 'no');
}

const COLUMNS = 'lista:columnas';

/** Columns on a wide screen: "auto" (as the song needs), one, or two */
export function readColumns(): ColumnMode {
    const value = read(COLUMNS);

    return value === 'una' ? 'one' : value === 'dos' ? 'two' : 'auto';
}

export function saveColumns(mode: ColumnMode): void {
    write(COLUMNS, mode === 'one' ? 'una' : mode === 'two' ? 'dos' : 'auto');
}

const LYRIC_COLOR = 'lista:color-letra';

/** The id of the lyric colour chosen (settings.ts), or null for the default */
export function readLyricColor(): string | null {
    return read(LYRIC_COLOR);
}

export function saveLyricColor(id: string): void {
    write(LYRIC_COLOR, id);
}

/**
 * The lyric size (A− / A+ and the pinch) is each song's own on this device (the owner's decision, 2026-11-15): the
 * letters a phone needs are not the ones a tablet on a stand needs, but a song reads the same wherever it is
 * opened on one device (the library, any list, a shared link). One entry per song, and only the songs that were
 * changed: 0 steps is no entry.
 */
const LYRIC_SIZES = 'lista:tamano-por-canto';

/** The sizes stored, by song id, in steps (1px each); anything that is not a whole number is left out */
export function parseLyricSizes(raw: string | null): Record<string, number> {
    if (raw === null) {
        return {};
    }
    try {
        const stored: unknown = JSON.parse(raw);
        if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
            return {};
        }

        return Object.fromEntries(Object.entries(stored).filter(([, steps]) => Number.isInteger(steps) && steps !== 0));
    } catch {
        return {};
    }
}

/** How many steps (1px each) the song's lyrics are away from their size (0 when never changed); the caller clamps it */
export function readLyricSize(songId: string): number {
    return parseLyricSizes(read(LYRIC_SIZES))[songId] ?? 0;
}

export function saveLyricSize(songId: string, steps: number): void {
    const sizes = parseLyricSizes(read(LYRIC_SIZES));
    if (steps === 0) {
        delete sizes[songId];
    } else {
        sizes[songId] = steps;
    }
    write(LYRIC_SIZES, JSON.stringify(sizes));
}

const KEEP_AWAKE = 'lista:pantalla-encendida';

/** Keep the screen on while a song is open: on by default (a tablet on a stand must not go dark) */
export function readKeepAwake(): boolean {
    return read(KEEP_AWAKE) !== 'no';
}

export function saveKeepAwake(on: boolean): void {
    write(KEEP_AWAKE, on ? 'si' : 'no');
}
